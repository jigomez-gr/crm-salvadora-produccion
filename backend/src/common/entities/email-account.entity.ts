import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * The single business email account used to send mail to contacts. One row
 * (get-or-created), single-tenant. Deliberately SEPARATE from `AppSettings`
 * because `GET /api/settings` returns the whole settings row to any authenticated
 * user — the SMTP password must never ride along. Email config is served only
 * through the sanitized `/api/email/config` (admin), which strips the password.
 *
 * SMTP is the universal transport: it works for Gmail (app password), Outlook and
 * any custom-domain mailbox with one shape (host/port/secure/user/password).
 */
@Entity('email_account')
export class EmailAccount {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Sender identity shown to recipients ("Nombre" <address>).
  @Column({ type: 'varchar', nullable: true })
  fromName: string | null;

  @Column({ type: 'varchar', nullable: true })
  fromAddress: string | null;

  // SMTP server.
  @Column({ type: 'varchar', nullable: true })
  smtpHost: string | null;

  @Column({ type: 'int', default: 587 })
  smtpPort: number;

  // true = implicit TLS (usually port 465); false = STARTTLS (usually 587).
  @Column({ default: false })
  smtpSecure: boolean;

  @Column({ type: 'varchar', nullable: true })
  smtpUser: string | null;

  // SECRET — never returned by the API (sanitized to a `hasSmtpPassword` boolean).
  @Column({ type: 'varchar', nullable: true })
  smtpPassword: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
