import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Contact } from '../../common/entities/contact.entity';

export type IdentityChangeType =
  | 'new_contact_email_verify'
  | 'email_error_recovery'
  | 'device_ownership_verify'
  | 'contact_conflict_resolution';

export type VerificationChannel = 'email' | 'sms' | 'whatsapp';

export type VerificationStatus = 'pending' | 'verified' | 'expired' | 'failed';

@Entity('contact_identity_changes')
export class ContactIdentityChange {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', nullable: true })
  @Index()
  contactId: string | null;

  @ManyToOne(() => Contact, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'contactId' })
  contact?: Contact;

  @Column({ type: 'varchar' })
  changeType: IdentityChangeType;

  @Column({ type: 'varchar' })
  targetChannel: VerificationChannel;

  @Column({ type: 'varchar' })
  destination: string;

  @Column({ type: 'varchar' })
  codeHash: string;

  @Column({ type: 'jsonb', nullable: true })
  oldValues: Record<string, unknown> | null;

  @Column({ type: 'jsonb', nullable: true })
  newValues: Record<string, unknown> | null;

  @Column({ type: 'varchar', default: 'pending' })
  status: VerificationStatus;

  @Column({ type: 'int', default: 0 })
  attempts: number;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  verifiedAt: Date | null;

  @Column({ type: 'varchar', default: 'web' })
  source: string;

  @Column({ type: 'varchar', nullable: true })
  ipAddress: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
