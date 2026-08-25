import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Contact } from './contact.entity';

/**
 * A conversation thread (the inbox unit). One row per `threadId`
 * (`agentKey:phone` for WhatsApp, `agentKey:playground-…` for the playground).
 *
 * Threads used to be derived on the fly by grouping `messages` — which cost an
 * N+1 per inbox load and left nowhere to keep per-thread state. This entity is
 * the durable home for that state:
 *   - `handoff` — a human took over; the agent stops auto-replying on this thread.
 *   - `unreadCount` — inbound messages the operator hasn't opened yet (inbox badge).
 *   - `lastInboundAt` — when the customer last wrote (drives WhatsApp's 24h window).
 *   - denormalised `lastMessage*` — so the inbox list is a single query.
 *
 * It is kept in sync by `MessagesService` on every persisted message.
 */
@Entity('conversations')
export class Conversation {
  // threadId is the natural key (`agentKey:phone`). Not a generated id.
  @PrimaryColumn()
  threadId: string;

  // Parsed from threadId (prefix before the first ':'). Stored so the inbox can
  // filter/group by agent without re-parsing.
  @Column()
  agentKey: string;

  @ManyToOne(() => Contact, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'contactId' })
  contact: Contact;

  @Column({ nullable: true })
  contactId: string;

  // 'whatsapp' | 'playground' — stored as text (mirrors MessageChannel values)
  // to avoid coupling a second DB enum type to the messages enum.
  @Column()
  channel: string;

  // Human handoff: when true the agent does NOT auto-reply on this thread (a
  // person is handling it). Inbound messages are still recorded.
  @Column({ default: false })
  handoff: boolean;

  // Inbound messages since the operator last opened (marked read) this thread.
  @Column({ type: 'int', default: 0 })
  unreadCount: number;

  // Inbox is ordered by this; index it.
  @Index()
  @Column({ type: 'timestamptz', nullable: true })
  lastMessageAt: Date;

  // Last time the customer wrote — WhatsApp only allows free-text replies within
  // 24h of this; after that a template (HSM) is required.
  @Column({ type: 'timestamptz', nullable: true })
  lastInboundAt: Date;

  // Denormalised preview of the most recent message (avoids the N+1 on the list).
  @Column({ type: 'text', nullable: true })
  lastMessageBody: string;

  // 'inbound' | 'outbound' — text (mirrors MessageDirection values).
  @Column({ nullable: true })
  lastMessageDirection: string;

  @Column({ type: 'int', default: 0 })
  messageCount: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
