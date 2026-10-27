import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  Post,
  Query,
  Req,
  Res,
  RawBodyRequest,
} from '@nestjs/common';
import { Request, Response } from 'express';
import * as crypto from 'crypto';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AgentsConfigService } from '../agents/agents-config.service';
import { ContactsService } from '../contacts/contacts.service';
import { MessagesService } from '../conversations/messages.service';
import { AgentRunnerService } from '../agents/agent-runner.service';
import { WhatsappGatewayService } from './whatsapp-gateway.service';
import { InboundMediaProcessorService } from './inbound-media-processor.service';
import { AgentConfig } from '../common/entities/agent-config.entity';
import { MessageChannel, MessageStatus, MediaType } from '../common/entities/message.entity';
import { InboundMedia } from './inbound-parser';

export function verifyMetaSignature(
  rawBody: Buffer | undefined,
  signatureHeader: string | undefined,
  appSecret: string | null | undefined,
): boolean {
  if (!appSecret) return true; // If no app secret configured, allow or log
  if (!rawBody || !signatureHeader) return false;

  const expectedPrefix = 'sha256=';
  if (!signatureHeader.startsWith(expectedPrefix)) return false;

  const signature = signatureHeader.slice(expectedPrefix.length).trim();
  const hmac = crypto.createHmac('sha256', appSecret);
  hmac.update(rawBody);
  const digest = hmac.digest('hex');

  const a = Buffer.from(signature, 'hex');
  const b = Buffer.from(digest, 'hex');
  if (a.length === 0 || a.length !== b.length) return false;

  return crypto.timingSafeEqual(a, b);
}

@Controller('api/webhooks/meta')
export class MetaWebhookController {
  private readonly logger = new Logger(MetaWebhookController.name);

