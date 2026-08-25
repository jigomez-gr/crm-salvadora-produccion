/**
 * Audit is decoupled via the in-process event bus: producers emit `AUDIT_EVENT`
 * with an `AuditRecord` payload, and `AuditService` persists it. This keeps any
 * module free to record an action without importing the audit module (and
 * avoids a cycle with the now-stateful auth guard, which the audit read API
 * depends on).
 */
export const AUDIT_EVENT = 'audit.record';

/** Well-known action keys. Strings (not a TS enum) so producers stay terse. */
export const AuditAction = {
  LOGIN: 'auth.login',
  PASSWORD_CHANGE: 'auth.password_change',
  USER_CREATE: 'user.create',
  USER_UPDATE: 'user.update',
  USER_DELETE: 'user.delete',
  CONTACT_CREATE: 'contact.create',
  CONTACT_UPDATE: 'contact.update',
  CONTACT_DELETE: 'contact.delete',
  CONTACT_IMPORT: 'contact.import',
  CONTACT_OPT_OUT: 'contact.opt_out',
  CONTACT_OPT_IN: 'contact.opt_in',
  CONTACT_ANONYMIZE: 'contact.anonymize',
  SETTINGS_UPDATE: 'settings.update',
  DATA_CLEAR_DEMO: 'data.clear_demo',
  ONBOARDING_COMPLETE: 'onboarding.complete',
  EMAIL_CONFIG_UPDATE: 'email.config_update',
  EMAIL_SENT: 'email.sent',
} as const;

export interface AuditActor {
  id: string | null;
  email: string | null;
}

export interface AuditRecord {
  actor: AuditActor;
  action: string;
  summary: string;
  targetType?: string | null;
  targetId?: string | null;
  ip?: string | null;
  metadata?: Record<string, unknown> | null;
}
