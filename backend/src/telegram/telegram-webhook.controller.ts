import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Logger,
  Optional,
  Param,
  Post,
  UnauthorizedException,
  forwardRef,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AgentsConfigService } from '../agents/agents-config.service';
import { AgentRunnerService, InboundMediaInput } from '../agents/agent-runner.service';
import { ContactsService } from '../contacts/contacts.service';
import { MessagesService, toMessageView } from '../conversations/messages.service';
import {
  MessageChannel,
  MessageDirection,
  MessageStatus,
} from '../common/entities/message.entity';
import { Contact } from '../common/entities/contact.entity';
import { TelegramClientService } from './telegram-client.service';
import { TelegramLinkService } from './telegram-link.service';
import { TelegramService } from './telegram.service';
import { InboundMediaProcessorService } from '../whatsapp/inbound-media-processor.service';
import { InboundMedia } from '../whatsapp/inbound-parser';
import {
  parseTelegramUpdate,
  TELEGRAM_SECRET_HEADER,
  verifyTelegramWebhookSecret,
} from './telegram-inbound-parser';

@Controller('webhooks/telegram')
@SkipThrottle()
export class TelegramWebhookController {
  private readonly logger = new Logger(TelegramWebhookController.name);

  constructor(
    @Inject(forwardRef(() => AgentsConfigService))
    private readonly agentsConfigService: AgentsConfigService,
    @Inject(forwardRef(() => ContactsService))
    private readonly contactsService: ContactsService,
    @Inject(forwardRef(() => MessagesService))
    private readonly messagesService: MessagesService,
    private readonly telegramClient: TelegramClientService,
    private readonly telegramLinkService: TelegramLinkService,
    private readonly telegramService: TelegramService,
    private readonly eventEmitter: EventEmitter2,
    @Optional()
    @Inject(forwardRef(() => AgentRunnerService))
    private readonly agentRunnerService?: AgentRunnerService,
    @Optional()
    @Inject(forwardRef(() => InboundMediaProcessorService))
    private readonly mediaProcessor?: InboundMediaProcessorService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async handleDefaultWebhook(
    @Body() body: unknown,
    @Headers(TELEGRAM_SECRET_HEADER) secretHeader?: string,
  ) {
    return this.handleAgentWebhook('booking', body, secretHeader);
  }

  @Post(':agentKey')
  @HttpCode(HttpStatus.OK)
  async handleAgentWebhook(
    @Param('agentKey') agentKey: string,
    @Body() body: unknown,
    @Headers(TELEGRAM_SECRET_HEADER) secretHeader?: string,
  ) {
    const config = await this.agentsConfigService
      .findByKeyOrNull(agentKey)
      .catch(() => null);

    // 1. Fail-closed webhook authentication
    const expectedSecret = this.telegramService.resolveWebhookSecret(config);
    if (!verifyTelegramWebhookSecret(secretHeader, expectedSecret)) {
      this.logger.warn(
        `Rejected Telegram webhook for agent '${agentKey}': invalid or missing X-Telegram-Bot-Api-Secret-Token`,
      );
      throw new UnauthorizedException('Invalid Telegram webhook secret');
    }

    const parsed = parseTelegramUpdate(body);
    if (!parsed || parsed.kind === 'ignored') {
      return { ok: true, ignored: true };
    }

    const token = this.telegramService.resolveToken(config);

    // 2. Block / unblock events (my_chat_member)
    if (parsed.kind === 'block_status' && parsed.blockStatus) {
      const { userId, chatId, blocked } = parsed.blockStatus;
      await this.contactsService
        .setTelegramBlocked(userId, blocked)
        .catch(() => null);
      if (chatId !== userId) {
        await this.contactsService
          .setTelegramBlocked(chatId, blocked)
          .catch(() => null);
      }
      this.logger.log(
        `[Telegram] User ${userId} (chat ${chatId}) ${
          blocked ? 'BLOCKED' : 'UNBLOCKED'
        } the bot.`,
      );
      return { ok: true, blockStatusUpdated: true, blocked };
    }

    // 3. Callback query (inline button tap)
    if (parsed.kind === 'callback_query') {
      if (token && parsed.callbackQueryId) {
        await this.telegramClient
          .answerCallbackQuery(token, parsed.callbackQueryId)
          .catch(() => null);
      }
      if (!parsed.sender || !parsed.body) {
        return { ok: true };
      }
    }

    const sender = parsed.sender;
    if (!sender) {
      return { ok: true, ignored: true };
    }

    const threadId = `${agentKey}:telegram:${sender.chatId}`;

    // If user sends /start, ensure human handoff is reset so bot is active
    if (parsed.isStartCommand) {
      await this.messagesService.setHandoff(threadId, false).catch(() => null);
    }

    // 4. Unlink command (/desvincular or /unlink)
    if (parsed.isUnlinkCommand) {
      if (parsed.externalId) {
        const claimed = await this.messagesService.saveInboundOnce({
          threadId,
          direction: MessageDirection.INBOUND,
          channel: MessageChannel.TELEGRAM,
          body: parsed.body || '/desvincular',
          externalId: parsed.externalId,
        });
        if (!claimed) return { ok: true, deduped: true };
        this.eventEmitter.emit('message.received', {
          ...toMessageView(claimed),
          threadId,
        });
      }

      const existing =
        (await this.contactsService.findByTelegramUserId(sender.userId)) ||
        (await this.contactsService.findByTelegramChatId(sender.chatId));

      let replyText =
        'Tu cuenta de Telegram no estaba vinculada a ninguna ficha de contacto en nuestro sistema.';
      if (existing) {
        await this.contactsService.unlinkTelegramFromContact(existing.id);
        replyText =
          '✅ Hemos desvinculado tu cuenta de Telegram de tu ficha del Centro de Yoga y Bienestar Salvadora Conesa. Ya no recibirás confirmaciones ni recordatorios automáticos por este canal. Puedes volver a conectarlo cuando quieras desde salvadoraconesa.es.';
      }

      if (token) {
        const sent = await this.telegramClient.sendTextMessage(
          token,
          sender.chatId,
          replyText,
        );
        const outbound = await this.messagesService.saveMessage({
          contactId: existing?.id,
          threadId,
          direction: MessageDirection.OUTBOUND,
          channel: MessageChannel.TELEGRAM,
          body: replyText,
          status: sent.ok ? MessageStatus.SENT : MessageStatus.FAILED,
          providerMessageId: sent.providerMessageId,
        });
        this.eventEmitter.emit('message.sent', {
          ...toMessageView(outbound),
          threadId,
        });
      }

      return { ok: true, unlinked: Boolean(existing) };
    }

    // 5. Deep-link /start <TOKEN> from the Landing page
    if (parsed.isStartCommand && parsed.startToken) {
      // Resolve contact before claiming so inbound has contactId if valid
      const consumeRes = await this.telegramLinkService.consumeStartToken(
        parsed.startToken,
        sender,
        agentKey,
      );

      const claimed = await this.messagesService.saveInboundOnce({
        contactId: consumeRes.contact?.id,
        threadId,
        direction: MessageDirection.INBOUND,
        channel: MessageChannel.TELEGRAM,
        body: parsed.body || '/start',
        externalId: parsed.externalId,
      });
      if (!claimed) {
        return { ok: true, deduped: true };
      }
      this.eventEmitter.emit('message.received', {
        ...toMessageView(claimed),
        threadId,
      });

      if (consumeRes.status === 'linked' && consumeRes.contact) {
        const serviceHint = consumeRes.serviceName
          ? `\n\nVemos que estabas consultando sobre *${consumeRes.serviceName}*.`
          : '';
        const replyText =
          `✅ ¡Hola ${consumeRes.contact.name}! Tu cuenta de Telegram ha quedado conectada y vinculada correctamente con el Centro de Yoga y Bienestar Salvadora Conesa.${serviceHint}\n\n` +
          `A partir de ahora puedes consultarnos, gestionar tus reservas y recibir confirmaciones y recordatorios por aquí. ¿En qué podemos ayudarte hoy?`;

        let status = MessageStatus.SENT;
        let providerMessageId: string | undefined;
        if (token) {
          const sent = await this.telegramClient.sendTextMessage(
            token,
            sender.chatId,
            replyText,
          );
          status = sent.ok ? MessageStatus.SENT : MessageStatus.FAILED;
          providerMessageId = sent.providerMessageId;
        }

        const outbound = await this.messagesService.saveMessage({
          contactId: consumeRes.contact.id,
          threadId,
          direction: MessageDirection.OUTBOUND,
          channel: MessageChannel.TELEGRAM,
          body: replyText,
          status,
          providerMessageId,
        });
        this.eventEmitter.emit('message.sent', {
          ...toMessageView(outbound),
          threadId,
        });

        return {
          ok: true,
          linked: true,
          contactId: consumeRes.contact.id,
          conectadotelegram: 'S',
        };
      }

      // If token was invalid/expired, check if user is already linked anyway
      const alreadyLinked =
        (await this.contactsService.findByTelegramUserId(sender.userId)) ||
        (await this.contactsService.findByTelegramChatId(sender.chatId));

      if (alreadyLinked) {
        // Anti-spam deduplication: avoid sending multiple greeting repeats if Telegram replayed updates
        const recentMessages = await this.messagesService
          .getRecentMessages(threadId, 5)
          .catch(() => []);
        const hasRecentOutbound = recentMessages.some(
          (m) =>
            m.direction === MessageDirection.OUTBOUND &&
            Date.now() - new Date(m.createdAt).getTime() < 60 * 1000,
        );
        if (hasRecentOutbound) {
          this.logger.log(
            `[Telegram] Skipping duplicate start greeting for already-linked contact ${alreadyLinked.id} on ${threadId}`,
          );
          return { ok: true, deduped: true, alreadyLinked: true };
        }
      }

      const fallbackReply = alreadyLinked
        ? `¡Hola de nuevo, ${alreadyLinked.name}! Tu cuenta de Telegram ya está conectada con el Centro de Yoga y Bienestar Salvadora Conesa. ¿En qué podemos ayudarte hoy?`
        : `¡Hola! Te damos la bienvenida al bot oficial del Centro de Yoga y Bienestar Salvadora Conesa.\n\nEl enlace de vinculación utilizado ha caducado o ya fue usado, pero puedes escribirnos tu consulta directamente por aquí o pulsar «Conectar con Telegram» en salvadoraconesa.es para vincular tu ficha. ¿En qué podemos ayudarte hoy?`;

      if (token) {
        const sent = await this.telegramClient.sendTextMessage(
          token,
          sender.chatId,
          fallbackReply,
        );
        const outbound = await this.messagesService.saveMessage({
          contactId: alreadyLinked?.id,
          threadId,
          direction: MessageDirection.OUTBOUND,
          channel: MessageChannel.TELEGRAM,
          body: fallbackReply,
          status: sent.ok ? MessageStatus.SENT : MessageStatus.FAILED,
          providerMessageId: sent.providerMessageId,
        });
        this.eventEmitter.emit('message.sent', {
          ...toMessageView(outbound),
          threadId,
        });
      }

      return { ok: true, linked: Boolean(alreadyLinked) };
    }

    // 6. Standard message (or bare /start without token)
    let linkedContact: Contact | null =
      (await this.contactsService.findByTelegramUserId(sender.userId)) ||
      (await this.contactsService.findByTelegramChatId(sender.chatId));

    if (linkedContact) {
      // User is already reliably linked to a CRM contact: ensure conectadotelegram = 'S'
      // and refresh chatId/username if needed.
      if (
        linkedContact.conectadotelegram !== 'S' ||
        linkedContact.telegramChatId !== sender.chatId ||
        linkedContact.telegramUserId !== sender.userId ||
        linkedContact.telegramBlocked
      ) {
        linkedContact = await this.contactsService.linkTelegramToContact(
          linkedContact.id,
          {
            userId: sender.userId,
            chatId: sender.chatId,
            username: sender.username,
          },
        );
      }
      await this.messagesService
        .linkContact(threadId, linkedContact.id)
        .catch(() => null);
    } else if (parsed.sharedPhone) {
      // User shared their own verified phone contact card in Telegram
      const contact = await this.contactsService.upsertByPhone(
        parsed.sharedPhone,
        sender.displayName,
        {
          source: 'telegram',
          tags: ['lead_telegram', 'telegram'],
        },
      );
      linkedContact = await this.contactsService.linkTelegramToContact(
        contact.id,
        {
          userId: sender.userId,
          chatId: sender.chatId,
          username: sender.username,
        },
      );
      await this.messagesService
        .linkContact(threadId, linkedContact.id)
        .catch(() => null);
    }

    let finalBody = parsed.body || '';
    let finalPrompt = parsed.agentPrompt || parsed.body || '';

    // Build media reference if the message carries a file
    let mediaInput: InboundMediaInput | undefined;
    if (parsed.media) {
      mediaInput = {
        mediaType: parsed.media.mediaType,
        mediaUrl: `https://api.telegram.org/file/telegram-media/${encodeURIComponent(
          parsed.media.fileId,
        )}`,
        mediaId: parsed.media.fileId,
        mediaMimeType: parsed.media.mimeType,
        mediaFilename: parsed.media.filename,
      };

      if (token) {
        try {
          const dl = await this.telegramClient.downloadFileById(token, parsed.media.fileId);
          if (dl.ok && dl.buffer && this.mediaProcessor) {
            const inboundMedia: InboundMedia = {
              type: parsed.media.mediaType,
              url: mediaInput.mediaUrl,
              mediaId: parsed.media.fileId,
              mimeType: parsed.media.mimeType,
              filename: parsed.media.filename,
              buffer: dl.buffer,
            };
            const processed = await this.mediaProcessor.processMedia(
              'telegram',
              inboundMedia,
              config,
              parsed.body || null,
            );
            finalBody = processed.enrichedBody;
            finalPrompt = processed.enrichedAgentPrompt;
          }
        } catch (err: any) {
          this.logger.warn(`Could not process Telegram inbound media: ${err?.message || err}`);
        }
      }
    }

    // Respect telegramEnabled switch on AgentConfig: if disabled, record inbound but skip AI reply
    if (config && config.telegramEnabled === false) {
      const saved = parsed.externalId
        ? await this.messagesService.saveInboundOnce({
            contactId: linkedContact?.id,
            threadId,
            direction: MessageDirection.INBOUND,
            channel: MessageChannel.TELEGRAM,
            body: finalBody,
            externalId: parsed.externalId,
            ...(mediaInput || {}),
          })
        : await this.messagesService.saveMessage({
            contactId: linkedContact?.id,
            threadId,
            direction: MessageDirection.INBOUND,
            channel: MessageChannel.TELEGRAM,
            body: finalBody,
            ...(mediaInput || {}),
          });
      if (saved) {
        this.eventEmitter.emit('message.received', {
          ...toMessageView(saved),
          threadId,
        });
      }
      return { ok: true, channelDisabled: true };
    }

    if (token) {
      this.telegramClient.sendTyping(token, sender.chatId).catch(() => null);
    }

    if (!this.agentRunnerService) {
      // Fallback when running in Mastra-free test harness: persist inbound only
      const saved = parsed.externalId
        ? await this.messagesService.saveInboundOnce({
            contactId: linkedContact?.id,
            threadId,
            direction: MessageDirection.INBOUND,
            channel: MessageChannel.TELEGRAM,
            body: finalBody,
            externalId: parsed.externalId,
            ...(mediaInput || {}),
          })
        : await this.messagesService.saveMessage({
            contactId: linkedContact?.id,
            threadId,
            direction: MessageDirection.INBOUND,
            channel: MessageChannel.TELEGRAM,
            body: finalBody,
            ...(mediaInput || {}),
          });
      return { ok: true, inboundId: saved?.id ?? null };
    }

    const { reply, outbound } = await this.agentRunnerService.run({
      agentKey,
      message: finalBody,
      agentPrompt: finalPrompt,
      threadId,
      contactId: linkedContact?.id,
      phone: linkedContact?.phone,
      contactName: linkedContact?.name || sender.displayName,
      channel: MessageChannel.TELEGRAM,
      externalId: parsed.externalId,
      media: mediaInput,
    });

    // If the AI agent created/linked a contact during the turn (e.g. via registerContact / bookAppointment)
    // and linked it to `threadId`, check if we can now bind the Telegram identifiers to that contact!
    if (!linkedContact) {
      const updatedConv = await this.messagesService
        .getConversation(threadId)
        .catch(() => null);
      if (updatedConv?.contactId) {
        const threadContact = await this.contactsService
          .findById(updatedConv.contactId)
          .catch(() => null);
        if (
          threadContact &&
          (!threadContact.telegramUserId ||
            threadContact.telegramUserId === sender.userId)
        ) {
          await this.contactsService
            .linkTelegramToContact(threadContact.id, {
              userId: sender.userId,
              chatId: sender.chatId,
              username: sender.username,
            })
            .catch(() => null);
        }
      }
    }

    if (reply && outbound) {
      if (token) {
        const sendRes = await this.telegramClient.sendTextMessage(
          token,
          sender.chatId,
          reply,
        );
        if (sendRes.ok) {
          await this.messagesService.updateStatus(
            outbound.id,
            MessageStatus.SENT,
            sendRes.providerMessageId,
          );
          this.eventEmitter.emit('message.status', {
            id: outbound.id,
            threadId,
            status: MessageStatus.SENT,
          });
        } else {
          await this.messagesService.updateStatus(
            outbound.id,
            MessageStatus.FAILED,
          );
          this.eventEmitter.emit('message.status', {
            id: outbound.id,
            threadId,
            status: MessageStatus.FAILED,
          });
          if (sendRes.blockedByUser) {
            await this.contactsService
              .setTelegramBlocked(sender.chatId, true)
              .catch(() => null);
          }
        }
      } else {
        await this.messagesService.updateStatus(
          outbound.id,
          MessageStatus.FAILED,
        );
      }
    }

    return { ok: true, replied: Boolean(reply) };
  }
}
