import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Contact } from '../common/entities/contact.entity';
import { Call } from '../common/entities/call.entity';
import { Appointment } from '../common/entities/appointment.entity';

@Entity('zadarma_sms_respuesta')
export class ZadarmaSmsLog {
  @PrimaryGeneratedColumn()
  id: number;

  @CreateDateColumn({ name: 'fecha', type: 'timestamp with time zone' })
  fecha: Date;

  @CreateDateColumn({ name: 'fecharegistro', type: 'timestamp with time zone' })
  fecharegistro: Date;

  @Column({ type: 'int', nullable: true })
  httpstatuscode: number | null;

  @Column({ type: 'varchar', length: 50 })
  status: string;

  @Column({ type: 'int', default: 1 })
  messages: number;

  @Column({ type: 'decimal', precision: 10, scale: 4, default: 0 })
  cost: number;

  @Column({ type: 'decimal', precision: 10, scale: 4, default: 0 })
  costtotal: number;

  @Column({ type: 'varchar', length: 10, default: 'EUR' })
  currency: string;

  @Column({ type: 'varchar', length: 50, default: 'Teamsale' })
  callerid: string;

  @Column({ type: 'varchar', length: 64 })
  phone: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  numerodestino: string | null;

  @Column({ type: 'decimal', precision: 10, scale: 4, default: 0 })
  costmin: number;

  @Column({ type: 'decimal', precision: 10, scale: 4, default: 0 })
  costmax: number;

  @Column({ type: 'text' })
  message: string;

  @Column({ type: 'text', nullable: true })
  mensaje: string | null;

  @Column({ type: 'int', default: 1 })
  parts: number;

  @Column({ name: 'raw_response', type: 'text', nullable: true })
  rawResponse: string | null;

  @Column({ type: 'text', nullable: true })
  rawjsonrespuesta: string | null;

  @Column({ name: 'contact_id', type: 'uuid', nullable: true })
  contactId: string | null;

  @ManyToOne(() => Contact, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'contact_id' })
  contact: Contact | null;

  @Column({ name: 'call_id', type: 'uuid', nullable: true })
  callId: string | null;

  @ManyToOne(() => Call, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'call_id' })
  call: Call | null;

  @Column({ name: 'appointment_id', type: 'uuid', nullable: true })
  appointmentId: string | null;

  @ManyToOne(() => Appointment, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'appointment_id' })
  appointment: Appointment | null;
}
