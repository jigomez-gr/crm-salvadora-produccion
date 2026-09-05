import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('zadarmasmsrespuesta')
export class ZadarmaSmsLog {
  @PrimaryGeneratedColumn()
  id: number;

  @CreateDateColumn({ type: 'timestamp with time zone', default: () => 'CURRENT_TIMESTAMP' })
  fecharegistro: Date;

  @Column({ type: 'int', nullable: true })
  httpstatuscode: number;

  @Column({ type: 'varchar', length: 50, nullable: true })
  status: string;

  @Column({ type: 'int', default: 1 })
  messages: number;

  @Column({ type: 'decimal', precision: 10, scale: 4, default: 0 })
  costtotal: number;

  @Column({ type: 'varchar', length: 10, default: 'EUR' })
  currency: string;

  @Column({ type: 'varchar', length: 50, default: 'Teamsale' })
  callerid: string;

  @Column({ type: 'varchar', length: 64 })
  numerodestino: string;

  @Column({ type: 'decimal', precision: 10, scale: 4, default: 0 })
  cost: number;

  @Column({ type: 'decimal', precision: 10, scale: 4, default: 0 })
  costmin: number;

  @Column({ type: 'decimal', precision: 10, scale: 4, default: 0 })
  costmax: number;

  @Column({ type: 'text', nullable: true })
  mensaje: string;

  @Column({ type: 'int', default: 1 })
  parts: number;

  @Column({ type: 'text', nullable: true })
  rawjsonrespuesta: string;
}
