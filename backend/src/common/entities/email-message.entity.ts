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

export enum EmailMessageStatus {
  SENT = 'sent',
  FAILED = 'failed',
}

/**
 * History of emails sent to a contact from the CRM — one row per send attempt
 * (sent or failed), shown on the contact's detail page. Cascade-deletes with its
 * contact. Stores the body (it's business correspondence the operator wrote), so
 * it's PII: it never goes to the audit trail (which stays PII-light).
 */
@Entity('email_messages')
export class EmailMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column()
  contactId: string;

  @ManyToOne(() => Contact, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'contactId' })
  contact: Contact;

  @Column()
  toAddress: string;

  @Column()
  subject: string;

  @Column({ type: 'text' })
  body: string;

  @Column({ type: 'varchar', default: EmailMessageStatus.SENT })
  status: EmailMessageStatus;

  @Column({ type: 'text', nullable: true })
  error: string | null;

  // Snapshot of the operator who sent it (survives their deletion).
  @Column({ type: 'varchar', nullable: true })
  sentByEmail: string | null;

  @Column({ type: 'varchar', nullable: true })
  providerMessageId: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
