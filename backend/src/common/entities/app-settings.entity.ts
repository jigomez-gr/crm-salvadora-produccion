import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * App-wide settings — a SINGLE row (the service get-or-creates it). Holds the
 * white-label branding shown across the app and the onboarding state. Nothing
 * here is a secret: the branding subset is even served publicly so the login
 * screen can render it before authentication.
 */
@Entity('app_settings')
export class AppSettings {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Shown in the sidebar, the login screen and the browser title.
  @Column({ default: 'CRM Salvadora' })
  businessName: string;

  // Primary brand colour (hex), used as the accent for the logo mark.
  @Column({ default: '#4f46e5' })
  brandColor: string;

  // Optional logo — a data: URL or an external image URL. Null = use the
  // default bot mark.
  @Column({ type: 'text', nullable: true })
  logoUrl: string | null;

  // First-run onboarding wizard: false until the operator completes it.
  @Column({ default: false })
  onboardingCompleted: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

// Public, non-sensitive branding subset (served without auth for the login screen).
export interface PublicBranding {
  businessName: string;
  brandColor: string;
  logoUrl: string | null;
}
