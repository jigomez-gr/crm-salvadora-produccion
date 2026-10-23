import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AgentsConfigService } from '../agents/agents-config.service';
import { ContactsService } from '../contacts/contacts.service';
import { MessagesService, toMessageView } from '../conversations/messages.service';
import {
  MessageChannel,
  MessageDirection,
  MessageStatus,
} from '../common/entities/message.entity';
import { normalizePhoneStrict } from '../common/phone';
import { AUDIT_EVENT, AuditAction, AuditActor, AuditRecord } from '../audit/audit.types';
import { WhatsappGatewayService } from './whatsapp-gateway.service';
import {
  RawUploadedFile,
  validateWhatsappAttachment,
  ValidatedWhatsappAttachment,
} from './whatsapp-attachment-validator';

export interface WhatsappManualSendRequest {
  agentKey?: string;
  to: string;
  message?: string;
  file?: RawUploadedFile | null;
  actor: AuditActor;
  ip?: string | null;
  source?: 'admin_ui' | 'cli';
}

export interface WhatsappManualSendResponse {
  ok: true;
  provider: string;
  agentKey: string;
  to: string;
  threadId: string;
  contactId: string;
  status: 'sent';
  providerMessageId: string | null;
  providerMessageIds: string[];
  messageIds: string[];
  filename: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
}

@Injectable()
export class WhatsappAdminSendService {
  private readonly logger = new Logger(WhatsappAdminSendService.name);

  constructor(
    private readonly agentsConfigService: AgentsConfigService,
    private readonly contactsService: ContactsService,
    private readonly messagesService: MessagesService,
    private readonly whatsappGateway: WhatsappGatewayService,
    private readonly events: EventEmitter2,
  ) {}

  private emitAudit(record: AuditRecord): void {
    this.events.emit(AUDIT_EVENT, record);
  }

