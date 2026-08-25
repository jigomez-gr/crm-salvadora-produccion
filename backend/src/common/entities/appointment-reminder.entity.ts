import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
  Unique,
} from 'typeorm';
import { Appointment } from './appointment.entity';

export enum ReminderStatus {
  PENDING = 'pending',
  SENT = 'sent',
  FAILED = 'failed',
}

/**
 * Records that a reminder for a given appointment + offset was (or is being)
 * sent. The unique `(appointmentId, offsetLabel)` is the idempotency key: the
 * reminders cron claims a row before sending, so overlapping ticks — or multiple
 * app instances — never send the same reminder twice.
 */
@Entity('appointment_reminders')
@Unique(['appointmentId', 'offsetLabel'])
export class AppointmentReminder {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column()
  appointmentId: string;

  @ManyToOne(() => Appointment, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'appointmentId' })
  appointment: Appointment;

  // Which reminder this is, e.g. '24h' or '2h' (see REMINDER_OFFSETS).
  @Column()
  offsetLabel: string;

  @Column({ type: 'enum', enum: ReminderStatus, default: ReminderStatus.PENDING })
  status: ReminderStatus;

  // YCloud message id of the sent template message (for delivery correlation).
  @Column({ nullable: true })
  providerMessageId: string;

  @Column({ type: 'timestamptz', nullable: true })
  sentAt: Date;

  @CreateDateColumn()
  createdAt: Date;
}
