import { Injectable } from '@nestjs/common';
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
  contact: { id: string; name: string; phone: string } | null;
  lastMessage: {
    body: string;
    direction: string;
    createdAt: Date | null;
  };
  lastInboundAt: Date | null;
  messageCount: number;
}

export interface ThreadsQuery {
  limit: number;
  offset: number;
}

export interface ThreadPage {
  items: ThreadSummary[];
  total: number;
  limit: number;
  offset: number;
}

@Injectable()
export class MessagesService {
  constructor(
    @InjectRepository(Message)
    private readonly messagesRepo: Repository<Message>,
    @InjectRepository(Conversation)
    private readonly conversationsRepo: Repository<Conversation>,
  ) {}

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
    return this.messagesRepo.find({
      where: { threadId },
      relations: ['contact'],
      order: { createdAt: 'ASC' },
    });
  }

  /** Full message row by id — used by the media proxy (needs `mediaUrl`). */
  async getMessageById(id: string): Promise<Message | null> {
    return this.messagesRepo.findOne({ where: { id } });
  }

  /**
   * Inbox list — one query over `conversations` (joined to its contact), no
   * N+1. Ordered most-recent-first, paginated (limit/offset) so the inbox fetches
   * one page at a time instead of every thread on each SSE refresh.
   */
  async listThreads(query: ThreadsQuery): Promise<ThreadPage> {
    const [rows, total] = await this.conversationsRepo
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.contact', 'contact')
      .orderBy('c.lastMessageAt', 'DESC', 'NULLS LAST')
      .skip(query.offset)
      .take(query.limit)
      .getManyAndCount();

    const items = rows.map((c) => ({
      threadId: c.threadId,
      agentKey: c.agentKey,
      channel: c.channel,
      handoff: c.handoff,
      unreadCount: c.unreadCount,
      contact: c.contact
        ? { id: c.contact.id, name: c.contact.name, phone: c.contact.phone }
        : null,
      lastMessage: {
        body: c.lastMessageBody ?? '',
        direction: c.lastMessageDirection ?? MessageDirection.INBOUND,
        createdAt: c.lastMessageAt ?? null,
      },
      lastInboundAt: c.lastInboundAt ?? null,
      messageCount: c.messageCount,
    }));
    return { items, total, limit: query.limit, offset: query.offset };
  }

  async getConversation(threadId: string): Promise<Conversation | null> {
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
    return {
      unread: Number(row?.unread ?? 0),
      handoff: Number(row?.handoff ?? 0),
    };
  }

  /** Toggle human handoff (agent auto-reply paused) for a thread. */
  async setHandoff(threadId: string, handoff: boolean): Promise<Conversation> {
    await this.ensureConversation(threadId);
    await this.conversationsRepo.update({ threadId }, { handoff });
    return (await this.getConversation(threadId)) as Conversation;
  }

  /** Operator opened the thread — clear its unread counter. */
  async markRead(threadId: string): Promise<void> {
    await this.conversationsRepo.update({ threadId }, { unreadCount: 0 });
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
    await this.conversationsRepo.query(
      `INSERT INTO conversations ("threadId", "agentKey", channel, handoff, "unreadCount", "messageCount", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, false, 0, 0, now(), now())
       ON CONFLICT ("threadId") DO NOTHING`,
      [threadId, agentKey, MessageChannel.WHATSAPP],
    );
  }
}