  /**
   * Executes a manual outbound WhatsApp dispatch (Admin UI or CLI).
   * - Allowed even when global WhatsApp automation is paused (`whatsappAutomationPaused = true`)
   *   and when the conversation is in Human Handoff (`handoff = true`).
   * - Validates phone number in E.164 format.
   * - Strictly validates attachments (.pdf, .docx, .xlsx, .txt, .mp3, .mp4) by extension,
   *   MIME, magic bytes, internal OpenXML ZIP structure, and WHATSAPP_MAX_ATTACHMENT_MB.
   * - When sending text + .mp3, dispatches 1) text message and 2) audio message sequentially,
   *   recording both outbound messages and both providerMessageIds.
   */
  async sendManual(
    req: WhatsappManualSendRequest,
  ): Promise<WhatsappManualSendResponse> {
    const agentKey = (req.agentKey || 'booking').trim() || 'booking';
    const rawTo = (req.to || '').trim();
    if (!rawTo) {
      throw new BadRequestException(
        'El teléfono de destino ("to") es obligatorio.',
      );
    }

    const normalizedTo = normalizePhoneStrict(rawTo);
    const cleanMessage =
      typeof req.message === 'string' ? req.message.trim() : '';

    let validatedFile: ValidatedWhatsappAttachment | null = null;
    if (req.file) {
      validatedFile = validateWhatsappAttachment(req.file);
    }

    if (!cleanMessage && !validatedFile) {
      throw new BadRequestException(
        'Debes indicar un mensaje de texto, un archivo adjunto o ambos.',
      );
    }

    const config = await this.agentsConfigService.findByKey(agentKey);
    const providerType = this.whatsappGateway.resolveProviderType(config);

    const from =
      config.whatsappNumber ||
      (providerType === 'evolution' ? config.evolutionInstanceName : undefined) ||
      process.env.YCLOUD_WHATSAPP_NUMBER ||
      agentKey;

    // 1. Find or create contact by normalized E.164 phone
    const contact = await this.contactsService.upsertByPhone(
      normalizedTo,
      undefined,
      { source: 'whatsapp_manual', tags: ['lead_whatsapp', 'whatsapp'] },
    );

    // 2. Reuse or create conversation threadId = `${agentKey}:${normalizedTo}`
    const threadId = `${config.agentKey}:${normalizedTo}`;
    await this.messagesService.linkContact(threadId, contact.id);

    const providerMessageIds: string[] = [];
    const messageIds: string[] = [];

    // Case A: Text only
    if (!validatedFile && cleanMessage) {
      const queuedMsg = await this.messagesService.saveMessage({
        contactId: contact.id,
        threadId,
        direction: MessageDirection.OUTBOUND,
        channel: MessageChannel.WHATSAPP,
        body: cleanMessage,
        status: MessageStatus.QUEUED,
      });
      messageIds.push(queuedMsg.id);

      const res = await this.whatsappGateway.sendManualTextMessage({
        config,
        from,
        to: normalizedTo,
        body: cleanMessage,
        apiKeyOverride: config.ycloudApiKey,
      });

      if (!res.ok) {
        await this.messagesService.updateStatus(
          queuedMsg.id,
          MessageStatus.FAILED,
        );
        this.emitSentEvent({
          ...queuedMsg,
          status: MessageStatus.FAILED,
        });
        throw new BadGatewayException(
          res.error || 'Error enviando mensaje de texto por WhatsApp.',
        );
      }

      if (res.providerMessageId) {
        providerMessageIds.push(res.providerMessageId);
      }
      await this.messagesService.updateStatus(
        queuedMsg.id,
        MessageStatus.SENT,
        res.providerMessageId,
      );
      this.emitSentEvent({
        ...queuedMsg,
        status: MessageStatus.SENT,
        providerMessageId: res.providerMessageId ?? null,
      });
    }
    // Case B: Audio (.mp3) + Text -> 2 separate messages (1. sendText, 2. sendMedia audio)
    else if (
      validatedFile &&
      cleanMessage &&
      validatedFile.extension === '.mp3'
    ) {
      // Step 1: Send text message first
      const textMsg = await this.messagesService.saveMessage({
        contactId: contact.id,
        threadId,
        direction: MessageDirection.OUTBOUND,
        channel: MessageChannel.WHATSAPP,
        body: cleanMessage,
        status: MessageStatus.QUEUED,
      });
      messageIds.push(textMsg.id);

      const textRes = await this.whatsappGateway.sendManualTextMessage({
        config,
        from,
        to: normalizedTo,
        body: cleanMessage,
        apiKeyOverride: config.ycloudApiKey,
      });

      if (!textRes.ok) {
        await this.messagesService.updateStatus(
          textMsg.id,
          MessageStatus.FAILED,
        );
        this.emitSentEvent({
          ...textMsg,
          status: MessageStatus.FAILED,
        });
        throw new BadGatewayException(
          textRes.error ||
            'Error enviando el mensaje de texto previo al audio MP3.',
        );
      }

      if (textRes.providerMessageId) {
        providerMessageIds.push(textRes.providerMessageId);
      }
      await this.messagesService.updateStatus(
        textMsg.id,
        MessageStatus.SENT,
        textRes.providerMessageId,
      );
      this.emitSentEvent({
        ...textMsg,
        status: MessageStatus.SENT,
        providerMessageId: textRes.providerMessageId ?? null,
      });

      // Step 2: Send MP3 audio message
      const audioBody = `[Audio: ${validatedFile.filename}]`;
      const audioMsg = await this.messagesService.saveMessage({
        contactId: contact.id,
        threadId,
        direction: MessageDirection.OUTBOUND,
        channel: MessageChannel.WHATSAPP,
        body: audioBody,
        status: MessageStatus.QUEUED,
        mediaType: validatedFile.messageMediaType,
        mediaMimeType: validatedFile.mimeType,
        mediaFilename: validatedFile.filename,
        mediaUrl: `data:${validatedFile.mimeType};base64,${validatedFile.buffer.toString('base64')}`,
      });
      messageIds.push(audioMsg.id);

      const audioRes = await this.whatsappGateway.sendManualMediaMessage({
        config,
        from,
        to: normalizedTo,
        media: validatedFile,
      });

      if (!audioRes.ok) {
        await this.messagesService.updateStatus(
          audioMsg.id,
          MessageStatus.FAILED,
        );
        this.emitSentEvent({
          ...audioMsg,
          status: MessageStatus.FAILED,
        });
        throw new BadGatewayException(
          audioRes.error || 'Error enviando el archivo de audio MP3 por WhatsApp.',
        );
      }

      if (audioRes.providerMessageId) {
        providerMessageIds.push(audioRes.providerMessageId);
      }
      await this.messagesService.updateStatus(
        audioMsg.id,
        MessageStatus.SENT,
        audioRes.providerMessageId,
      );
      this.emitSentEvent({
        ...audioMsg,
        status: MessageStatus.SENT,
        providerMessageId: audioRes.providerMessageId ?? null,
      });
    }
    // Case C: File only OR File (non-mp3) + Text caption
    else if (validatedFile) {
      const displayBody =
        cleanMessage || `[Adjunto: ${validatedFile.filename}]`;
      const mediaMsg = await this.messagesService.saveMessage({
        contactId: contact.id,
        threadId,
        direction: MessageDirection.OUTBOUND,
        channel: MessageChannel.WHATSAPP,
        body: displayBody,
        status: MessageStatus.QUEUED,
        mediaType: validatedFile.messageMediaType,
        mediaMimeType: validatedFile.mimeType,
        mediaFilename: validatedFile.filename,
        mediaUrl: `data:${validatedFile.mimeType};base64,${validatedFile.buffer.toString('base64')}`,
      });
      messageIds.push(mediaMsg.id);

      const mediaRes = await this.whatsappGateway.sendManualMediaMessage({
        config,
        from,
        to: normalizedTo,
        media: validatedFile,
        caption: cleanMessage || undefined,
      });

      if (!mediaRes.ok) {
        await this.messagesService.updateStatus(
          mediaMsg.id,
          MessageStatus.FAILED,
        );
        this.emitSentEvent({
          ...mediaMsg,
          status: MessageStatus.FAILED,
        });
        throw new BadGatewayException(
          mediaRes.error || 'Error enviando archivo adjunto por WhatsApp.',
        );
      }

      if (mediaRes.providerMessageId) {
        providerMessageIds.push(mediaRes.providerMessageId);
      }
      await this.messagesService.updateStatus(
        mediaMsg.id,
        MessageStatus.SENT,
        mediaRes.providerMessageId,
      );
      this.emitSentEvent({
        ...mediaMsg,
        status: MessageStatus.SENT,
        providerMessageId: mediaRes.providerMessageId ?? null,
      });
    }

    await this.messagesService.markRead(threadId);
    if (contact.contactadowassap !== 'S') {
      try {
        await this.contactsService.update(contact.id, { contactadowassap: 'S' });
      } catch (err) {
        this.logger.warn(`Could not set contactadowassap for contact ${contact.id}: ${err}`);
      }
    }
    this.events.emit('conversation.updated', { threadId });

    const primaryProviderMessageId = providerMessageIds[0] ?? null;

    // Emit audit log without any secrets or binary/base64 payloads
    this.emitAudit({
      actor: {
        id: req.actor?.id ?? null,
        email: req.actor?.email ?? null,
      },
      action: AuditAction.WHATSAPP_ADMIN_SEND,
      summary: validatedFile
        ? ` Envió WhatsApp manual a ${normalizedTo} con adjunto "${validatedFile.filename}" (${providerType})`.trim()
        : `Envió WhatsApp manual a ${normalizedTo} (${providerType})`,
      targetType: 'whatsapp',
      targetId: threadId,
      ip: req.ip ?? null,
      metadata: {
        agentKey: config.agentKey,
        provider: providerType,
        to: normalizedTo,
        source: req.source ?? 'admin_ui',
        hasText: Boolean(cleanMessage),
        filename: validatedFile?.filename ?? null,
        mimeType: validatedFile?.mimeType ?? null,
        sizeBytes: validatedFile?.sizeBytes ?? null,
        providerMessageId: primaryProviderMessageId,
        providerMessageIds,
        sentAt: new Date().toISOString(),
      },
    });

    return {
      ok: true,
      provider: providerType,
      agentKey: config.agentKey,
      to: normalizedTo,
      threadId,
      contactId: contact.id,
      status: 'sent',
      providerMessageId: primaryProviderMessageId,
      providerMessageIds,
      messageIds,
      filename: validatedFile?.filename ?? null,
      mimeType: validatedFile?.mimeType ?? null,
      sizeBytes: validatedFile?.sizeBytes ?? null,
    };
  }

  private emitSentEvent(message: Parameters<typeof toMessageView>[0]): void {
    const view = toMessageView(message);
    this.events.emit('message.sent', {
      ...view,
      threadId: message.threadId,
    });
  }
}
