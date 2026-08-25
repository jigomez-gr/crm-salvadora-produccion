import {
  Controller,
  Post,
  Param,
  Req,
  Res,
  HttpCode,
  HttpStatus,
  Logger,
  RawBodyRequest,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { SkipThrottle } from '@nestjs/throttler';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { MessagesService } from '../conversations/messages.service';
import { ContactsService } from '../contacts/contacts.service';
import { AgentRunnerService } from '../agents/agent-runner.service';
import { AgentsConfigService } from '../agents/agents-config.service';
import { YCloudClient } from './ycloud-client.service';
import { MessageChannel, MessageStatus } from '../common/entities/message.entity';
import { parseInboundMessage } from './inbound-parser';
import { verifyYCloudSignature } from './ycloud-signature';

// YCloud outbound status → our delivery status. Unknown/intermediate values
// (e.g. 'accepted', 'sending') are ignored — we already have queued/sent.
const YCLOUD_STATUS_MAP: Record<string, MessageStatus> = {
  sent: MessageStatus.SENT,
  delivered: MessageStatus.DELIVERED,
  read: MessageStatus.READ,
  failed: MessageStatus.FAILED,
  undelivered: MessageStatus.FAILED,
};

@Controller('webhooks/ycloud')
// Inbound WhatsApp traffic from YCloud can burst (and all arrives from YCloud's
// IPs); it's authenticated by HMAC signature, so exempt it from the per-IP rate
// limit to avoid 429-ing legitimate message deliveries.
@SkipThrottle()
export class YCloudWebhookController {
  private readonly logger = new Logger(YCloudWebhookController.name);

  constructor(
    private readonly messagesService: MessagesService,
    private readonly contactsService: ContactsService,
    private readonly agentRunnerService: AgentRunnerService,
    private readonly agentsConfigService: AgentsConfigService,
    private readonly ycloudClient: YCloudClient,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // Backward-compatible base route → routes to the default seeded 'booking' agent.
  @Post()
  @HttpCode(HttpStatus.OK)
  async handleDefault(
    @Req() req: RawBodyRequest<Request>,
    @Res() res: Response,
  ): Promise<void> {
    return this.handle('booking', req, res);
  }

  // Per-agent route. Each agent's config screen shows its own webhook URL.
  @Post(':agentKey')
  @HttpCode(HttpStatus.OK)
  async handleForAgent(
    @Param('agentKey') agentKey: string,
    @Req() req: RawBodyRequest<Request>,
    @Res() res: Response,
  ): Promise<void> {
    return this.handle(agentKey, req, res);
  }

  private async handle(
    agentKey: string,
    req: RawBodyRequest<Request>,
    res: Response,
  ): Promise<void> {
    const rawBody = req.rawBody;
    const signature = req.headers['ycloud-signature'] as string;

    // Load the agent's config (for its webhook secret + send credentials)
    const config = await this.agentsConfigService
      .findByKeyOrNull(agentKey)
      .catch(() => null);
    const secret = config?.ycloudWebhookSecret || process.env.YCLOUD_WEBHOOK_SECRET;

    if (!verifyYCloudSignature(rawBody, signature, secret)) {
      if (!secret) {
        // Fail closed: a public webhook with no signing secret would accept
        // forged requests from anyone. Reject until a secret is configured
        // (agent config `ycloudWebhookSecret` or YCLOUD_WEBHOOK_SECRET env).
        this.logger.error(
          'YCloud webhook rejected: no signing secret configured (set it on the agent or via YCLOUD_WEBHOOK_SECRET). Refusing unsigned request.',
        );
      } else {
        this.logger.warn(
          `YCloud webhook rejected for '${agentKey}': signature verification failed`,
        );
      }
      res.sendStatus(401);
      return;
    }

    // Respond 200 immediately — YCloud retries on non-2xx
    res.sendStatus(200);

    // Process asynchronously to avoid blocking YCloud retries
    this.processWebhook(agentKey, config, req.body).catch((err) => {
      this.logger.error(`Webhook processing error for '${agentKey}': ${err.message}`, err.stack);
    });
  }

  private async processWebhook(
    agentKey: string,
    config: { ycloudApiKey?: string; whatsappNumber?: string } | null,
    body: any,
  ): Promise<void> {
    // Outbound delivery/read status updates for messages we sent.
    if (body?.type === 'whatsapp.message.updated') {
      return this.processStatusUpdate(body);
    }
    if (body?.type === 'whatsapp.inbound_message.received') {
      return this.processInbound(agentKey, config, body);
    }
    // ignore other event types
  }

  private async processInbound(
    agentKey: string,
    config: { ycloudApiKey?: string; whatsappNumber?: string } | null,
    body: any,
  ): Promise<void> {
    // Parse text OR media (image/audio/video/document/sticker/location/…) into
    // the fields we persist. Returns null when there's nothing actionable.
    const parsed = parseInboundMessage(body?.whatsappInboundMessage);
    if (!parsed) return;

    const { from, externalId, body: messageBody, agentPrompt, media } = parsed;

    // Upsert contact by phone
    const contact = await this.contactsService.upsertByPhone(from);

    // Run agent — persists messages (idempotently, by externalId) and emits SSE
    // events internally. Thread is scoped per agent so the same contact talking
    // to two agents keeps separate conversations. The atomic claim inside run()
    // is the single source of dedupe — no check-then-act here. For media, the
    // stored body is a caption/placeholder while the agent reads `agentPrompt`.
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

    // Send reply via YCloud — number + key from this agent's config, env as fallback
    const whatsappNumber = config?.whatsappNumber || process.env.YCLOUD_WHATSAPP_NUMBER;
    if (whatsappNumber && reply && outbound) {
      const result = await this.ycloudClient.sendTextMessage(
        whatsappNumber,
        from,
        reply,
        config?.ycloudApiKey,
      );
      if (result.ok) {
        // Record provider id + sent status so later status webhooks can be
        // correlated back to this message.
        await this.messagesService.updateStatus(
          outbound.id,
          MessageStatus.SENT,
          result.providerMessageId,
        );
      } else {
        await this.messagesService.updateStatus(outbound.id, MessageStatus.FAILED);
        // Don't swallow delivery failures — the operator needs to know a reply
        // the agent generated never actually reached the customer.
        this.logger.error(
          `Reply to ${from} via '${agentKey}' was NOT delivered: ${result.error ?? 'unknown error'}`,
        );
      }
      this.eventEmitter.emit('message.status', {
        id: outbound.id,
        threadId: outbound.threadId,
        status: result.ok ? MessageStatus.SENT : MessageStatus.FAILED,
      });
    }
  }

  /**
   * Apply an outbound delivery/read status update from YCloud. The message is
   * correlated by the provider id we stored when sending; status never
   * downgrades (handled in MessagesService).
   */
  private async processStatusUpdate(body: any): Promise<void> {
    const msg = body?.whatsappMessage;
    const providerMessageId: string | undefined = msg?.id;
    const rawStatus: string | undefined = msg?.status;
    if (!providerMessageId || !rawStatus) return;

    const status = YCLOUD_STATUS_MAP[rawStatus.toLowerCase()];
    if (!status) return; // intermediate/unknown status — nothing to record

    await this.messagesService.updateStatusByProviderId(providerMessageId, status);
    this.eventEmitter.emit('message.status', { providerMessageId, status });
  }
}
