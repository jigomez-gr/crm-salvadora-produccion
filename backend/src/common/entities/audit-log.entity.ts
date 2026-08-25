import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * Append-only audit trail of governance-relevant actions (auth + user
 * management + data deletion). One row per action. Never updated or deleted by
 * the app — it's the record of who did what, when.
 *
 * The actor is snapshotted (`actorId` + `actorEmail`) so the entry stays
 * readable even after that user is deleted. No request bodies / message text /
 * other PII is stored here — only a short Spanish summary and minimal metadata.
 */
@Entity('audit_logs')
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Who performed the action. Null = the system (e.g. an automated job).
  @Column({ type: 'uuid', nullable: true })
  actorId: string | null;

  // Snapshot of the actor's email at the time — survives the user's deletion.
  @Column({ type: 'varchar', nullable: true })
  actorEmail: string | null;

  // Machine-readable action key, e.g. 'auth.login', 'user.create'. Indexed for
  // filtering.
  @Index()
  @Column()
  action: string;

  // What the action targeted, e.g. 'user' / 'contact' / 'appointment'.
  @Column({ type: 'varchar', nullable: true })
  targetType: string | null;

  // The target's id (kept as text — targets may be uuid or a string key).
  @Column({ type: 'varchar', nullable: true })
  targetId: string | null;

  // Human-readable Spanish summary shown in the audit screen.
  @Column({ type: 'text' })
  summary: string;

  // Originating IP (best-effort, from the proxy-aware request).
  @Column({ type: 'varchar', nullable: true })
  ip: string | null;

  // Small structured, non-PII detail (e.g. which fields changed). Optional.
  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @Index()
  @CreateDateColumn()
  createdAt: Date;
}
