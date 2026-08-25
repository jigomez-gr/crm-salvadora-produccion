import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { Appointment } from './appointment.entity';
import { Message } from './message.entity';
import { Call } from './call.entity';
import { PipelineStage } from '../../contacts/pipeline';

/**
 * CRM lifecycle stage of a contact.
 * - LEAD: a prospect (default — e.g. a new WhatsApp sender).
 * - ACTIVE: a current customer.
 * - INACTIVE: archived / no longer engaged (kept for history).
 */
export enum ContactStatus {
  LEAD = 'lead',
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

@Entity('contacts')
export class Contact {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ unique: true })
  phone: string;

  @Column({ nullable: true })
  email: string;

  @Column({ type: 'text', nullable: true })
  notes: string;

  // CRM lifecycle stage.
  @Column({ type: 'enum', enum: ContactStatus, default: ContactStatus.LEAD })
  status: ContactStatus;

  // Sales-funnel stage for the Kanban pipeline board (distinct from `status` —
  // see contacts/pipeline.ts). Stored as varchar (not a PG enum) so stages can
  // become owner-configurable later without an ALTER TYPE. Indexed for the board.
  @Column({ type: 'varchar', default: PipelineStage.NEW })
  pipelineStage: PipelineStage;

  // Manual ordering within a pipeline column. Higher = nearer the top (board
  // orders by boardPosition DESC). New/moved cards get a fresh value; drags set a
  // midpoint between neighbours (see lib/pipeline.ts positionBetween).
  @Column({ type: 'double precision', default: 0 })
  boardPosition: number;

  // Free-form labels for segmentation (e.g. "vip", "recordar"). Postgres text[].
  @Column({ type: 'text', array: true, default: () => "'{}'" })
  tags: string[];

  // Where the contact came from (e.g. "whatsapp", "manual", "import").
  @Column({ type: 'varchar', nullable: true })
  source: string | null;

  // Per-business extra fields (key → value). Adapts the CRM to any vertical
  // without schema changes. Kept small; not for PII dumps.
  @Column({ type: 'jsonb', nullable: true })
  customFields: Record<string, string> | null;

  // Consent / opt-out (STOP/BAJA). When true, NO proactive messages are sent
  // (reminders are suppressed). Set from an inbound stop keyword or by hand.
  @Column({ default: false })
  optedOut: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  optedOutAt: Date | null;

  // GDPR erasure marker: when set, this contact's personal data has been
  // scrubbed (name/phone/email/notes/customFields cleared). The row is kept
  // (de-identified) so appointment history survives.
  @Column({ type: 'timestamptz', nullable: true })
  anonymizedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => Appointment, (appointment) => appointment.contact)
  appointments: Appointment[];

  @OneToMany(() => Message, (message) => message.contact)
  messages: Message[];

  @OneToMany(() => Call, (call) => call.contact)
  calls: Call[];
}