  constructor(
    private readonly agentsConfigService: AgentsConfigService,
    private readonly contactsService: ContactsService,
    private readonly messagesService: MessagesService,
    private readonly agentRunnerService: AgentRunnerService,
    private readonly whatsappGateway: WhatsappGatewayService,
    private readonly mediaProcessor: InboundMediaProcessorService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  @Get()
  verifyDefault(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
    @Res() res: Response,
  ) {
    return this.handleVerify('booking', mode, token, challenge, res);
  }

  @Get(':agentKey')
  verifyAgent(
    @Param('agentKey') agentKey: string,
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
    @Res() res: Response,
  ) {
    return this.handleVerify(agentKey, mode, token, challenge, res);
  }

  private async handleVerify(
    agentKey: string,
    mode: string,
    token: string,
    challenge: string,
    res: Response,
  ) {
    const config = await this.agentsConfigService.findByKeyOrNull(agentKey).catch(() => null);
    const expectedToken = config?.metaVerifyToken || process.env.META_VERIFY_TOKEN;

    if (mode === 'subscribe' && expectedToken && token === expectedToken) {
      this.logger.log(`[Meta Webhook] Verification successful for '${agentKey}'`);
      return res.status(200).send(challenge);
    }

    this.logger.warn(`[Meta Webhook] Verification failed for '${agentKey}'`);
    return res.status(403).send('Forbidden');
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  async handleDefault(
    @Req() req: RawBodyRequest<Request>,
    @Res() res: Response,
  ): Promise<void> {
    return this.handlePost('booking', req, res);
  }

  @Post(':agentKey')
  @HttpCode(HttpStatus.OK)
  async handleAgent(
    @Param('agentKey') agentKey: string,
    @Req() req: RawBodyRequest<Request>,
    @Res() res: Response,
  ): Promise<void> {
    return this.handlePost(agentKey, req, res);
  }

  private async handlePost(
    agentKey: string,
    req: RawBodyRequest<Request>,
    res: Response,
  ): Promise<void> {
    const rawBody = req.rawBody;
    const signature = req.headers['x-hub-signature-256'] as string;

    const config = await this.agentsConfigService.findByKeyOrNull(agentKey).catch(() => null);
    const appSecret = config?.metaAppSecret || process.env.META_APP_SECRET;

    if (appSecret && !verifyMetaSignature(rawBody, signature, appSecret)) {
      this.logger.warn(`[Meta Webhook] Rejected '${agentKey}': signature verification failed`);
      res.sendStatus(401);
      return;
    }

    // Acknowledge immediately to avoid Meta retries
    res.sendStatus(200);

    this.processWebhook(agentKey, config, req.body).catch((err) => {
      this.logger.error(`[Meta Webhook] Error processing for '${agentKey}': ${err.message}`, err.stack);
    });
  }

  private async processWebhook(
    agentKey: string,
    config: AgentConfig | null,
    body: Record<string, any>,
  ): Promise<void> {
    const entries = Array.isArray(body?.entry) ? body.entry : [];

    for (const entry of entries) {
      const changes = Array.isArray(entry?.changes) ? entry.changes : [];
      for (const change of changes) {
        const val = change?.value;
        if (!val) continue;

        // Process message status updates
        if (Array.isArray(val.statuses)) {
          for (const statusObj of val.statuses) {
            await this.handleStatusUpdate(statusObj);
          }
        }

        // Process inbound messages
        if (Array.isArray(val.messages)) {
          for (const msg of val.messages) {
            await this.handleInboundMessage(agentKey, config, msg);
          }
        }
      }
    }
  }

  private async handleStatusUpdate(statusObj: Record<string, any>) {
    const providerMessageId = typeof statusObj?.id === 'string' ? statusObj.id : null;
    const rawStatus = typeof statusObj?.status === 'string' ? statusObj.status.toLowerCase() : null;
    if (!providerMessageId || !rawStatus) return;

    let mapped: MessageStatus | null = null;
    if (rawStatus === 'sent') mapped = MessageStatus.SENT;
    if (rawStatus === 'delivered') mapped = MessageStatus.DELIVERED;
    if (rawStatus === 'read') mapped = MessageStatus.READ;
    if (rawStatus === 'failed') mapped = MessageStatus.FAILED;

    if (mapped) {
      await this.messagesService.updateStatusByProviderId(providerMessageId, mapped);
      this.eventEmitter.emit('message.status', {
        providerMessageId,
        status: mapped,
      });
    }
  }

  private async handleInboundMessage(
    agentKey: string,
    config: AgentConfig | null,
    msg: Record<string, any>,
  ) {
    const externalId = typeof msg.id === 'string' ? msg.id : null;
    const fromRaw = typeof msg.from === 'string' ? msg.from : null;
    if (!externalId || !fromRaw) return;

    const from = fromRaw.startsWith('+') ? fromRaw : `+${fromRaw}`;
    const type = typeof msg.type === 'string' ? msg.type : 'text';

    let messageBody = '';
    let agentPrompt = '';
    let media: InboundMedia | null = null;

    if (type === 'text') {
      messageBody = typeof msg.text?.body === 'string' ? msg.text.body.trim() : '';
      agentPrompt = messageBody;
    } else {
      const payload = msg[type] || {};
      const caption = typeof payload.caption === 'string' ? payload.caption.trim() : null;
      const filename = typeof payload.filename === 'string' ? payload.filename.trim() : null;
      const mediaId = typeof payload.id === 'string' ? payload.id.trim() : null;
      const mimeType = typeof payload.mime_type === 'string' ? payload.mime_type.trim() : 'application/octet-stream';

      let mediaType = MediaType.DOCUMENT;
      if (type === 'audio' || type === 'voice') mediaType = MediaType.AUDIO;
      else if (type === 'video') mediaType = MediaType.VIDEO;
      else if (type === 'image') mediaType = MediaType.IMAGE;

      media = {
        type: mediaType,
        url: null,
        mediaId,
        mimeType,
        filename,
      };

      const processed = await this.mediaProcessor.processMedia('meta', media, config, caption);
      messageBody = processed.enrichedBody;
      agentPrompt = processed.enrichedAgentPrompt;
    }

    if (!messageBody && !agentPrompt) return;

    const contact = await this.contactsService.upsertByPhone(from, undefined, {
      source: 'whatsapp',
      tags: ['lead_whatsapp', 'whatsapp'],
    });

    const { reply, outbound } = await this.agentRunnerService.run({
      agentKey,
      message: messageBody,
      agentPrompt,
      media: media
        ? {
            mediaType: media.type,
            mediaUrl: media.url,
            mediaId: media.mediaId,
            mediaMimeType: media.mimeType,
            mediaFilename: media.filename,
          }
        : undefined,
      threadId: `${agentKey}:${from}`,
      contactId: contact.id,
      phone: from,
      contactName: contact.name,
      channel: MessageChannel.WHATSAPP,
      externalId,
    });

    if (reply && outbound) {
      const senderFrom = config?.whatsappNumber || undefined;
      const result = await this.whatsappGateway.sendAutomatedTextMessage({
        config,
        from: senderFrom,
        to: from,
        body: reply,
      });

      if (result.ok) {
        await this.messagesService.updateStatus(
          outbound.id,
          MessageStatus.SENT,
          result.providerMessageId,
        );
      } else {
        await this.messagesService.updateStatus(outbound.id, MessageStatus.FAILED);
      }

      this.eventEmitter.emit('message.status', {
        id: outbound.id,
        threadId: outbound.threadId,
        status: result.ok ? MessageStatus.SENT : MessageStatus.FAILED,
        providerMessageId: result.providerMessageId,
      });
    }
  }
}
