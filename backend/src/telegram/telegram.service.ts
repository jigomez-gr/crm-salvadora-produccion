import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  forwardRef,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AgentConfig } from '../common/entities/agent-config.entity';
import { Contact } from '../common/entities/contact.entity';
import {
  MediaType,
  Message,
  MessageChannel,
  MessageDirection,
  MessageStatus,
} from '../common/entities/message.entity';
import { AgentsConfigService } from '../agents/agents-config.service';
import { ContactsService } from '../contacts/contacts.service';
import { MessagesService, toMessageView } from '../conversations/messages.service';
import {
  TelegramClientService,
  TelegramMediaUpload,
  TelegramSendResult,
} from './telegram-client.service';
import { isTelegramBotToken } from './telegram-inbound-parser';
import { buildTelegramBotDeepLink } from './telegram-link.service';
import { AUDIT_EVENT, AuditAction } from '../audit/audit.types';

export interface TelegramConnectionStatusView {
  agentKey: string;
  connected: boolean;
  enabled: boolean;
  hasToken: boolean;
  hasWebhookSecret: boolean;
  botUsername: string | null;
  botName: string | null;
  botId: string | null;
  botLink: string | null;
  webhookEndpoint: string;
  webhookUrl: string | null;
  webhookConfigured: boolean;
  pendingUpdateCount: number;
  lastError: string | null;
  connectedAt: string | null;
}

export interface SendAutomatedTelegramInput {
  config?: AgentConfig | null;
  agentKey?: string;
  contact: Contact;
  body: string;
}

