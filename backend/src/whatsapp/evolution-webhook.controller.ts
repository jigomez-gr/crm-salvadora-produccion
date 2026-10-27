import {
  Controller,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  Post,
  Req,
  Res,
  Optional,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { SkipThrottle } from '@nestjs/throttler';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { MessagesService } from '../conversations/messages.service';
import { ContactsService } from '../contacts/contacts.service';
import { AgentRunnerService } from '../agents/agent-runner.service';
import { AgentsConfigService } from '../agents/agents-config.service';
import { WhatsappGatewayService } from './whatsapp-gateway.service';
import { InboundMediaProcessorService } from './inbound-media-processor.service';
import { AgentConfig } from '../common/entities/agent-config.entity';
import {
  MessageChannel,
  MessageStatus,
  MediaType,
} from '../common/entities/message.entity';
import {
  normalizeEvolutionEvent,
  parseEvolutionInboundMessages,
  parseEvolutionStatusUpdates,
  verifyEvolutionInstance,
  verifyEvolutionSecret,
} from './evolution-inbound-parser';

@Controller('webhooks/evolution')
@SkipThrottle()
export class EvolutionWebhookController {
  private readonly logger = new Logger(EvolutionWebhookController.name);

  constructor(
    private readonly messagesService: MessagesService,
    private readonly contactsService: ContactsService,
    private readonly agentRunnerService: AgentRunnerService,
    private readonly agentsConfigService: AgentsConfigService,
    private readonly whatsappGateway: WhatsappGatewayService,
    private readonly eventEmitter: EventEmitter2,
    @Optional() private readonly mediaProcessor?: InboundMediaProcessorService,
  ) {}

  @Post(':agentKey')
  @HttpCode(HttpStatus.OK)
  async handleForAgent(
    @Param('agentKey') agentKey: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    return this.handle(agentKey, undefined, req, res);
  }

  @Post(':agentKey/:event')
  @HttpCode(HttpStatus.OK)
  async handleForAgentEvent(
    @Param('agentKey') agentKey: string,
    @Param('event') event: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    return this.handle(agentKey, event, req, res);
  }

  private async handle(
    agentKey: string,
    routeEvent: string | undefined,
    req: Request,
    res: Response,
  ): Promise<void> {
    const config = await this.agentsConfigService
      .findByKeyOrNull(agentKey)
      .catch(() => null);

    const headerSecret = req.headers['x-evolution-secret'];

    // 1. Fail-closed secret verification
    if (!verifyEvolutionSecret(headerSecret, config?.evolutionWebhookSecret)) {
      if (!config?.evolutionWebhookSecret) {
        this.logger.error(
          `Evolution webhook rejected for '${agentKey}': no evolutionWebhookSecret configured on agent.`,
        );
      } else {
        this.logger.warn(
          `Evolution webhook rejected for '${agentKey}': invalid or missing x-evolution-secret header.`,
        );
      }
      res.sendStatus(401);
      return;
    }

    // 2. Fail-closed instance verification
    if (
      !verifyEvolutionInstance(
        req.body?.instance,
        config?.evolutionInstanceName,
      )
    ) {
      this.logger.warn(
        `Evolution webhook rejected for '${agentKey}': payload instance '${String(req.body?.instance ?? '')}' does not match configured evolutionInstanceName '${String(config?.evolutionInstanceName ?? '')}'.`,
      );
      res.sendStatus(403);
      return;
    }

    // 3. Acknowledge 200 OK immediately and process asynchronously
    res.sendStatus(200);

    this.processWebhook(agentKey, config, req.body, routeEvent).catch((err) => {
      this.logger.error(
        `Evolution webhook processing error for '${agentKey}': ${(err as Error)?.message ?? err}`,
        (err as Error)?.stack,
      );
    });
  }

  async processWebhook(
    agentKey: string,
    config: AgentConfig | null,
    body: Record<string, any>,
    routeEvent?: string,
  ): Promise<void> {
    const eventName = normalizeEvolutionEvent(body?.event, routeEvent);

    if (eventName === 'messages.upsert') {
      return this.processInboundUpsert(agentKey, config, body);
    }

    if (eventName === 'messages.update') {
      return this.processStatusUpdates(body);
    }

    // connection.update and qrcode.updated are ephemeral live events; we do not
    // mutate agent_configs in the database on every reconnect/QR rotation.
  }

  private async processInboundUpsert(
    agentKey: string,
    config: AgentConfig | null,
    body: Record<string, any>,
  ): Promise<void> {
    const messages = parseEvolutionInboundMessages(body);
    if (messages.length === 0) return;

    for (const parsed of messages) {
      const { externalId, from, body: messageBody } = parsed;

      const contact = await this.contactsService.upsertByPhone(
        from,
        undefined,
        {
          source: 'whatsapp',
          tags: ['lead_whatsapp', 'whatsapp'],
        },
      );

      let finalBody = messageBody;
      let finalPrompt = parsed.agentPrompt || messageBody;

      if (parsed.media && this.mediaProcessor) {
        const processed = await this.mediaProcessor.processMedia(
          'evolution',
          parsed.media,
          config,
          parsed.media.type === MediaType.DOCUMENT ? parsed.media.filename : null,
        );
        finalBody = processed.enrichedBody;
        finalPrompt = processed.enrichedAgentPrompt;
      }

      const { reply, outbound } = await this.agentRunnerService.run({
        agentKey,
        message: finalBody,
        agentPrompt: finalPrompt,
        media: parsed.media
          ? {
              mediaType: parsed.media.type,
              mediaUrl: parsed.media.url,
              mediaId: parsed.media.mediaId,
              mediaMimeType: parsed.media.mimeType,
              mediaFilename: parsed.media.filename,
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
        const senderFrom =
          config?.whatsappNumber || config?.evolutionInstanceName || undefined;

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
          await this.messagesService.updateStatus(
            outbound.id,
            MessageStatus.FAILED,
          );
          this.logger.error(
            `Reply to ${from} via Evolution ('${agentKey}') was NOT delivered: ${result.error ?? 'unknown error'}`,
          );
        }

        this.eventEmitter.emit('message.status', {
          id: outbound.id,
          threadId: outbound.threadId,
          status: result.ok ? MessageStatus.SENT : MessageStatus.FAILED,
        });
      }
    }
  }

  private async processStatusUpdates(body: Record<string, any>): Promise<void> {
    const updates = parseEvolutionStatusUpdates(body);
    if (updates.length === 0) return;

    for (const update of updates) {
      await this.messagesService.updateStatusByProviderId(
        update.providerMessageId,
        update.status,
      );
      this.eventEmitter.emit('message.status', {
        providerMessageId: update.providerMessageId,
        status: update.status,
      });
    }
  }
}
