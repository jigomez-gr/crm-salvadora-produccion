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
import { Service } from './service.entity';

export enum EventEditionStatus {
  PROVISIONAL = 'provisional',
  CONFIRMED = 'confirmed',
  CANCELLED = 'cancelled',
  COMPLETED = 'completed',
}

@Entity('event_editions')
export class EventEdition {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  serviceId: string;

  @ManyToOne(() => Service, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'serviceId' })
  service: Service;

  // Title / name of the edition (e.g. "Convocatoria Octubre 2026", "Taller Intensivo Noviembre")
  @Column({ type: 'varchar', length: 255 })
  title: string;

  // Whether date is definite ('true') or TBD / tentative ('false')
  @Column({ type: 'boolean', default: false })
  isDateDefinite: boolean;

  // Descriptive tentative date text when not yet definite (e.g. "Sábados intensivos de 10:00 a 14:00 (Tentativa)")
  @Column({ type: 'text', nullable: true })
  tentativeDateText: string | null;

  // Definite start date/time
  @Column({ type: 'timestamptz', nullable: true })
  startsAt: Date | null;

  // Definite end date/time
  @Column({ type: 'timestamptz', nullable: true })
  endsAt: Date | null;

  // Whether price is definite ('true') or TBD / to be consulted ('false')
  @Column({ type: 'boolean', default: false })
  isPriceDefinite: boolean;

  // Descriptive tentative price text when not yet definite (e.g. "A consultar según alojamiento (aprox. 50-70€)")
  @Column({ type: 'text', nullable: true })
  tentativePriceText: string | null;

  // Definite price amount
  @Column({ type: 'numeric', precision: 10, scale: 2, nullable: true })
  price: string | null;

  // Minimum required participants for the edition to take place ("si no se llega no se hace")
  @Column({ type: 'int', default: 1 })
  minParticipants: number;

  // Maximum capacity / seats limit
  @Column({ type: 'int', nullable: true })
  maxCapacity: number | null;

  // Deadline for quorum to be reached
  @Column({ type: 'timestamptz', nullable: true })
  quorumDeadline: Date | null;

  // Custom conditions or notes (e.g. "Cancelación sin coste si no se alcanza el quórum 7 días antes")
  @Column({ type: 'text', nullable: true })
  conditionsText: string | null;

  @Column({
    type: 'varchar',
    length: 50,
    default: EventEditionStatus.PROVISIONAL,
  })
  status: EventEditionStatus;

  // Specific flyer for this edition (if any)
  @Column({ type: 'text', nullable: true })
  flyerParticularUrl: string | null;

  // Specific video for this edition (if any)
  @Column({ type: 'text', nullable: true })
  videoParticularUrl: string | null;

  // Transient / computed count of enrolled participants
  enrolledCount?: number;
  quorumReached?: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
