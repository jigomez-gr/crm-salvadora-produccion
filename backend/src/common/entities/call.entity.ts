import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Contact } from './contact.entity';

export enum CallDirection {
  INBOUND = 'inbound',
  OUTBOUND = 'outbound',
}

export enum CallStatus {
  QUEUED = 'queued',
  RINGING = 'ringing',
  IN_PROGRESS = 'in-progress',
  ENDED = 'ended',
  FAILED = 'failed',
}

@Entity('calls')
export class Call {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 255 })
  vapiCallId: string;

  @Column({
    type: 'enum',
    enum: CallDirection,
    default: CallDirection.INBOUND,
  })
  direction: CallDirection;

  @Index()
  @Column({ type: 'varchar', length: 64, nullable: true })
  fromNumber: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  toNumber: string | null;

  @Column({
    type: 'enum',
    enum: CallStatus,
    default: CallStatus.IN_PROGRESS,
  })
  status: CallStatus;

  @Column({ type: 'timestamptz', nullable: true })
  startedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  endedAt: Date | null;

  @Column({ type: 'integer', nullable: true })
  durationSeconds: number | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  endedReason: string | null;

  @Column({ type: 'text', nullable: true })
  summary: string | null;

  @Column({ type: 'text', nullable: true })
  transcript: string | null;

  @Column({ type: 'jsonb', nullable: true })
  messages: Array<{ role: string; message: string; time?: number }> | null;

  @Column({ type: 'text', nullable: true })
  recordingUrl: string | null;

  @Column({ type: 'integer', nullable: true })
  costCents: number | null;

  @Column({ type: 'boolean', default: false })
  needsReview: boolean;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  contactId: string | null;

  @ManyToOne(() => Contact, (contact) => contact.calls, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'contactId' })
  contact: Contact | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
