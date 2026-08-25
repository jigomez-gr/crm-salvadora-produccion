import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * The business payment account settings (Stripe). One row (get-or-created),
 * single-tenant. Deliberately SEPARATE from `AppSettings` so API secrets
 * (secretKey, webhookSecret) are never exposed via general public settings.
 *
 * Supports Card, Apple Pay / Google Pay, Bizum, and automatic Stripe Checkout /
 * Payment Links.
 */
@Entity('payment_account')
export class PaymentAccount {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Stripe Publishable Key (pk_test_... / pk_live_...)
  @Column({ type: 'varchar', nullable: true })
  publishableKey: string | null;

  // Stripe Secret Key (sk_test_... / sk_live_...) — SECRET (masked in API responses)
  @Column({ type: 'varchar', nullable: true })
  secretKey: string | null;

  // Stripe Webhook Signing Secret (whsec_...) — SECRET (masked in API responses)
  @Column({ type: 'varchar', nullable: true })
  webhookSecret: string | null;

  // Currency code (e.g. 'eur', 'usd')
  @Column({ type: 'varchar', default: 'eur' })
  currency: string;

  // Enable payment methods in Checkout
  @Column({ default: true })
  enableCard: boolean;

  @Column({ default: true })
  enableBizum: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
