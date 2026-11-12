import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  MediaType,
  Message,
  MessageChannel,
  MessageDirection,
  MessageStatus,
} from '../common/entities/message.entity';
import { Conversation } from '../common/entities/conversation.entity';
import { Call, CallDirection } from '../common/entities/call.entity';
import { ZadarmaSmsLog } from '../sms/zadarma-sms-log.entity';

export interface SaveMessageDto {
  contactId?: string;
  threadId: string;
  direction: MessageDirection;
  channel: MessageChannel;
  body: string;
  externalId?: string;
  status?: MessageStatus;
  providerMessageId?: string;
  // Inbound media (WhatsApp). `mediaUrl`/`mediaId` are server-side references
  // only — never returned to clients (see `toMessageView`).
  mediaType?: MediaType | null;
  mediaUrl?: string | null;
  mediaId?: string | null;
  mediaMimeType?: string | null;
  mediaFilename?: string | null;
}

/**
 * Client-safe view of a message: the inbox needs to know a media attachment
 * exists and its kind, but never the YCloud `mediaUrl`/`mediaId` (the bytes are
 * fetched through the authenticated proxy by message id) nor internal
 * correlation ids (`externalId`/`providerMessageId`).
 */
export interface MessageView {
  id: string;
  direction: MessageDirection;
  body: string;
  status: MessageStatus;
  createdAt: Date;
  mediaType: MediaType | null;
  mediaMimeType: string | null;
  mediaFilename: string | null;
}

export function toMessageView(m: Message): MessageView {
  return {
    id: m.id,
    direction: m.direction,
    body: m.body,
    status: m.status,
    createdAt: m.createdAt,
    mediaType: m.mediaType ?? null,
    mediaMimeType: m.mediaMimeType ?? null,
    mediaFilename: m.mediaFilename ?? null,
  };
}

export interface ThreadSummary {
  threadId: string;
  agentKey: string;
  channel: string;
  handoff: boolean;
  unreadCount: number;
  contact: { id: string; name: string; phone: string; email?: string } | null;
  lastMessage: {
    body: string;
    direction: string;
    createdAt: Date | null;
  };
  lastInboundAt: Date | null;
  messageCount: number;
  createdAt: Date | null;
}

export interface ThreadsQuery {
  limit: number;
  offset: number;
  days?: string;
  readStatus?: string;
  channel?: string;
  search?: string;
  searchField?: string;
}

export interface ThreadPage {
  items: ThreadSummary[];
  total: number;
  limit: number;
  offset: number;
}

@Injectable()
export class MessagesService implements OnModuleInit {
  constructor(
    @InjectRepository(Message)
    private readonly messagesRepo: Repository<Message>,
    @InjectRepository(Conversation)
    private readonly conversationsRepo: Repository<Conversation>,
    @InjectRepository(Call)
    private readonly callsRepo: Repository<Call>,
    @InjectRepository(ZadarmaSmsLog)
    private readonly smsRepo: Repository<ZadarmaSmsLog>,
  ) {}

