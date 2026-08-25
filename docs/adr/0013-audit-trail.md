# ADR 0013 — Audit trail

**Status:** Accepted
**Date:** 2026-07-01
**Relates to:** [ADR 0007](0007-authentication-and-roles.md) (auth + roles), [ADR 0012](0012-account-security-session-integrity.md) (account security). Part of the phase-4 "account & data governance" line; future GDPR/opt-out actions (a later ADR) will also record here.

## Context

With self-service password changes, admin resets, deactivation and forced
changes (ADR 0012), a single-tenant operator needs to answer "who did what, and
when?" — especially for security-relevant actions (logins, password changes,
user management). There was no record. We want an **append-only** trail,
readable by admins, that:

- survives the deletion of the user who acted (so the entry still names them);
- never stores customer PII or message text (it's an operational log, not a data
  export);
- never breaks or slows the action it records if the audit write fails.

## Decision

### Append-only `audit_logs` table

One row per action: a **snapshot** of the actor (`actorId` + `actorEmail`, so
the entry is still readable after that user is deleted), an `action` key
(`auth.login`, `user.create`, …), an optional `targetType`/`targetId`, a short
Spanish `summary`, the originating `ip`, and small non-PII `metadata` jsonb
(e.g. `{changed:['password']}`). Indexed on `action` and `createdAt`. The app
never updates or deletes rows.

### Writes are decoupled via the event bus

Producers inject `EventEmitter2` and **emit** `AUDIT_EVENT` (`'audit.record'`)
with an `AuditRecord`. `AuditService` handles it with `@OnEvent` and persists
**best-effort** — a failed write is logged, never thrown back into the request
(audit is deliberately *not* transactional with the action it records). Two
benefits:

- **No coupling.** Any module records an action without importing the audit
  module — it just emits an event (the emitter is global).
- **No cycle.** The audit *read* controller is admin-guarded, so it depends on
  the now-stateful auth guard (→ `UsersService` via `AuthModule`). If producers
  had to import an `AuditModule` that itself imports `AuthModule`, auth↔audit
  would cycle. Events sidestep it entirely.

Wired today: `auth.login`, `auth.password_change`, `user.create|update|delete`.

### Read API — admin only

`GET /api/audit` behind `JwtAuthGuard` + `RolesGuard` + `@Roles(ADMIN)` (the same
double guard as user management), paginated (`limit` ≤ 200 / `offset`, newest
first) and filterable by `action` / `actorId`. The frontend adds an admin-only
**Auditoría** screen.

## Alternatives considered

- **A global interceptor that auto-logs every mutating request.** Less code at
  call sites, but it can't produce a meaningful Spanish summary (it doesn't know
  intent), tends to log noise (and risks logging request bodies = PII), and
  struggles with `204` responses (no body to describe the target). Rejected for
  explicit, intentional events with hand-written summaries.
- **Direct `AuditService` calls from each producer.** Simple, but forces every
  producing module to import the audit module, which reintroduces the auth↔audit
  cycle and couples unrelated modules. Events are the looser coupling.
- **Write the audit row in the same transaction as the action.** Stronger
  guarantee, but a logging failure would then roll back a legitimate action
  (e.g. a real login) — wrong trade-off. Best-effort is correct for an audit log.

## Consequences

- Admins get a searchable record of security/user-management actions; entries
  survive actor deletion and stay PII-light.
- New `audit_logs` table (migration `Phase4AuditLog`, a standalone table, no FKs).
- **Best-effort caveat:** an action whose audit write fails (e.g. DB blip) still
  succeeds and is *not* recorded — acceptable for this app; the failure is logged
  server-side. If stronger guarantees are ever needed, revisit transactional writes.
- **Mastra ordering caveat:** the audit read controller must be registered
  comfortably before `AgentsModule` in `app.module.ts` (Mastra's `/api/*`
  catch-all shadows a guarded route registered too close to it). See
  `backend/CLAUDE.md` → Audit trail.
- Coverage grows over time (contacts, GDPR/opt-out, agent config) by emitting
  more `AUDIT_EVENT`s — no structural change needed.
