import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { TelegramLinkToken } from '../common/entities/telegram-link-token.entity';
import { Contact } from '../common/entities/contact.entity';
import { ContactsService } from '../contacts/contacts.service';
import { MessagesService } from '../conversations/messages.service';
import { AUDIT_EVENT, AuditAction } from '../audit/audit.types';
import { TelegramSenderIdentity } from './telegram-inbound-parser';

// Telegram deep-link start parameter allows 1–64 chars of A-Z, a-z, 0-9, _ and -.
// 24 random bytes in base64url is 32 chars (192 bits of entropy).
const LINK_TOKEN_BYTES = 24;
const LINK_TOKEN_TTL_MS = 30 * 60 * 1000; // 30 minutes

export interface CreateTelegramLinkTokenInput {
  contactId?: string | null;
  agentKey?: string;
  sessionId?: string | null;
  serviceName?: string | null;
  note?: string | null;
  ttlMs?: number;
}

export interface ConsumeStartTokenResult {
  status: 'linked' | 'anonymous' | 'invalid_or_expired';
  contact: Contact | null;
  serviceName?: string | null;
  note?: string | null;
}

export function buildTelegramBotDeepLink(
  botUsername: string,
  startToken?: string | null,
): string {
  const cleanUser = (botUsername || '').trim().replace(/^@/, '');
  if (!cleanUser) return '';
  if (startToken && startToken.trim()) {
    return `https://t.me/${cleanUser}?start=${encodeURIComponent(startToken.trim())}`;
  }
  return `https://t.me/${cleanUser}`;
}

@Injectable()
export class TelegramLinkService {
  private readonly logger = new Logger(TelegramLinkService.name);

  constructor(
    @InjectRepository(TelegramLinkToken)
    private readonly tokensRepo: Repository<TelegramLinkToken>,
    private readonly contactsService: ContactsService,
    private readonly messagesService: MessagesService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Generate a temporary, single-use deep-link token for `https://t.me/<bot>?start=<token>`.
   */
  async createLinkToken(input: CreateTelegramLinkTokenInput): Promise<TelegramLinkToken> {
    const token = crypto.randomBytes(LINK_TOKEN_BYTES).toString('base64url');
    const ttl = input.ttlMs ?? LINK_TOKEN_TTL_MS;
    const expiresAt = new Date(Date.now() + ttl);

    const row = this.tokensRepo.create({
      token,
      contactId: input.contactId ?? null,
      agentKey: input.agentKey || 'booking',
      sessionId: input.sessionId ?? null,
      serviceName: input.serviceName ?? null,
      note: input.note ?? null,
      expiresAt,
      usedAt: null,
      usedByTelegramUserId: null,
      usedByTelegramChatId: null,
    });

    return this.tokensRepo.save(row);
  }

  /**
   * Consume a `/start <token>` payload when a user opens the bot in Telegram.
   * Validates that the token exists, has not expired, and has never been used.
   * When valid and associated with a CRM contact, links the Telegram identity and
   * sets `conectadotelegram = 'S'`.
   */
  async consumeStartToken(
    rawToken: string,
    sender: TelegramSenderIdentity,
    agentKey = 'booking',
  ): Promise<ConsumeStartTokenResult> {
    const cleanToken = (rawToken || '').trim();
    if (!cleanToken || !/^[A-Za-z0-9_-]{8,128}$/.test(cleanToken)) {
      return { status: 'invalid_or_expired', contact: null };
    }

    const row = await this.tokensRepo.findOne({
      where: { token: cleanToken },
    });

    if (!row) {
      return { status: 'invalid_or_expired', contact: null };
    }

    const now = new Date();
    if (row.usedAt || new Date(row.expiresAt).getTime() < now.getTime()) {
      return { status: 'invalid_or_expired', contact: null };
    }

    // Mark single-use token as consumed immediately
    row.usedAt = now;
    row.usedByTelegramUserId = sender.userId;
    row.usedByTelegramChatId = sender.chatId;
    await this.tokensRepo.save(row);

    if (!row.contactId) {
      return {
        status: 'anonymous',
        contact: null,
        serviceName: row.serviceName,
        note: row.note,
      };
    }

    try {
      const linkedContact = await this.contactsService.linkTelegramToContact(
        row.contactId,
        {
          userId: sender.userId,
          chatId: sender.chatId,
          username: sender.username,
        },
      );

      const threadId = `${row.agentKey || agentKey}:telegram:${sender.chatId}`;
      await this.messagesService
        .linkContact(threadId, linkedContact.id)
        .catch(() => null);

      this.eventEmitter.emit(AUDIT_EVENT, {
        actor: { id: null, email: null },
        action: AuditAction.CONTACT_UPDATE,
        summary: `Contacto ${linkedContact.name} vinculó su cuenta de Telegram (${
          sender.username ? `@${sender.username}` : `ID ${sender.userId}`
        })`,
        targetType: 'contact',
        targetId: linkedContact.id,
        metadata: {
          channel: 'telegram',
          telegramUserId: sender.userId,
          telegramChatId: sender.chatId,
          telegramUsername: sender.username,
        },
      });

      return {
        status: 'linked',
        contact: linkedContact,
        serviceName: row.serviceName,
        note: row.note,
      };
    } catch (err) {
      this.logger.warn(`Failed to link contact ${row.contactId} from Telegram token: ${err}`);
      return { status: 'invalid_or_expired', contact: null };
    }
  }
}
