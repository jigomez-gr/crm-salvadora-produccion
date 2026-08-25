# ADR 0007 — Authentication, roles & user management

**Status:** Accepted
**Date:** 2026-06-24
**Relates to:** [ADR 0006](0006-security-hardening-and-demo-seed.md) (hardening; this delivers the "auth is the top prerequisite before public deployment" follow-up), [ADR 0002](0002-realtime-sse.md) (SSE). Supersedes the *"endpoints are still unauthenticated"* consequence of ADR 0006.

## Context

ADR 0006 hardened the app but deliberately left it **unauthenticated** — anyone
who could reach the API could read/write all data — and named authentication the
top prerequisite before any real public deployment. The app is now being deployed
to a public VPS (Dokploy), so it needs a login and at least a basic role split:
an **admin** who manages everything (including other users) and **employees** who
use the CRM/agents but cannot manage users. It must stay simple to self-host and
remain single-tenant.

## Decision

### Mechanism — JWT in an httpOnly cookie

- Login (`POST /api/auth/login`) verifies credentials and sets a JWT in an
  **httpOnly, SameSite=Lax** cookie (`Secure` in production via `COOKIE_SECURE`).
  Chosen over `localStorage` because the cookie is not readable by JS (XSS-safe)
  and because the SSE stream (`EventSource`, which cannot send headers) can carry
  it with `withCredentials`. CORS runs with `credentials: true`.
- `JwtAuthGuard` reads the cookie (or an `Authorization: Bearer` header for
  tooling) and attaches `req.user`. `getJwtSecret()` throws under
  `NODE_ENV=production` if `JWT_SECRET` is unset — the API refuses to start
  rather than sign with a known secret.
- Passwords hashed with **bcryptjs** (pure JS, no native build — friendly on
  Windows and for non-technical users).

### Roles & enforcement

- Two roles on the `User` entity: `admin`, `employee`.
- **Per-controller guards**, not a global guard: every domain controller is
  `@UseGuards(JwtAuthGuard)`; `UsersController` adds `RolesGuard` + `@Roles(ADMIN)`.
  A global `APP_GUARD` (or an `@Global` AuthModule) was rejected because the
  library-provided health/`*` routes from `@mastra/nestjs` can't be annotated, and
  because a global/late-registered module places its routes **after** Mastra's
  `/api/*` catch-all and gets shadowed. For the same ordering reason, `AuthModule`
  is **not** `@Global` and is imported (before `AgentsModule`) by each domain
  module that needs the guard.

### User management — admin-only, no self-registration

- `UsersController` (admin-only) is full CRUD over system users. There is **no
  open registration**: only an admin creates accounts.
- An **initial admin** is bootstrapped on the first run against an empty users
  table, from `ADMIN_EMAIL` / `ADMIN_PASSWORD` (a default password is used with a
  loud warning if unset).
- Hardening: strong-password policy (length + upper/lower/digit/symbol, shared
  with the frontend), generic `Credenciales inválidas` on login, a tighter
  per-route rate limit on `/auth/login`, anti-lockout guards (cannot delete your
  own account or remove the last active admin), and `passwordHash` is never
  returned (`UsersService.sanitize`).

## Consequences

- **Supersedes ADR 0006's "still unauthenticated" consequence:** every domain
  endpoint now requires a session. The only intentionally-public endpoints are
  `POST /api/auth/login` and the signature-verified WhatsApp webhook.
- **Production requirements:** `JWT_SECRET` (required), `COOKIE_SECURE=true`, the
  app behind HTTPS, and the initial admin password changed. These are wired into
  `docker-compose.prod.yml` / `.env.production.example`.
- **Frontend:** `AuthProvider` + `AuthGate` gate all routes (unauthenticated →
  `/login`); `apiFetch` uses `credentials: 'include'`; SSE uses `withCredentials`;
  the Users screen and its sidebar link are admin-only (defense-in-depth — the API
  still enforces it).
- **Still single-tenant:** all authenticated users share the same contacts,
  calendar and agents. Granular/per-section permissions, SSO and email-based
  password reset remain future work (PRD §9).
