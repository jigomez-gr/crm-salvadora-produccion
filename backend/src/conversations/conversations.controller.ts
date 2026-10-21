import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
  Ip,
  Logger,
  NotFoundException,
  Optional,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  forwardRef,
} from '@nestjs/common';
import { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { MessagesService, toMessageView } from './messages.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../auth/current-user.decorator';
import { AgentsConfigService } from '../agents/agents-config.service';
import { YCloudClient } from '../whatsapp/ycloud-client.service';
import { WhatsappGatewayService } from '../whatsapp/whatsapp-gateway.service';
import { WhatsappAdminSendService } from '../whatsapp/whatsapp-admin-send.service';
import { RawUploadedFile } from '../whatsapp/whatsapp-attachment-validator';
import {
  SetHandoffDto,
  SendManualMessageDto,
  ReplyEmailDto,
  QueryThreadsDto,
} from './dto/conversation.dto';
import {
  MessageChannel,
  MessageDirection,
  MessageStatus,
} from '../common/entities/message.entity';
import { EmailService } from '../email/email.service';
import { ContactsService } from '../contacts/contacts.service';

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
    private readonly emailService: EmailService,
    private readonly contactsService: ContactsService,
    @Optional() private readonly whatsappGateway?: WhatsappGatewayService,
    @Optional()
    private readonly whatsappAdminSendService?: WhatsappAdminSendService,
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
          ? { name: t.contact.name, phone: t.contact.phone, email: t.contact.email }
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
      let bytes: Buffer;
      let upstreamContentType: string | null = null;
      if (this.whatsappGateway) {
        const mediaRes = await this.whatsappGateway.fetchInboundMedia({
          config,
          mediaUrl: message.mediaUrl,
          signal: controller.signal,
        });
        bytes = mediaRes.buffer;
        upstreamContentType = mediaRes.contentType;
      } else {
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
        bytes = Buffer.from(await upstream.arrayBuffer());
        upstreamContentType = upstream.headers.get('content-type');
      }
      res.setHeader(
        'Content-Type',
        message.mediaMimeType ||
          upstreamContentType ||
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
   * Operator sends a manual reply on a thread (WhatsApp with optional attachment, or Email).
   */
  @Post(':threadId/messages')
  @UseInterceptors(FileInterceptor('file'))
  async sendManual(
    @Param('threadId') threadId: string,
    @Body() dto: SendManualMessageDto,
    @UploadedFile() file?: RawUploadedFile,
    @CurrentUser() actor?: AuthUser,
    @Ip() ip?: string,
  ) {
    const conv = await this.messagesService.getConversation(threadId);
    if (!conv) throw new NotFoundException('Conversación no encontrada');

    const isEmailThread =
      conv.channel === MessageChannel.EMAIL ||
      conv.channel === 'email' ||
      threadId.includes(':email:') ||
      threadId.startsWith('email:');

    if (isEmailThread) {
      if (!dto.body?.trim()) {
        throw new BadRequestException('El cuerpo del correo no puede estar vacío');
      }
      return this.replyEmail(threadId, { body: dto.body, subject: dto.subject });
    }

    if (conv.channel !== MessageChannel.WHATSAPP) {
      throw new BadRequestException(
        'Solo se pueden enviar mensajes manuales en conversaciones de WhatsApp o Email',
      );
    }

    const cleanBody = typeof dto.body === 'string' ? dto.body.trim() : '';
    if (!cleanBody && !file) {
      throw new BadRequestException(
        'Debes indicar un mensaje de texto, un archivo adjunto o ambos.',
      );
    }

    // threadId is `agentKey:phone`; the customer phone is everything after the first ':'.
    const to = threadId.slice(threadId.indexOf(':') + 1);

    if (this.whatsappAdminSendService) {
      const res = await this.whatsappAdminSendService.sendManual({
        agentKey: conv.agentKey || 'booking',
        to,
        message: cleanBody || undefined,
        file: file ?? null,
        actor: {
          id: actor?.id ?? null,
          email: actor?.email ?? null,
        },
        ip,
        source: 'admin_ui',
      });

      const lastMsgId = res.messageIds[res.messageIds.length - 1];
      const msg = lastMsgId
        ? await this.messagesService.getMessageById(lastMsgId)
        : null;
      return msg ? toMessageView(msg) : { ok: true, ...res };
    }

    // Fallback if whatsappAdminSendService is not injected (e.g. unit tests):
    const config = await this.agentsConfigService
      .findByKeyOrNull(conv.agentKey)
      .catch(() => null);
    const isEvolution = config?.whatsappProvider === 'evolution';
    const from =
      config?.whatsappNumber ||
      (isEvolution ? config?.evolutionInstanceName : undefined) ||
      process.env.YCLOUD_WHATSAPP_NUMBER;

    const message = await this.messagesService.saveMessage({
      contactId: conv.contactId,
      threadId,
      direction: MessageDirection.OUTBOUND,
      channel: MessageChannel.WHATSAPP,
      body: cleanBody,
      status: MessageStatus.QUEUED,
    });
    await this.messagesService.markRead(threadId);

    const result = this.whatsappGateway
      ? await this.whatsappGateway.sendManualTextMessage({
          config,
          from: from || '',
          to,
          body: cleanBody,
          apiKeyOverride: config?.ycloudApiKey,
        })
      : await this.ycloudClient.sendTextMessage(
          from || '',
          to,
          cleanBody,
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
    }

    const saved = { ...message, status: result.ok ? MessageStatus.SENT : MessageStatus.FAILED };
    const view = toMessageView(saved);
    this.eventEmitter.emit('message.sent', { ...view, threadId: saved.threadId });
    return view;
  }

  /**
   * Operator sends an email reply to an email thread.
   * Sends the email via SMTP, saves the outbound message, marks thread read, and emits real-time events.
   */
  @Post(':threadId/reply-email')
  async replyEmail(
    @Param('threadId') threadId: string,
    @Body() dto: ReplyEmailDto,
  ) {
    const conv = await this.messagesService.getConversation(threadId);
    if (!conv) throw new NotFoundException('Conversación no encontrada');

    let contact = conv.contactId
      ? await this.contactsService.findById(conv.contactId).catch(() => null)
      : null;

    let targetEmail = contact?.email;

    // Fallback: extract from threadId if salvadora:email:user@domain.com
    if (!targetEmail && threadId.includes(':email:')) {
      targetEmail = threadId.split(':email:')[1]?.trim();
    }

    if (!targetEmail) {
      throw new BadRequestException(
        'No se encontró una dirección de correo para responder a este contacto.',
      );
    }

    if (!contact) {
      contact = await this.contactsService.findByPhoneOrEmail(undefined, targetEmail);
      if (contact) {
        await this.messagesService.linkContact(threadId, contact.id);
      }
    }

    if (!contact) {
      contact = await this.contactsService.create({
        name: targetEmail,
        email: targetEmail,
        phone: `+34000${Date.now().toString().slice(-6)}`,
        source: 'email_reply',
      });
      await this.messagesService.linkContact(threadId, contact.id);
    }

    let subject = dto.subject?.trim();
    let body = dto.body?.trim();

    // If body contains ASUNTO: ... CUERPO: ..., parse it cleanly:
    if (!subject && body.includes('ASUNTO:')) {
      const match = body.match(/ASUNTO:\s*([^\n]+)/i);
      if (match) {
        subject = match[1].trim();
      }
      body = body.replace(/^ASUNTO:\s*[^\n]+\n*(CUERPO:\s*)?/i, '').trim();
    }
    if (!subject) {
      subject = 'Re: Consulta — Centro de Yoga Salvadora Conesa';
    }

    // Send email via EmailService (SMTP)
    await this.emailService.send(contact.id, subject, body, 'operador');

    // Persist outbound message in MessagesService
    const message = await this.messagesService.saveMessage({
      contactId: contact.id,
      threadId,
      direction: MessageDirection.OUTBOUND,
      channel: MessageChannel.EMAIL,
      body: body,
      status: MessageStatus.SENT,
    });

    await this.messagesService.markRead(threadId);

    const view = toMessageView(message);
    this.eventEmitter.emit('message.sent', { ...view, threadId });
    this.eventEmitter.emit('conversation.updated', { threadId });

    return view;
  }

  /** `agentKey:phone` → `agentKey` (everything before the first ':'). */
  private agentKeyOf(threadId: string): string {
    const i = threadId.indexOf(':');
    return i === -1 ? threadId : threadId.slice(0, i);
  }
}
