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

export enum MediaType {
  VIDEO = 'video',
  DOCUMENT = 'document',
  FLYER = 'flyer',
  AUDIO = 'audio',
  IMAGE = 'image',
}

@Entity('media_assets')
export class MediaAsset {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ length: 100 })
  key: string;

  @Column({ length: 255 })
  title: string;

  @Column({
    type: 'varchar',
    length: 50,
    default: MediaType.VIDEO,
  })
  mediaType: string;

  @Column({ length: 100 })
  mimeType: string;

  @Column({ type: 'text' })
  physicalPath: string;

  @Column({ type: 'text', nullable: true })
  publicUrl: string | null;

  @Column({ type: 'bigint', nullable: true })
  fileSizeBytes: number | null;

  @Index()
  @Column({ nullable: true })
  serviceId: string | null;

  @ManyToOne(() => Service, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'serviceId' })
  service: Service | null;

  @Column({ type: 'jsonb', default: '{}' })
  metadata: Record<string, any>;

  @Column({ default: true })
  isActive: boolean;

  @Column({ type: 'int', default: 0 })
  displayOrder: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
