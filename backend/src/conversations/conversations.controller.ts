import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Logger,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { MessagesService, toMessageView } from './messages.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AgentsConfigService } from '../agents/agents-config.service';
import { YCloudClient } from '../whatsapp/ycloud-client.service';
import {
  SetHandoffDto,
  SendManualMessageDto,
  QueryThreadsDto,
} from './dto/conversation.dto';
import {
  MessageChannel,
  MessageDirection,
  MessageStatus,
} from '../common/entities/message.entity';

// Cap the wait when streaming media from YCloud so a slow/hung upstream can't
// pin a request open. WhatsApp media is small (≤16 MB; 100 MB for documents).
const MEDIA_FETCH_TIMEOUT_MS = 20_000;

// Inbox pagination defaults (the sidebar shows a page of threads at a time).
const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;

@Controller('conversations')
@UseGuards(JwtAuthGuard)
export class ConversationsController {
  private readonly logger = new Logger(ConversationsController.name);

  constructor(
    private readonly messagesService: MessagesService,
    private readonly agentsConfigService: AgentsConfigService,
    private readonly ycloudClient: YCloudClient,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  @Get()
  async listThreads(@Query() query: QueryThreadsDto) {
    const limit = Math.min(query.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
    const offset = query.offset ?? 0;
    const page = await this.messagesService.listThreads({ limit, offset });
    // Frontend Conversation contract, wrapped in the {items,total,limit,offset}
    // pagination envelope (mirrors the contacts/audit lists).
    return {
      items: page.items.map((t) => ({
        threadId: t.threadId,
        channel: t.channel,
        handoff: t.handoff,
        unreadCount: t.unreadCount,
        contact: t.contact
          ? { name: t.contact.name, phone: t.contact.phone }
          : undefined,
        lastMessage: {
          body: t.lastMessage.body,
          direction: t.lastMessage.direction,
          createdAt: t.lastMessage.createdAt ?? new Date().toISOString(),
        },
        lastInboundAt: t.lastInboundAt,
      })),
      total: page.total,
      limit: page.limit,
      offset: page.offset,
    };
  }

  /**
   * Stream an inbound message's media through the server (authenticated —
   * customer photos/voice/documents are PII, never a public URL). The YCloud
   * `mediaUrl` stays server-side; clients only ever get these proxied bytes by
   * message id. Declared before `:threadId/messages` so the static `media`
   * segment isn't captured as a threadId.
   */
  @Get('media/:messageId')
  async getMedia(
    @Param('messageId') messageId: string,
    @Res() res: Response,
  ): Promise<void> {
    const message = await this.messagesService.getMessageById(messageId);
    if (!message?.mediaType || !message.mediaUrl) {
      throw new NotFoundException('Archivo no encontrado');
    }

    // Defensive SSRF guard: only https (YCloud) or data: (demo seed). The URL
    // originates from a signature-verified webhook or the seed, never user
    // input, but validate the scheme anyway — never fetch file:/internal http.
    let scheme: string;
    try {
      scheme = new URL(message.mediaUrl).protocol;
    } catch {
      throw new NotFoundException('Archivo no disponible');
    }
    if (scheme !== 'https:' && scheme !== 'data:') {
      throw new BadRequestException('Origen de archivo no permitido');
    }

    // Attach the agent's YCloud key for https links in case the media endpoint
    // requires it (harmless on a public CDN link; irrelevant for data: URLs).
    const config =
      scheme === 'https:'
        ? await this.agentsConfigService
            .findByKeyOrNull(this.agentKeyOf(message.threadId))
            .catch(() => null)
        : null;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), MEDIA_FETCH_TIMEOUT_MS);
    try {
      const upstream = await fetch(message.mediaUrl, {
        signal: controller.signal,
        headers:
          config?.ycloudApiKey ? { 'X-API-Key': config.ycloudApiKey } : undefined,
      });
      if (!upstream.ok) {
        this.logger.warn(
          `Media fetch for message ${messageId} failed: ${upstream.status}`,
        );
        throw new HttpException(
          'No se pudo obtener el archivo del proveedor',
          HttpStatus.BAD_GATEWAY,
        );
      }
      const bytes = Buffer.from(await upstream.arrayBuffer());
      res.setHeader(
        'Content-Type',
        message.mediaMimeType ||
          upstream.headers.get('content-type') ||
          'application/octet-stream',
      );
      // Private: this is customer PII, not a shared/cacheable asset.
      res.setHeader('Cache-Control', 'private, max-age=300');
      if (message.mediaFilename) {
        // Inline so images/PDF preview in-browser; filename drives the download.
        res.setHeader(
          'Content-Disposition',
          `inline; filename="${encodeURIComponent(message.mediaFilename)}"`,
        );
      }
      res.send(bytes);
    } catch (err) {
      if (err instanceof HttpException) throw err;
      const reason =
        (err as Error)?.name === 'AbortError'
          ? 'timeout'
          : String((err as Error)?.message ?? err);
      this.logger.warn(`Media fetch for message ${messageId} error: ${reason}`);
      throw new HttpException(
        'No se pudo obtener el archivo del proveedor',
        HttpStatus.BAD_GATEWAY,
      );
    } finally {
      clearTimeout(timer);
    }
  }