@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);

  constructor(
    private readonly telegramClient: TelegramClientService,
    @Inject(forwardRef(() => AgentsConfigService))
    private readonly agentsConfigService: AgentsConfigService,
    @Inject(forwardRef(() => ContactsService))
    private readonly contactsService: ContactsService,
    @Inject(forwardRef(() => MessagesService))
    private readonly messagesService: MessagesService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  resolveToken(config?: AgentConfig | null): string | null {
    const token =
      config?.telegramBotToken?.trim() ||
      process.env.TELEGRAM_BOT_TOKEN?.trim() ||
      null;
    return token && isTelegramBotToken(token) ? token : null;
  }

  resolveWebhookSecret(config?: AgentConfig | null): string | null {
    return (
      config?.telegramWebhookSecret?.trim() ||
      process.env.TELEGRAM_WEBHOOK_SECRET?.trim() ||
      null
    );
  }

  resolveWebhookUrl(agentKey: string, fallbackBaseUrl?: string): string {
    const base = (
      process.env.TELEGRAM_WEBHOOK_BASE_URL ||
      process.env.APP_URL ||
      process.env.PUBLIC_URL ||
      process.env.BACKEND_URL ||
      fallbackBaseUrl ||
      'https://crm-salvadoraconesa.jigretera.com'
    )
      .trim()
      .replace(/\/+$/, '');
    return `${base}/api/webhooks/telegram/${encodeURIComponent(agentKey)}`;
  }

  async getConnectionStatus(
    config: AgentConfig,
    fallbackBaseUrl?: string,
  ): Promise<TelegramConnectionStatusView> {
    const token = this.resolveToken(config);
    const secret = this.resolveWebhookSecret(config);
    const webhookEndpoint = `/api/webhooks/telegram/${config.agentKey}`;
    const expectedWebhookUrl = this.resolveWebhookUrl(config.agentKey, fallbackBaseUrl);

    let connected = false;
    let webhookConfigured = false;
    let remoteWebhookUrl: string | null = null;
    let pendingUpdateCount = 0;
    let lastError = config.telegramLastError || null;
    let botUsername = config.telegramBotUsername || null;
    let botName = config.telegramBotName || null;
    let botId = config.telegramBotId || null;

    if (token) {
      const [meRes, whRes] = await Promise.all([
        this.telegramClient.getMe(token),
        this.telegramClient.getWebhookInfo(token),
      ]);

      if (meRes.ok && meRes.bot) {
        connected = true;
        botUsername = meRes.bot.username || botUsername;
        botName = meRes.bot.firstName || botName;
        botId = meRes.bot.id || botId;

        if (
          config.telegramBotUsername !== botUsername ||
          config.telegramBotName !== botName ||
          config.telegramBotId !== botId
        ) {
          config.telegramBotUsername = botUsername;
          config.telegramBotName = botName;
          config.telegramBotId = botId;
          if (!config.telegramConnectedAt) {
            config.telegramConnectedAt = new Date();
          }
          await this.agentsConfigService.saveRaw(config).catch(() => null);
        }
      } else if (meRes.error) {
        lastError = meRes.error;
      }

      if (whRes.ok && whRes.info) {
        remoteWebhookUrl = whRes.info.url || null;
        webhookConfigured = Boolean(remoteWebhookUrl);
        pendingUpdateCount = whRes.info.pendingUpdateCount || 0;
        if (whRes.info.lastErrorMessage) {
          lastError = `Aviso de webhook Telegram: ${whRes.info.lastErrorMessage}`;
        }
      }
    }

    return {
      agentKey: config.agentKey,
      connected,
      enabled: config.telegramEnabled !== false,
      hasToken: Boolean(token),
      hasWebhookSecret: Boolean(secret),
      botUsername,
      botName,
      botId,
      botLink: botUsername ? buildTelegramBotDeepLink(botUsername) : null,
      webhookEndpoint,
      webhookUrl: remoteWebhookUrl || expectedWebhookUrl,
      webhookConfigured,
      pendingUpdateCount,
      lastError,
      connectedAt: config.telegramConnectedAt
        ? new Date(config.telegramConnectedAt).toISOString()
        : null,
    };
  }

  async connectBot(
    agentKey: string,
    input: {
      botToken?: string;
      webhookSecret?: string;
      enabled?: boolean;
      webhookBaseUrl?: string;
    },
    fallbackBaseUrl?: string,
  ): Promise<TelegramConnectionStatusView> {
    const config = await this.agentsConfigService.findByKey(agentKey);

    const tokenToUse = input.botToken?.trim() || this.resolveToken(config);
    if (!tokenToUse || !isTelegramBotToken(tokenToUse)) {
      throw new BadRequestException(
        'Introduce un token válido de @BotFather (formato: 123456789:ABC-DEF...).',
      );
    }

    const meRes = await this.telegramClient.getMe(tokenToUse);
    if (!meRes.ok || !meRes.bot) {
      config.telegramLastError = meRes.error || 'Token inválido.';
      await this.agentsConfigService.saveRaw(config).catch(() => null);
      throw new BadRequestException(
        meRes.error || 'No se pudo verificar el token con Telegram Bot API.',
      );
    }

    let secretToUse =
      input.webhookSecret?.trim() ||
      config.telegramWebhookSecret?.trim() ||
      crypto.randomBytes(24).toString('base64url');

    // Telegram requires secret_token to be 1-256 chars of A-Z, a-z, 0-9, _ and -
    secretToUse = secretToUse.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 128);
    if (!secretToUse) {
      secretToUse = crypto.randomBytes(24).toString('base64url');
    }

    config.telegramBotToken = tokenToUse;
    config.telegramWebhookSecret = secretToUse;
    config.telegramBotUsername = meRes.bot.username;
    config.telegramBotName = meRes.bot.firstName;
    config.telegramBotId = meRes.bot.id;
    config.telegramConnectedAt = new Date();
    if (input.enabled !== undefined) {
      config.telegramEnabled = Boolean(input.enabled);
    } else if (config.telegramEnabled === undefined || config.telegramEnabled === null) {
      config.telegramEnabled = true;
    }

    const effectiveBase = input.webhookBaseUrl?.trim() || fallbackBaseUrl;
    const webhookUrl = this.resolveWebhookUrl(agentKey, effectiveBase);

    if (webhookUrl.startsWith('https://')) {
      const whRes = await this.telegramClient.setWebhook(
        tokenToUse,
        webhookUrl,
        secretToUse,
      );
      if (!whRes.ok) {
        config.telegramLastError = whRes.error || 'No se pudo registrar el webhook HTTPS.';
      } else {
        config.telegramLastError = null;
      }
    } else {
      config.telegramLastError =
        'Bot verificado. Nota: Telegram exige una URL HTTPS pública para registrar el webhook automáticamente.';
    }

    await this.agentsConfigService.saveRaw(config);

    this.eventEmitter.emit(AUDIT_EVENT, {
      actor: { id: null, email: null },
      action: AuditAction.SETTINGS_UPDATE,
      summary: `Conectó el bot de Telegram @${meRes.bot.username} al agente '${agentKey}'`,
      targetType: 'agent',
      targetId: agentKey,
    });

    return this.getConnectionStatus(config, effectiveBase);
  }

  async configureWebhook(
    agentKey: string,
    webhookBaseUrl?: string,
    fallbackBaseUrl?: string,
  ): Promise<TelegramConnectionStatusView> {
    const config = await this.agentsConfigService.findByKey(agentKey);
    const token = this.resolveToken(config);
    if (!token) {
      throw new BadRequestException(
        'Primero debes guardar un token válido del bot de Telegram.',
      );
    }

    let secret = this.resolveWebhookSecret(config);
    if (!secret) {
      secret = crypto.randomBytes(24).toString('base64url');
      config.telegramWebhookSecret = secret;
    }

    const effectiveBase = webhookBaseUrl?.trim() || fallbackBaseUrl;
    const webhookUrl = this.resolveWebhookUrl(agentKey, effectiveBase);
    if (!webhookUrl.startsWith('https://')) {
      throw new BadRequestException(
        `Telegram requiere que la URL del webhook sea HTTPS (${webhookUrl}).`,
      );
    }

    const whRes = await this.telegramClient.setWebhook(token, webhookUrl, secret);
    if (!whRes.ok) {
      config.telegramLastError = whRes.error || 'Fallo al registrar el webhook en Telegram.';
      await this.agentsConfigService.saveRaw(config);
      throw new BadRequestException(config.telegramLastError);
    }

    config.telegramLastError = null;
    await this.agentsConfigService.saveRaw(config);
    return this.getConnectionStatus(config, effectiveBase);
  }

  async toggleEnabled(
    agentKey: string,
    enabled: boolean,
    fallbackBaseUrl?: string,
  ): Promise<TelegramConnectionStatusView> {
    const config = await this.agentsConfigService.findByKey(agentKey);
    config.telegramEnabled = Boolean(enabled);
    await this.agentsConfigService.saveRaw(config);
    return this.getConnectionStatus(config, fallbackBaseUrl);
  }

  async disconnectBot(
    agentKey: string,
    fallbackBaseUrl?: string,
  ): Promise<TelegramConnectionStatusView> {
    const config = await this.agentsConfigService.findByKey(agentKey);
    const token = this.resolveToken(config);
    if (token) {
      await this.telegramClient.deleteWebhook(token).catch(() => null);
    }
    config.telegramEnabled = false;
    config.telegramConnectedAt = null;
    config.telegramLastError = null;
    await this.agentsConfigService.saveRaw(config);
    return this.getConnectionStatus(config, fallbackBaseUrl);
  }

  /**
   * Sends an automated notification (appointment confirmation, cancellation,
   * rescheduling, or scheduled reminder) to a contact over Telegram.
   *
   * STRICT MANDATORY GUARD:
   * Never sends any automated message to a contact unless:
   *  1. `contact.conectadotelegram === 'S'`
   *  2. `contact.telegramChatId` is non-empty and valid
   *  3. `!contact.telegramBlocked`, `contact.bloqueado !== 'S'`, `!contact.optedOut`, `!contact.anonymizedAt`
   *  4. The agent's Telegram channel is enabled and has a valid bot token.
   */
  async sendAutomatedTextMessage(
    input: SendAutomatedTelegramInput,
  ): Promise<TelegramSendResult & { skipped?: boolean }> {
    const { contact, body } = input;
    const agentKey = input.config?.agentKey || input.agentKey || 'booking';

    // Mandatory Rule 1: conectadotelegram MUST be 'S'
    if (!contact || contact.conectadotelegram !== 'S') {
      this.logger.log(
        `[Telegram] Skipping automated send to contact ${contact?.id || 'unknown'}: conectadotelegram='${contact?.conectadotelegram || 'N'}' (must be 'S').`,
      );
      return {
        ok: false,
        skipped: true,
        error: "El contacto no tiene conectadotelegram = 'S'.",
      };
    }

    // Mandatory Rule 2: valid telegramChatId
    const chatId = contact.telegramChatId?.trim();
    if (!chatId) {
      this.logger.log(
        `[Telegram] Skipping automated send to contact ${contact.id}: missing telegramChatId.`,
      );
      return {
        ok: false,
        skipped: true,
        error: 'El contacto no dispone de telegram_chat_id válido.',
      };
    }

    // Mandatory Rule 3: not blocked, not opted out, not anonymized
    if (
      contact.telegramBlocked ||
      contact.bloqueado === 'S' ||
      contact.optedOut ||
      contact.anonymizedAt
    ) {
      this.logger.log(
        `[Telegram] Skipping automated send to contact ${contact.id}: blocked or opted-out.`,
      );
      return {
        ok: false,
        skipped: true,
        error: 'El contacto ha bloqueado el bot o tiene las comunicaciones deshabilitadas.',
      };
    }

    const config =
      input.config ??
      (await this.agentsConfigService.findByKeyOrNull(agentKey).catch(() => null));

    if (config && config.telegramEnabled === false) {
      this.logger.log(
        `[Telegram] Skipping automated send: Telegram channel is disabled on agent '${agentKey}'.`,
      );
      return {
        ok: false,
        skipped: true,
        error: 'El canal Telegram está desactivado en Ajustes.',
      };
    }

    const token = this.resolveToken(config);
    if (!token) {
      return {
        ok: false,
        skipped: true,
        error: 'El bot de Telegram no tiene un token configurado.',
      };
    }

    const sendRes = await this.telegramClient.sendTextMessage(token, chatId, body);
    if (!sendRes.ok) {
      if (sendRes.blockedByUser) {
        await this.contactsService
          .setTelegramBlocked(chatId, true)
          .catch(() => null);
      }
      return sendRes;
    }

    // Persist in the contact's Telegram conversation thread so the inbox has full history
    try {
      const threadId = `${agentKey}:telegram:${chatId}`;
      const savedMsg = await this.messagesService.saveMessage({
        contactId: contact.id,
        threadId,
        direction: MessageDirection.OUTBOUND,
        channel: MessageChannel.TELEGRAM,
        body,
        status: MessageStatus.SENT,
        providerMessageId: sendRes.providerMessageId,
      });
      this.eventEmitter.emit('message.sent', {
        ...toMessageView(savedMsg),
        threadId,
      });
    } catch (err) {
      this.logger.debug(`Could not record automated Telegram message in inbox: ${err}`);
    }

    return sendRes;
  }

  /**
   * Sends a manual operator reply (text and/or file attachment) on a Telegram conversation thread.
   */
  async sendManualFromInbox(input: {
    agentKey: string;
    threadId: string;
    chatId: string;
    contactId?: string | null;
    body?: string;
    file?: TelegramMediaUpload | null;
  }): Promise<Message> {
    const config = await this.agentsConfigService
      .findByKeyOrNull(input.agentKey)
      .catch(() => null);
    const token = this.resolveToken(config);
    if (!token) {
      throw new BadRequestException(
        'El bot de Telegram no está configurado. Añade el token en Ajustes → Telegram Bot API.',
      );
    }

    const cleanBody = (input.body || '').trim();
    const file = input.file;
    if (!cleanBody && !file) {
      throw new BadRequestException('Debes indicar un mensaje de texto o adjuntar un archivo.');
    }

    let mediaType: MediaType | null = null;
    let mediaUrl: string | null = null;
    let mediaMimeType: string | null = null;
    let mediaFilename: string | null = null;

    if (file) {
      const mime = (file.mimeType || '').toLowerCase();
      if (mime.startsWith('image/')) mediaType = MediaType.IMAGE;
      else if (mime.startsWith('audio/')) mediaType = MediaType.AUDIO;
      else if (mime.startsWith('video/')) mediaType = MediaType.VIDEO;
      else mediaType = MediaType.DOCUMENT;

      mediaMimeType = file.mimeType || 'application/octet-stream';
      mediaFilename = file.filename || 'adjunto';
      mediaUrl = `data:${mediaMimeType};base64,${file.buffer.toString('base64')}`;
    }

    const displayBody =
      cleanBody ||
      (mediaType === MediaType.IMAGE
        ? '📷 Imagen'
        : mediaType === MediaType.AUDIO
        ? '🎤 Audio'
        : mediaType === MediaType.VIDEO
        ? '🎬 Vídeo'
        : `📄 ${mediaFilename || 'Documento'}`);

    const saved = await this.messagesService.saveMessage({
      contactId: input.contactId ?? undefined,
      threadId: input.threadId,
      direction: MessageDirection.OUTBOUND,
      channel: MessageChannel.TELEGRAM,
      body: displayBody,
      status: MessageStatus.QUEUED,
      mediaType,
      mediaUrl,
      mediaMimeType,
      mediaFilename,
    });

    await this.messagesService.markRead(input.threadId).catch(() => null);

    let sendRes: TelegramSendResult;
    if (file) {
      sendRes = await this.telegramClient.sendMedia(
        token,
        input.chatId,
        file,
        cleanBody || undefined,
      );
    } else {
      sendRes = await this.telegramClient.sendTextMessage(
        token,
        input.chatId,
        cleanBody,
      );
    }

    if (sendRes.ok) {
      await this.messagesService.updateStatus(
        saved.id,
        MessageStatus.SENT,
        sendRes.providerMessageId,
      );
      saved.status = MessageStatus.SENT;
      if (sendRes.providerMessageId) {
        saved.providerMessageId = sendRes.providerMessageId;
      }
    } else {
      await this.messagesService.updateStatus(saved.id, MessageStatus.FAILED);
      saved.status = MessageStatus.FAILED;
      if (sendRes.blockedByUser) {
        await this.contactsService
          .setTelegramBlocked(input.chatId, true)
          .catch(() => null);
      }
    }

    const view = toMessageView(saved);
    this.eventEmitter.emit('message.sent', {
      ...view,
      threadId: saved.threadId,
    });
    this.eventEmitter.emit('conversation.updated', {
      threadId: saved.threadId,
    });

    return saved;
  }

  /**
   * Downloads inbound Telegram media by `file_id` for the authenticated media proxy.
   */
  async fetchInboundMedia(input: {
    config?: AgentConfig | null;
    agentKey?: string;
    fileId: string;
    signal?: AbortSignal;
  }): Promise<{ buffer: Buffer; contentType: string | null }> {
    const config =
      input.config ??
      (await this.agentsConfigService
        .findByKeyOrNull(input.agentKey || 'booking')
        .catch(() => null));
    const token = this.resolveToken(config);
    if (!token) {
      throw new BadRequestException('Token de Telegram no configurado.');
    }
    const res = await this.telegramClient.downloadFileById(
      token,
      input.fileId,
      input.signal,
    );
    if (!res.ok || !res.buffer) {
      throw new BadRequestException(res.error || 'No se pudo descargar el archivo de Telegram.');
    }
    return {
      buffer: res.buffer,
      contentType: res.contentType ?? null,
    };
  }
}
