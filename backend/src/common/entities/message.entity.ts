import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Contact } from './contact.entity';

export enum MessageDirection {
  INBOUND = 'inbound',
  OUTBOUND = 'outbound',
}

export enum MessageChannel {
  WHATSAPP = 'whatsapp',
  PLAYGROUND = 'playground',
  WIDGET = 'widget',
}

/**
 * Kind of media attached to an inbound WhatsApp message. Plain-text messages
 * have `mediaType = null`. The raw bytes are never stored — only YCloud's media
 * reference (`mediaUrl`/`mediaId`), streamed on demand through the authenticated
 * media proxy. `body` holds the caption (or a placeholder) so the inbox preview
 * and the agent still get readable text.
 */
export enum MediaType {
  IMAGE = 'image',
  AUDIO = 'audio',
  VIDEO = 'video',
  DOCUMENT = 'document',
  STICKER = 'sticker',
}

/**
 * Delivery lifecycle of a message.
 * - inbound messages are stored as `received`.
 * - outbound WhatsApp messages go `queued` → `sent` (provider accepted) →
 *   `delivered` → `read` via YCloud status webhooks, or `failed`.
 * - outbound playground messages are `sent` immediately (no provider).
 */
export enum MessageStatus {
  RECEIVED = 'received',
  QUEUED = 'queued',
  SENT = 'sent',
  DELIVERED = 'delivered',
  READ = 'read',
  FAILED = 'failed',
}

@Entity('messages')
export class Message {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Contact, (contact) => contact.messages, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'contactId' })
  contact: Contact;

  @Column({ nullable: true })
  contactId: string;

  @Index()
  @Column()
  threadId: string;

  @Column({ type: 'enum', enum: MessageDirection })
  direction: MessageDirection;

  @Column({ type: 'enum', enum: MessageChannel })
  channel: MessageChannel;

  @Column({ type: 'text' })
  body: string;

  @Column({ type: 'enum', enum: MessageStatus, default: MessageStatus.QUEUED })
  status: MessageStatus;

  // YCloud message id — set on outbound sends so later delivery/read status
  // webhooks can be correlated back to this row. Indexed for that lookup.
  @Index()
  @Column({ nullable: true })
  providerMessageId: string;

  @Column({ nullable: true, unique: true })
  externalId: string;

  // ─── Inbound media (WhatsApp) ───
  // null for plain text. The bytes live at YCloud; we keep only the reference
  // and stream them through the authenticated proxy (never returned to clients).
  @Column({ type: 'enum', enum: MediaType, nullable: true })
  mediaType: MediaType | null;

  // YCloud-hosted media link (or a `data:` URL for the demo seed). Server-side
  // only — the API exposes the media via /conversations/media/:id, never this.
  @Column({ type: 'text', nullable: true })
  mediaUrl: string | null;

  // YCloud media id — kept as a forward-compatible fallback for fetching via the
  // Media API if a link is ever absent.
  @Column({ nullable: true })
  mediaId: string | null;

  @Column({ nullable: true })
  mediaMimeType: string | null;

  // Original filename, for documents.
  @Column({ nullable: true })
  mediaFilename: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
