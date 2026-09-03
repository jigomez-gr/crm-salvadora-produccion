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
import { User } from './user.entity';

export enum ServicePaymentType {
  STRIPE = 'stripe',
  EXTERNAL_URL = 'external_url',
  IN_PERSON = 'in_person',
  FREE = 'free',
}

export enum ServiceType {
  RECURRING = 'recurring',
  EVENT = 'event',
}

@Entity('services')
export class Service {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column()
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({
    type: 'varchar',
    default: ServiceType.RECURRING,
  })
  serviceType: string;

  // Fixed dates for events/trips/retreats (e.g. "Del 25 al 28 de Octubre de 2026")
  @Column({ type: 'text', nullable: true })
  eventDatesText: string | null;

  // Recurring schedule description (e.g. "Lunes y Miércoles de 12:00 a 13:00")
  @Column({ type: 'text', nullable: true })
  scheduleText: string | null;

  // Structured weekly timetable: day of week (0=Sun, 1=Mon, ..., 6=Sat) -> string[] of HH:mm
  @Column({ type: 'jsonb', nullable: true })
  weeklySchedule: Record<number, string[]> | null;

  // Flyer / promotional graphic image URL
  @Column({ type: 'text', nullable: true })
  flyerUrl: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  eventStartDate: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  eventEndDate: Date | null;

  // Maximum capacity / seats limit
  @Column({ type: 'int', nullable: true })
  maxCapacity: number | null;

  // Minimum quorum needed for the event to happen
  @Column({ type: 'int', nullable: true })
  minQuorum: number | null;

  // Quorum confirmation deadline
  @Column({ type: 'timestamptz', nullable: true })
  quorumDeadline: Date | null;

  @Column({ type: 'int', default: 30 })
  durationMinutes: number;

  @Column({ type: 'numeric', precision: 10, scale: 2, nullable: true })
  price: string | null;

  // Payment method: 'stripe' | 'external_url' | 'in_person' | 'free'
  @Column({
    type: 'varchar',
    default: ServicePaymentType.STRIPE,
  })
  paymentType: string;

  // External ticketing / payment URL (e.g. Giglon, Eventbrite)
  @Column({ type: 'text', nullable: true })
  externalPaymentUrl: string | null;

  // Calendar identifier for multi-calendar support
  @Index()
  @Column({ default: 'default' })
  calendarId: string;

  @Index()
  @Column({ nullable: true })
  managerId: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'managerId' })
  manager: User | null;

  @Column({ default: true })
  requiresApproval: boolean;

  // Allowed appointment modalities: 'in_person' | 'phone' | 'virtual'
  @Column({ type: 'jsonb', default: '["in_person"]' })
  allowedModalities: string[];

  // Whether booking this service demands asking the customer for the reason/motivation
  @Column({ default: false })
  requiresReason: boolean;

  // Optional custom Cal.com event type ID for virtual bookings
  @Column({ type: 'int', nullable: true })
  calEventTypeId: number | null;

  // Reminder / preparation notes for the customer (e.g. "Llevar ropa cómoda / esterilla")
  @Column({ type: 'text', nullable: true })
  reminderNotes: string | null;

  @Column({ default: true })
  isActive: boolean;

  // Computed/transient fields for events
  attendeesCount?: number;
  availableSeats?: number | null;
  quorumReached?: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}