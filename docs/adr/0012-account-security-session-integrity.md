# ADR 0012 — Account security & session integrity

**Status:** Accepted
**Date:** 2026-06-30
**Relates to:** [ADR 0007](0007-authentication-and-roles.md) (auth + roles), [ADR 0008](0008-production-hardening-migrations-validation-booking-integrity.md) (hardening / migrations). Opens the phase-4 "account & data governance" line.

## Context

ADR 0007 added login (JWT in an httpOnly cookie) and two roles, but left three
real gaps for a self-hosted, single-tenant deployment:

1. **No way to change your own password.** Only an admin could change a password
   (by editing the user), and the bootstrap admin could run indefinitely on the
   public default `Admin1234!`.
2. **The JWT was trusted on its own.** The guard verified the token's signature
   and expiry and nothing else, so a token stayed valid for its whole lifetime
   (default 1 day) even after the account was **deactivated or deleted**, after
   the **password was changed/reset**, or after a **role change**. There was no
   way to force-log-out a session.
3. **No forced password change.** An admin-set password (on create or reset) is a
   temporary handoff secret, but the user was never made to replace it.

## Decision

### Self-service password change (`POST /api/auth/change-password`)

- Verifies the **current** password, enforces the shared strong-password policy
  (`passwordPolicyIssues`, the same rules the UI mirrors), and rejects "same as
  current".
- **Re-issues the session cookie** with a fresh token, so the acting session
  stays alive while every *other* session is invalidated (see below). The pure
  flow lives in `UsersService.changeOwnPassword`; `AuthService.changePassword`
  re-signs the token.

### The guard is stateful — validate the live user every request

`JwtAuthGuard` now, after verifying the JWT, loads a minimal live projection
(`UsersService.getAuthState`) and rejects a still-valid token when:

- the user is **unknown/deleted** or **deactivated** → 401 (no waiting for expiry);
- the token's `iat` **predates** the user's `passwordChangedAt` → 401 (a password
  change/reset logs out every other session).

It then attaches `req.user` from the **DB** (role/name/email), so a **role change
applies immediately**. The stale-token decision is the pure, unit-tested
`isSessionStale(iatSeconds, passwordChangedAt)` — compared at **one-second
granularity** (JWT `iat` is floored to the second, and the change-password
endpoint re-signs in the same instant, so a token issued in the same second as
the change is intentionally treated as *fresh*), failing closed on a missing
`iat`. Mirrors the pure-core pattern of `reminder-selection.ts` /
`inbound-parser.ts`.

### Forced password change (`mustChangePassword`)

A boolean on `users` set when:

- an admin **resets another user's** password (`UsersService.update`, when the
  acting admin id ≠ the target id — a self-edit is a deliberate change, not a
  reset);
- an admin **creates** a user (the typed password is a handoff secret);
- the initial admin is **bootstrapped on the public default** password.

While set, the guard returns **403 `PASSWORD_CHANGE_REQUIRED`** on every route
except those marked `@AllowPasswordChangePending()` (`auth/me`, `auth/logout`,
`auth/change-password`). The SPA renders a mandatory `ForcePasswordChange`
screen (no sidebar) driven by the `mustChangePassword` flag from `/api/auth/me`
+ login — but enforcement is server-side, so it isn't only UX. The
`AllExceptionsFilter` now passes through an optional machine-readable `code`.

### DI consequence

`@UseGuards(JwtAuthGuard)` instantiates the guard in **each consuming module's**
injector context, so every guarded module must resolve the guard's new
`UsersService` dependency. `AuthModule` therefore **re-exports `UsersModule`**
(and `UsersModule` self-provides `UsersService` for its own controller). This is
the cleanest single point of change versus importing `UsersModule` everywhere.

## Alternatives considered

- **Stateless token versioning (a `tokenVersion` claim) without a DB read.**
  Avoids the per-request query but still needs the live version to compare, so it
  doesn't actually remove the DB hit; `passwordChangedAt` is simpler and also
  powers "logged out other sessions". Rejected.
- **Enforce `mustChangePassword` only at login / only in the UI.** Wouldn't catch
  a user whose password an admin resets while they already hold a live session,
  and a direct API caller would bypass the UI gate. Rejected — enforce in the guard.
- **Short token TTL instead of live validation.** Reduces the lingering-session
  window but never closes it and worsens UX (frequent re-login). Live validation
  is exact.
- **A short clock-skew tolerance instead of second-granularity.** Unnecessary:
  flooring both sides to the second already makes the re-issued acting token
  survive while older tokens are rejected.

## Consequences

- Users manage their own passwords; admin resets/creations hand out temporary
  passwords; deactivation, deletion, password change and role change all take
  effect on the **next request**, not at token expiry.
- The auth guard now does **one indexed `users` lookup per authenticated
  request** — negligible for this single-tenant, self-hosted app and the price of
  real session control.
- Schema: two columns on `users` (migration `Phase4AccountSecurity`, additive, no
  backfill) — `mustChangePassword` (NOT NULL default false) and `passwordChangedAt`
  (nullable). Existing rows keep their sessions (null `passwordChangedAt`) and are
  not force-changed (false) — no surprise lockout on upgrade.
- **Caveat:** there is no email-based "forgot password" — a locked-out user still
  needs an admin to reset them (out of scope for single-tenant; see PRD §9).
