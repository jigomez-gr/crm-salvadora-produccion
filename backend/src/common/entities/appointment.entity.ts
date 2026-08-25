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

export enum AppointmentStatus {
  PENDING_APPROVAL = 'pending_approval',
  SCHEDULED = 'scheduled',
  CANCELLED = 'cancelled',
  COMPLETED = 'completed',
}

export enum PaymentStatus {
  UNPAID = 'unpaid',
  PENDING = 'pending',
  PAID = 'paid',
  REFUNDED = 'refunded',
  EXEMPT = 'exempt',
}

@Entity('appointments')
// Calendar range queries filter by date; the dashboard counts by (status, date).
@Index(['status', 'startsAt'])
export class Appointment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column()
  contactId: string;

  @ManyToOne(() => Contact, (contact) => contact.appointments, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'contactId' })
  contact: Contact;

  @Column()
  service: string;

  @Index()
  @Column({ nullable: true })
  serviceId: string | null;

  @Index()
  @Column({ default: 'default' })
  calendarId: string;

  @Index()
  @Column({ type: 'timestamptz' })
  startsAt: Date;

  @Column({ type: 'timestamptz' })
  endsAt: Date;

  @Column({
    type: 'enum',
    enum: AppointmentStatus,
    default: AppointmentStatus.SCHEDULED,
  })
  status: AppointmentStatus;

  // Which agent booked it (WhatsApp). Null for manual/calendar bookings.
  @Column({ nullable: true })
  agentKey: string | null;

  // Appointment attendance modality: 'in_person' | 'phone' | 'virtual'
  @Column({ default: 'in_person' })
  modality: string;

  // Customer reason/motivation for requesting the service
  @Column({ type: 'text', nullable: true })
  reason: string | null;

  // Optional internal notes about the appointment.
  @Column({ type: 'text', nullable: true })
  notes: string | null;

  // ─── Response Document / Clinical Diagnosis / Consultation Outcome ───
  @Column({ type: 'jsonb', nullable: true })
  responseDocument?: {
    templateKey: string;
    title: string;
    symptoms?: string;
    diagnosis?: string;
    treatment?: string;
    recommendations?: string;
    notes?: string;
    customFields?: Record<string, string>;
    issuedAt: string;
    signedBy: string;
  } | null;

  // ─── Doctor Clinical Report PDF (BLOB) ───
  @Column({ type: 'bytea', nullable: true, select: false })
  doctorReportPdf: Buffer | null;

  @Column({ type: 'varchar', nullable: true })
  doctorReportPdfName: string | null;

  @Column({ type: 'varchar', nullable: true, default: 'application/pdf' })
  doctorReportPdfMime: string | null;

  @Column({ type: 'integer', nullable: true })
  doctorReportPdfSize: number | null;

  // ─── Patient Attachment Document / Media (BLOB) ───
  @Column({ type: 'bytea', nullable: true, select: false })
  patientAttachmentData: Buffer | null;

  @Column({ type: 'varchar', nullable: true })
  patientAttachmentName: string | null;

  @Column({ type: 'varchar', nullable: true })
  patientAttachmentMime: string | null;

  @Column({ type: 'integer', nullable: true })
  patientAttachmentSize: number | null;

  @Column({ type: 'timestamptz', nullable: true })
  patientAttachmentUploadedAt: Date | null;

  // ─── AI Image Analysis & Cropped Region (analizaia) ───
  @Column({ type: 'varchar', nullable: true })
  aiAnalysisType: string | null; // dental | dental_xray | dermatology | aesthetic | general

  @Column({ type: 'text', nullable: true })
  aiAnalysisResult: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  aiAnalysisDate: Date | null;

  @Column({ type: 'bytea', nullable: true, select: false })
  aiCroppedImageData: Buffer | null;

  @Column({ type: 'varchar', nullable: true })
  aiCroppedImageMime: string | null;

  // ─── Cal.com Virtual Meeting Sync ───
  @Column({ type: 'varchar', nullable: true })
  calBookingId: string | null;

  @Column({ type: 'varchar', nullable: true })
  calBookingUid: string | null;

  @Column({ type: 'text', nullable: true })
  calMeetingUrl: string | null;

  @Column({ type: 'varchar', nullable: true })
  calStatus: string | null;

  // Optional price (for future invoicing/deposits). Stored as numeric.
  @Column({ type: 'numeric', precision: 10, scale: 2, nullable: true })
  price: string | null;

  // ─── Stripe Payment Tracking ───
  @Column({
    type: 'enum',
    enum: PaymentStatus,
    default: PaymentStatus.UNPAID,
  })
  paymentStatus: PaymentStatus;

  @Column({ type: 'varchar', nullable: true })
  stripeSessionId: string | null;

  @Column({ type: 'varchar', nullable: true })
  stripePaymentIntentId: string | null;

  @Column({ type: 'text', nullable: true })
  paymentUrl: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  paidAt: Date | null;

  // ─── Acceptance audit (set when status becomes 'scheduled' from 'pending_approval') ───
  @Column({ type: 'timestamptz', nullable: true })
  acceptedAt: Date | null;

  @Column({ nullable: true })
  acceptedBy: string | null;

  // ─── Cancellation audit (set when status becomes 'cancelled') ───
  @Column({ type: 'timestamptz', nullable: true })
  cancelledAt: Date | null;

  // Who cancelled: a user id, or 'agent' / 'customer' / 'system'.
  @Column({ nullable: true })
  cancelledBy: string | null;

  @Column({ type: 'text', nullable: true })
  cancellationReason: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