  async onModuleInit() {
    try {
      await this.messagesRepo.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_enum e
            JOIN pg_type t ON e.enumtypid = t.oid
            WHERE t.typname = 'messages_channel_enum' AND e.enumlabel = 'email'
          ) THEN
            ALTER TYPE "public"."messages_channel_enum" ADD VALUE 'email';
          END IF;
        EXCEPTION
          WHEN others THEN NULL;
        END $$;
      `);
    } catch {
      // Ignore if DB does not use enum or running under test
    }

    try {
      await this.smsRepo.query(`
        ALTER TABLE "zadarma_sms_respuesta" ADD COLUMN IF NOT EXISTS "leido" boolean DEFAULT false;
      `);
    } catch {
      // Ignore if table does not exist or running under test
    }
  }

  async saveMessage(dto: SaveMessageDto): Promise<Message> {
    if (dto.externalId) {
      const existing = await this.messagesRepo.findOne({
        where: { externalId: dto.externalId },
      });
      if (existing) return existing; // dedupe
    }

    const message = await this.messagesRepo.save(
      this.messagesRepo.create({
        ...dto,
        status: dto.status ?? this.defaultStatus(dto.direction),
      }),
    );
    await this.touchConversation(message);
    return message;
  }

  /**
   * Atomically claim an inbound message by its externalId. Returns the saved
   * message, or `null` if another concurrent delivery already claimed it (the
   * unique constraint on externalId fired). This makes webhook processing
   * idempotent under concurrent retries — the agent never runs twice for the
   * same inbound message (no double reply, no double LLM charge).
   */
  async saveInboundOnce(dto: SaveMessageDto): Promise<Message | null> {
    try {
      const message = await this.messagesRepo.save(
        this.messagesRepo.create({
          ...dto,
          status: dto.status ?? this.defaultStatus(dto.direction),
        }),
      );
      await this.touchConversation(message);
      return message;
    } catch (err) {
      // 23505 = unique_violation on externalId → already being processed.
      if ((err as { code?: string })?.code === '23505') return null;
      throw err;
    }
  }

  /** Update a message's delivery status (and provider id) by row id. */
  async updateStatus(
    id: string,
    status: MessageStatus,
    providerMessageId?: string,
  ): Promise<void> {
    await this.messagesRepo.update(id, {
      status,
      ...(providerMessageId ? { providerMessageId } : {}),
    });
  }

  /**
   * Update delivery status from a YCloud status webhook, correlated by the
   * provider message id we stored when sending. Never downgrades a status
   * (out-of-order webhooks won't turn a `read` back into `delivered`).
   */
  async updateStatusByProviderId(
    providerMessageId: string,
    status: MessageStatus,
  ): Promise<void> {
    const msg = await this.messagesRepo.findOne({
      where: { providerMessageId },
    });
    if (!msg) return;
    if (this.statusRank(status) <= this.statusRank(msg.status)) return;
    await this.messagesRepo.update(msg.id, { status });
  }

  async getThreadMessages(threadId: string): Promise<Message[]> {
    if (threadId.startsWith('sms:')) {
      const smsId = Number(threadId.slice('sms:'.length));
      const sms = await this.smsRepo.findOne({
        where: { id: smsId },
        relations: ['contact'],
      });
      if (!sms) return [];

      const smsTime = sms.fecha || sms.fecharegistro || new Date();
      const text = sms.message || sms.mensaje || 'Mensaje SMS';

      return [
        {
          id: String(sms.id),
          threadId,
          contactId: sms.contactId,
          contact: sms.contact as any,
          direction: MessageDirection.OUTBOUND,
          channel: 'sms' as any,
          body: text,
          status:
            sms.status === 'success'
              ? MessageStatus.DELIVERED
              : MessageStatus.FAILED,
          providerMessageId: String(sms.id),
          externalId: String(sms.id),
          mediaType: null,
          mediaUrl: null,
          mediaId: null,
          mediaMimeType: null,
          mediaFilename: null,
          createdAt: smsTime,
        } as Message,
      ];
    }

    if (threadId.startsWith('call:')) {
      const callId = threadId.slice('call:'.length);
      const call = await this.callsRepo.findOne({
        where: { id: callId },
        relations: ['contact'],
      });
      if (!call) return [];

      const callTime = call.startedAt || call.createdAt || new Date();
      const text =
        call.summary ||
        call.transcript ||
        (call.direction === CallDirection.OUTBOUND
          ? 'Llamada telefónica saliente'
          : 'Llamada telefónica entrante');

      return [
        {
          id: call.id,
          threadId,
          contactId: call.contactId,
          contact: call.contact as any,
          direction:
            call.direction === CallDirection.OUTBOUND
              ? MessageDirection.OUTBOUND
              : MessageDirection.INBOUND,
          channel: 'call' as any,
          body: text,
          status: MessageStatus.DELIVERED,
          providerMessageId: call.vapiCallId || null,
          externalId: call.id,
          mediaType: null,
          mediaUrl: null,
          mediaId: null,
          mediaMimeType: null,
          mediaFilename: null,
          createdAt: callTime,
        } as Message,
      ];
    }

    return this.messagesRepo.find({
      where: { threadId },
      relations: ['contact'],
      order: { createdAt: 'ASC' },
    });
  }

  /** Recent messages in descending order (newest first). Used by anti-loop checks. */
  async getRecentMessages(threadId: string, limit = 10): Promise<Message[]> {
    return this.messagesRepo.find({
      where: { threadId },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  /** Full message row by id — used by the media proxy (needs `mediaUrl`). */
  async getMessageById(id: string): Promise<Message | null> {
    return this.messagesRepo.findOne({ where: { id } });
  }

  private conversationToSummary(c: Conversation): ThreadSummary {
    return {
      threadId: c.threadId,
      agentKey: c.agentKey,
      channel: c.channel,
      handoff: c.handoff,
      unreadCount: c.unreadCount,
      contact: c.contact
        ? { id: c.contact.id, name: c.contact.name, phone: c.contact.phone, email: c.contact.email }
        : null,
      lastMessage: {
        body: c.lastMessageBody ?? '',
        direction: c.lastMessageDirection ?? MessageDirection.INBOUND,
        createdAt: c.lastMessageAt ?? null,
      },
      lastInboundAt: c.lastInboundAt ?? null,
      messageCount: c.messageCount,
      createdAt: c.createdAt ?? c.lastMessageAt ?? null,
    };
  }

  private callToSummary(call: Call): ThreadSummary {
    const contactName =
      call.contact?.name ||
      (call.direction === CallDirection.OUTBOUND
        ? (call.toNumber ? `Tel: ${call.toNumber}` : 'Llamada saliente')
        : (call.fromNumber ? `Tel: ${call.fromNumber}` : 'Llamada entrante'));

    const phone =
      call.contact?.phone ||
      (call.direction === CallDirection.OUTBOUND
        ? (call.toNumber || call.fromNumber || '')
        : (call.fromNumber || call.toNumber || ''));

    const email = call.contact?.email || '';
    const text =
      call.summary ||
      call.transcript ||
      (call.direction === CallDirection.OUTBOUND
        ? 'Llamada saliente'
        : 'Llamada entrante');
    const date = call.startedAt || call.createdAt || new Date();

    return {
      threadId: `call:${call.id}`,
      agentKey: 'vapi',
      channel: 'call',
      handoff: false,
      unreadCount: call.needsReview ? 1 : 0,
      contact: {
        id: call.contact?.id || call.id,
        name: contactName,
        phone,
        email,
      },
      lastMessage: {
        body: text,
        direction:
          call.direction === CallDirection.OUTBOUND
            ? MessageDirection.OUTBOUND
            : MessageDirection.INBOUND,
        createdAt: date,
      },
      lastInboundAt: call.direction === CallDirection.INBOUND ? date : null,
      messageCount: 1,
      createdAt: date,
    };
  }

  private smsToSummary(sms: ZadarmaSmsLog): ThreadSummary {
    const contactName =
      sms.contact?.name ||
      (sms.phone ? `SMS: +${sms.phone}` : 'Mensaje SMS');

    const phone =
      sms.contact?.phone ||
      sms.numerodestino ||
      sms.phone ||
      '';

    const email = sms.contact?.email || '';
    const text = sms.message || sms.mensaje || 'Mensaje SMS';
    const date = sms.fecha || sms.fecharegistro || new Date();

    return {
      threadId: `sms:${sms.id}`,
      agentKey: 'zadarma',
      channel: 'sms',
      handoff: false,
      unreadCount: sms.leido ? 0 : 1,
      contact: {
        id: sms.contact?.id || String(sms.id),
        name: contactName,
        phone,
        email,
      },
      lastMessage: {
        body: text,
        direction: MessageDirection.OUTBOUND,
        createdAt: date,
      },
      lastInboundAt: null,
      messageCount: 1,
      createdAt: date,
    };
  }

  /**
   * Inbox list — unified query over `conversations` and `calls` (joined to contact).
   * Ordered most-recent-first, paginated (limit/offset) with multi-criteria filters.
   */
  async listThreads(query: ThreadsQuery): Promise<ThreadPage> {
    const limit = query.limit;
    const offset = query.offset;
    const days = query.days || 'all';
    const readStatus = query.readStatus || 'all';
    const rawChannel = (query.channel || 'all').toLowerCase().trim();
    const search = query.search?.trim() || '';
    const searchField = query.searchField || 'all';

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    // Channel matching: support single or comma-separated channels
    const channels = rawChannel.split(',').map((s) => s.trim().toLowerCase());
    const isAllChannels = channels.includes('all') || channels.includes('todas') || rawChannel === '';

    const wantsCall =
      isAllChannels ||
      channels.includes('call') ||
      channels.includes('llamadas') ||
      channels.includes('llamada');
    const wantsSms =
      isAllChannels ||
      channels.includes('sms');
    const wantsConversations =
      isAllChannels ||
      channels.some((c) =>
        ['whatsapp', 'wassap', 'email', 'widget', 'web landing', 'web', 'playground'].includes(c),
      );

    let convItems: ThreadSummary[] = [];
    let convTotal = 0;

    if (wantsConversations) {
      const qb = this.conversationsRepo
        .createQueryBuilder('c')
        .leftJoinAndSelect('c.contact', 'contact');

      if (!isAllChannels) {
        const allowedChannels: string[] = [];
        if (channels.some((c) => c === 'whatsapp' || c === 'wassap')) allowedChannels.push('whatsapp');
        if (channels.some((c) => c === 'email')) allowedChannels.push('email');
        if (channels.some((c) => c === 'widget' || c === 'web landing' || c === 'web')) allowedChannels.push('widget');
        if (channels.some((c) => c === 'playground')) allowedChannels.push('playground');

        if (allowedChannels.length > 0) {
          qb.andWhere('c.channel IN (:...allowedChannels)', { allowedChannels });
        } else {
          qb.andWhere('1 = 0');
        }
      }

      if (days === '7') {
        qb.andWhere('c.lastMessageAt >= :sevenDaysAgo', { sevenDaysAgo });
      }

      if (readStatus === 'unread') {
        qb.andWhere('c.unreadCount > 0');
      } else if (readStatus === 'read') {
        qb.andWhere('c.unreadCount = 0');
      }

      if (search) {
        const s = `%${search.toLowerCase()}%`;
        if (searchField === 'phone' || searchField === 'movil') {
          qb.andWhere('(LOWER(contact.phone) LIKE :s OR LOWER(c.threadId) LIKE :s)', { s });
        } else if (searchField === 'email') {
          qb.andWhere('(LOWER(contact.email) LIKE :s OR LOWER(c.threadId) LIKE :s)', { s });
        } else if (searchField === 'name' || searchField === 'nombre') {
          qb.andWhere('LOWER(contact.name) LIKE :s', { s });
        } else {
          qb.andWhere(
            '(LOWER(contact.name) LIKE :s OR LOWER(contact.phone) LIKE :s OR LOWER(contact.email) LIKE :s OR LOWER(c.threadId) LIKE :s OR LOWER(c.lastMessageBody) LIKE :s)',
            { s },
          );
        }
      }

      qb.orderBy('c.lastMessageAt', 'DESC', 'NULLS LAST');

      if (!wantsCall && !wantsSms) {
        const [rows, total] = await qb.skip(offset).take(limit).getManyAndCount();
        return {
          items: rows.map((c) => this.conversationToSummary(c)),
          total,
          limit,
          offset,
        };
      }

      const [rows, total] = await qb.take(Math.max(offset + limit, 100)).getManyAndCount();
      convItems = rows.map((c) => this.conversationToSummary(c));
      convTotal = total;
    }

    let callItems: ThreadSummary[] = [];
    let callTotal = 0;

    if (wantsCall) {
      const qb = this.callsRepo
        .createQueryBuilder('call')
        .leftJoinAndSelect('call.contact', 'contact');

      if (days === '7') {
        qb.andWhere(
          '(call.startedAt >= :sevenDaysAgo OR call.createdAt >= :sevenDaysAgo)',
          { sevenDaysAgo },
        );
      }

      if (readStatus === 'unread') {
        qb.andWhere('call.needsReview = true');
      } else if (readStatus === 'read') {
        qb.andWhere('call.needsReview = false');
      }

      if (search) {
        const s = `%${search.toLowerCase()}%`;
        if (searchField === 'phone' || searchField === 'movil') {
          qb.andWhere(
            '(LOWER(call.fromNumber) LIKE :s OR LOWER(call.toNumber) LIKE :s OR LOWER(contact.phone) LIKE :s)',
            { s },
          );
        } else if (searchField === 'email') {
          qb.andWhere(
            '(LOWER(contact.email) LIKE :s OR LOWER(call.summary) LIKE :s OR LOWER(call.transcript) LIKE :s)',
            { s },
          );
        } else if (searchField === 'name' || searchField === 'nombre') {
          qb.andWhere(
            '(LOWER(contact.name) LIKE :s OR LOWER(call.summary) LIKE :s OR LOWER(call.transcript) LIKE :s)',
            { s },
          );
        } else {
          qb.andWhere(
            '(LOWER(contact.name) LIKE :s OR LOWER(contact.phone) LIKE :s OR LOWER(contact.email) LIKE :s OR LOWER(call.fromNumber) LIKE :s OR LOWER(call.toNumber) LIKE :s OR LOWER(call.summary) LIKE :s OR LOWER(call.transcript) LIKE :s)',
            { s },
          );
        }
      }

      qb.orderBy('call.startedAt', 'DESC', 'NULLS LAST');
      qb.addOrderBy('call.createdAt', 'DESC', 'NULLS LAST');

      if (!wantsConversations && !wantsSms) {
        const [rows, total] = await qb.skip(offset).take(limit).getManyAndCount();
        return {
          items: rows.map((call) => this.callToSummary(call)),
          total,
          limit,
          offset,
        };
      }

      const [rows, total] = await qb.take(Math.max(offset + limit, 100)).getManyAndCount();
      callItems = rows.map((call) => this.callToSummary(call));
      callTotal = total;
    }

    let smsItems: ThreadSummary[] = [];
    let smsTotal = 0;

    if (wantsSms) {
      const qb = this.smsRepo
        .createQueryBuilder('sms')
        .leftJoinAndSelect('sms.contact', 'contact');

      if (days === '7') {
        qb.andWhere(
          '(sms.fecha >= :sevenDaysAgo OR sms.fecharegistro >= :sevenDaysAgo)',
          { sevenDaysAgo },
        );
      }

      if (readStatus === 'unread') {
        qb.andWhere('(sms.leido = false OR sms.leido IS NULL)');
      } else if (readStatus === 'read') {
        qb.andWhere('sms.leido = true');
      }

      if (search) {
        const s = `%${search.toLowerCase()}%`;
        if (searchField === 'phone' || searchField === 'movil') {
          qb.andWhere(
            '(LOWER(sms.phone) LIKE :s OR LOWER(sms.numerodestino) LIKE :s OR LOWER(contact.phone) LIKE :s)',
            { s },
          );
        } else if (searchField === 'email') {
          qb.andWhere(
            '(LOWER(contact.email) LIKE :s OR LOWER(sms.message) LIKE :s OR LOWER(sms.mensaje) LIKE :s)',
            { s },
          );
        } else if (searchField === 'name' || searchField === 'nombre') {
          qb.andWhere(
            '(LOWER(contact.name) LIKE :s OR LOWER(sms.message) LIKE :s OR LOWER(sms.mensaje) LIKE :s)',
            { s },
          );
        } else {
          qb.andWhere(
            '(LOWER(contact.name) LIKE :s OR LOWER(contact.phone) LIKE :s OR LOWER(contact.email) LIKE :s OR LOWER(sms.phone) LIKE :s OR LOWER(sms.numerodestino) LIKE :s OR LOWER(sms.message) LIKE :s OR LOWER(sms.mensaje) LIKE :s)',
            { s },
          );
        }
      }

      qb.orderBy('sms.fecha', 'DESC', 'NULLS LAST');
      qb.addOrderBy('sms.fecharegistro', 'DESC', 'NULLS LAST');

      if (!wantsConversations && !wantsCall) {
        const [rows, total] = await qb.skip(offset).take(limit).getManyAndCount();
        return {
          items: rows.map((sms) => this.smsToSummary(sms)),
          total,
          limit,
          offset,
        };
      }

      const [rows, total] = await qb.take(Math.max(offset + limit, 100)).getManyAndCount();
      smsItems = rows.map((sms) => this.smsToSummary(sms));
      smsTotal = total;
    }

    // Merge all lists sorted by date DESC
    const merged = [...convItems, ...callItems, ...smsItems].sort((a, b) => {
      const timeA = a.lastMessage.createdAt ? new Date(a.lastMessage.createdAt).getTime() : 0;
      const timeB = b.lastMessage.createdAt ? new Date(b.lastMessage.createdAt).getTime() : 0;
      return timeB - timeA;
    });

    const paged = merged.slice(offset, offset + limit);
    return {
      items: paged,
      total: convTotal + callTotal + smsTotal,
      limit,
      offset,
    };
  }

  async getConversation(threadId: string): Promise<Conversation | null> {
    if (threadId.startsWith('sms:')) {
      const smsId = Number(threadId.slice('sms:'.length));
      const sms = await this.smsRepo.findOne({
        where: { id: smsId },
        relations: ['contact'],
      });
      if (!sms) return null;
      return {
        threadId,
        agentKey: 'zadarma',
        contactId: sms.contactId,
        contact: sms.contact as any,
        channel: 'sms',
        handoff: false,
        unreadCount: sms.leido ? 0 : 1,
        lastMessageAt: sms.fecha || sms.fecharegistro,
        lastInboundAt: null,
        lastMessageBody: sms.message || sms.mensaje || '',
        lastMessageDirection: MessageDirection.OUTBOUND,
        messageCount: 1,
        createdAt: sms.fecharegistro || sms.fecha,
        updatedAt: sms.fecha || sms.fecharegistro,
      } as Conversation;
    }

    if (threadId.startsWith('call:')) {
      const callId = threadId.slice('call:'.length);
      const call = await this.callsRepo.findOne({
        where: { id: callId },
        relations: ['contact'],
      });
      if (!call) return null;
      return {
        threadId,
        agentKey: 'vapi',
        contactId: call.contactId,
        contact: call.contact as any,
        channel: 'call',
        handoff: false,
        unreadCount: call.needsReview ? 1 : 0,
        lastMessageAt: call.startedAt || call.createdAt,
        lastInboundAt:
          call.direction === CallDirection.INBOUND ? call.startedAt : null,
        lastMessageBody: call.summary || call.transcript || '',
        lastMessageDirection: call.direction,
        messageCount: 1,
        createdAt: call.createdAt,
        updatedAt: call.updatedAt || call.createdAt,
      } as Conversation;
    }
    return this.conversationsRepo.findOne({ where: { threadId } });
  }

  /**
   * Cheap inbox aggregates for the dashboard: total unread messages across all
   * threads and how many threads are in human-handoff. One grouped query (no
   * per-thread loop), PII-free.
   */
  async inboxCounts(): Promise<{ unread: number; handoff: number }> {
    const row = await this.conversationsRepo
      .createQueryBuilder('c')
      .select('COALESCE(SUM(c.unreadCount), 0)', 'unread')
      .addSelect(
        'COUNT(*) FILTER (WHERE c.handoff = true)',
        'handoff',
      )
      .getRawOne<{ unread: string; handoff: string }>();

    let unreadCalls = 0;
    try {
      unreadCalls = await this.callsRepo.count({ where: { needsReview: true } });
    } catch {
      // ignore
    }

    let unreadSms = 0;
    try {
      unreadSms = await this.smsRepo.count({ where: { leido: false } });
    } catch {
      // ignore
    }

    return {
      unread: Number(row?.unread ?? 0) + unreadCalls + unreadSms,
      handoff: Number(row?.handoff ?? 0),
    };
  }

  /** Toggle human handoff (agent auto-reply paused) for a thread. */
  async setHandoff(threadId: string, handoff: boolean): Promise<Conversation> {
    if (threadId.startsWith('call:') || threadId.startsWith('sms:')) {
      return (await this.getConversation(threadId)) as Conversation;
    }
    await this.ensureConversation(threadId);
    await this.conversationsRepo.update({ threadId }, { handoff });
    return (await this.getConversation(threadId)) as Conversation;
  }

  /** Operator opened the thread — clear its unread counter. */
  async markRead(threadId: string): Promise<void> {
    if (threadId.startsWith('sms:')) {
      const smsId = Number(threadId.slice('sms:'.length));
      await this.smsRepo.update(smsId, { leido: true });
      return;
    }
    if (threadId.startsWith('call:')) {
      const callId = threadId.slice('call:'.length);
      await this.callsRepo.update(callId, { needsReview: false });
      return;
    }
    await this.conversationsRepo.update({ threadId }, { unreadCount: 0 });
  }

  /** Link a conversation and its messages to a contact ID */
  async linkContact(threadId: string, contactId: string): Promise<void> {
    await this.ensureConversation(threadId);
    await this.conversationsRepo.update({ threadId }, { contactId });
    await this.messagesRepo
      .createQueryBuilder()
      .update(Message)
      .set({ contactId })
      .where('threadId = :threadId AND contactId IS NULL', { threadId })
      .execute()
      .catch(() => null);
  }

  async existsByExternalId(externalId: string): Promise<boolean> {
    const count = await this.messagesRepo.count({ where: { externalId } });
    return count > 0;
  }

  /**
   * Rebuild the `conversations` rows from existing `messages`. Used by the demo
   * seed (which inserts messages directly) so seeded threads show up in the
   * inbox; the production migration does the same backfill in SQL. Idempotent.
   */
  async rebuildAllConversations(): Promise<void> {
    await this.conversationsRepo.query(`
      INSERT INTO conversations (
        "threadId", "agentKey", "contactId", channel, handoff,
        "unreadCount", "lastMessageAt", "lastInboundAt", "lastMessageBody",
        "lastMessageDirection", "messageCount", "createdAt", "updatedAt"
      )
      SELECT
        agg."threadId",
        split_part(agg."threadId", ':', 1),
        last_msg."contactId",
        last_msg.channel::text,
        false,
        0,
        agg."lastMessageAt",
        agg."lastInboundAt",
        last_msg.body,
        last_msg.direction::text,
        agg."messageCount",
        agg."firstAt",
        now()
      FROM (
        SELECT
          "threadId",
          MAX("createdAt") AS "lastMessageAt",
          MIN("createdAt") AS "firstAt",
          COUNT(*)::int AS "messageCount",
          MAX("createdAt") FILTER (WHERE direction = 'inbound') AS "lastInboundAt"
        FROM messages
        GROUP BY "threadId"
      ) agg
      JOIN LATERAL (
        SELECT body, direction, channel, "contactId"
        FROM messages m
        WHERE m."threadId" = agg."threadId"
        ORDER BY m."createdAt" DESC, m.id DESC
        LIMIT 1
      ) last_msg ON true
      ON CONFLICT ("threadId") DO NOTHING
    `);
  }

  // ─── internals ───

  private defaultStatus(direction: MessageDirection): MessageStatus {
    return direction === MessageDirection.INBOUND
      ? MessageStatus.RECEIVED
      : MessageStatus.QUEUED;
  }

  // Ordering used to prevent out-of-order status webhooks from downgrading.
  private statusRank(status: MessageStatus): number {
    const order: Record<MessageStatus, number> = {
      [MessageStatus.RECEIVED]: 0,
      [MessageStatus.QUEUED]: 1,
      [MessageStatus.SENT]: 2,
      [MessageStatus.DELIVERED]: 3,
      [MessageStatus.READ]: 4,
      // `failed` is terminal but not "higher" than read — treat it as final by
      // ranking it high so a stray later status can't overwrite it.
      [MessageStatus.FAILED]: 5,
    };
    return order[status] ?? 0;
  }

  /**
   * Keep the conversation row in sync with a just-saved message. Atomic upsert:
   * increments unread on inbound, denormalises the last-message preview, and
   * tracks `lastInboundAt` for the WhatsApp 24h window.
   */
  private async touchConversation(message: Message): Promise<void> {
    const isInbound = message.direction === MessageDirection.INBOUND;
    const agentKey = message.threadId.includes(':')
      ? message.threadId.slice(0, message.threadId.indexOf(':'))
      : message.threadId;
    const when = message.createdAt ?? new Date();

    await this.conversationsRepo.query(
      `
      INSERT INTO conversations (
        "threadId", "agentKey", "contactId", channel, handoff,
        "unreadCount", "lastMessageAt", "lastInboundAt", "lastMessageBody",
        "lastMessageDirection", "messageCount", "createdAt", "updatedAt"
      )
      VALUES ($1, $2, $3, $4, false, $5, $6, $7, $8, $9, 1, now(), now())
      ON CONFLICT ("threadId") DO UPDATE SET
        "contactId" = COALESCE(EXCLUDED."contactId", conversations."contactId"),
        "channel" = EXCLUDED."channel",
        "lastMessageAt" = EXCLUDED."lastMessageAt",
        "lastMessageBody" = EXCLUDED."lastMessageBody",
        "lastMessageDirection" = EXCLUDED."lastMessageDirection",
        "lastInboundAt" = COALESCE(EXCLUDED."lastInboundAt", conversations."lastInboundAt"),
        "unreadCount" = conversations."unreadCount" + $5,
        "messageCount" = conversations."messageCount" + 1,
        "updatedAt" = now()
      `,
      [
        message.threadId,
        agentKey,
        message.contactId ?? null,
        message.channel,
        isInbound ? 1 : 0,
        when,
        isInbound ? when : null,
        message.body,
        message.direction,
      ],
    );
  }

  /** Make sure a conversation row exists before patching its state. */
  private async ensureConversation(threadId: string): Promise<void> {
    const exists = await this.conversationsRepo.findOne({ where: { threadId } });
    if (exists) return;
    const agentKey = threadId.includes(':')
      ? threadId.slice(0, threadId.indexOf(':'))
      : threadId;
    const channel = threadId.includes(':email:')
      ? MessageChannel.EMAIL
      : threadId.includes(':widget')
        ? 'widget'
        : MessageChannel.WHATSAPP;
    await this.conversationsRepo.query(
      `INSERT INTO conversations ("threadId", "agentKey", channel, handoff, "unreadCount", "messageCount", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, false, 0, 0, now(), now())
       ON CONFLICT ("threadId") DO UPDATE SET channel = $3 WHERE conversations.channel != $3 AND $3 != 'whatsapp'`,
      [threadId, agentKey, channel],
    );
  }
}
