import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Contact } from './contact.entity';

/**
 * Single-use, temporary deep-link token (`https://t.me/<bot>?start=<token>`)
 * used to securely verify and bind a visitor's Telegram account (`chat_id` /
 * `user_id`) to their CRM Contact row.
 */
@Entity('telegram_link_tokens')
export class TelegramLinkToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 128 })
  token: string;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  contactId: string | null;

  @ManyToOne(() => Contact, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'contactId' })
  contact: Contact | null;

  @Column({ type: 'varchar', default: 'booking' })
  agentKey: string;

  @Column({ type: 'varchar', nullable: true })
  sessionId: string | null;

  @Column({ type: 'varchar', nullable: true })
  serviceName: string | null;

  @Column({ type: 'text', nullable: true })
  note: string | null;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  usedAt: Date | null;

  @Column({ type: 'varchar', nullable: true })
  usedByTelegramUserId: string | null;

  @Column({ type: 'varchar', nullable: true })
  usedByTelegramChatId: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