  @Get(':threadId/messages')
  async getMessages(@Param('threadId') threadId: string) {
    const messages = await this.messagesService.getThreadMessages(threadId);
    // Strip internal/secret fields (mediaUrl, externalId, providerMessageId).
    return messages.map(toMessageView);
  }

  /** Clear the unread badge — the operator has opened this thread. */
  @Post(':threadId/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  async markRead(@Param('threadId') threadId: string) {
    await this.messagesService.markRead(threadId);
    this.eventEmitter.emit('conversation.updated', { threadId });
  }

  /** Toggle human handoff — when on, the agent stops auto-replying here. */
  @Patch(':threadId/handoff')
  async setHandoff(
    @Param('threadId') threadId: string,
    @Body() dto: SetHandoffDto,
  ) {
    const conv = await this.messagesService.setHandoff(threadId, dto.handoff);
    this.eventEmitter.emit('conversation.updated', { threadId });
    return { threadId: conv.threadId, handoff: conv.handoff };
  }

  /**
   * Operator sends a manual WhatsApp reply on a thread (e.g. after taking over
   * via handoff). Free-text is only valid inside WhatsApp's 24h window; outside
   * it the send will fail and the message is marked `failed`.
   */
  @Post(':threadId/messages')
  async sendManual(
    @Param('threadId') threadId: string,
    @Body() dto: SendManualMessageDto,
  ) {
    const conv = await this.messagesService.getConversation(threadId);
    if (!conv) throw new NotFoundException('Conversación no encontrada');
    if (conv.channel !== MessageChannel.WHATSAPP) {
      throw new BadRequestException(
        'Solo se pueden enviar mensajes manuales en conversaciones de WhatsApp',
      );
    }

    // threadId is `agentKey:phone`; the customer phone is everything after the
    // first ':'.
    const to = threadId.slice(threadId.indexOf(':') + 1);
    const config = await this.agentsConfigService
      .findByKeyOrNull(conv.agentKey)
      .catch(() => null);
    const from = config?.whatsappNumber || process.env.YCLOUD_WHATSAPP_NUMBER;
    if (!from) {
      throw new BadRequestException(
        'Este agente no tiene número de WhatsApp configurado',
      );
    }

    // Persist first (queued) so the message shows immediately even if the send
    // is slow, then send and reconcile the status.
    const message = await this.messagesService.saveMessage({
      contactId: conv.contactId,
      threadId,
      direction: MessageDirection.OUTBOUND,
      channel: MessageChannel.WHATSAPP,
      body: dto.body,
      status: MessageStatus.QUEUED,
    });
    // Sending by hand means the operator has seen the thread — clear unread.
    await this.messagesService.markRead(threadId);

    const result = await this.ycloudClient.sendTextMessage(
      from,
      to,
      dto.body,
      config?.ycloudApiKey,
    );
    if (result.ok) {
      await this.messagesService.updateStatus(
        message.id,
        MessageStatus.SENT,
        result.providerMessageId,
      );
    } else {
      await this.messagesService.updateStatus(message.id, MessageStatus.FAILED);
      this.logger.error(
        `Manual reply on '${threadId}' was NOT delivered: ${result.error ?? 'unknown error'}`,
      );
    }

    const saved = { ...message, status: result.ok ? MessageStatus.SENT : MessageStatus.FAILED };
    const view = toMessageView(saved);
    this.eventEmitter.emit('message.sent', { ...view, threadId: saved.threadId });
    return view;
  }

  /** `agentKey:phone` → `agentKey` (everything before the first ':'). */
  private agentKeyOf(threadId: string): string {
    const i = threadId.indexOf(':');
    return i === -1 ? threadId : threadId.slice(0, i);
  }
}
