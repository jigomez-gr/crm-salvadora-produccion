import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Cal.com integration account settings. One row (singleton), single-tenant.
 * Deliberately SEPARATE from AppSettings so the Cal.com API key is not exposed
 * to public unauthenticated endpoints.
 */
@Entity('calcom_account')
export class CalcomAccount {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Cal.com API Key (e.g. cal_live_... or custom API key)
  @Column({ type: 'varchar', nullable: true })
  apiKey: string | null;

  // Cal.com API Base URL (defaults to https://api.cal.com/v1)
  @Column({ type: 'varchar', default: 'https://api.cal.com/v1' })
  baseUrl: string;

  // Whether Cal.com auto-sync is enabled
  @Column({ default: true })
  enabled: boolean;

  // Default Event Type ID to use if service doesn't specify one (number, UUID or slug)
  @Column({ type: 'varchar', nullable: true })
  defaultEventTypeId: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
