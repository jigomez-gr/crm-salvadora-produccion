# ADR 0017 — Automated testing: integration harness + pure-core units

**Status:** Accepted
**Date:** 2026-07-01
**Relates to:** [ADR 0012](0012-account-security-session-integrity.md) (the stateful guard these tests exercise), [ADR 0014](0014-contacts-fields-and-csv.md) (the partial-update regression they lock in), [ADR 0001](0001-tech-stack.md) (NestJS/Mastra). First slice of the phase-5 "hardening" line.

## Context

Phases 1–4 shipped a lot of security- and data-critical logic — a **stateful**
auth guard, role enforcement, a forced-password-change gate, session
invalidation, request validation, and a contacts partial-update that had already
regressed once (silently wiping fields, ADR 0014). The only automated coverage
was **pure-core unit tests** (`reminder-selection`, `csv`, `consent-keywords`,
`session-integrity`, `inbound-parser`, `availability`). The actual HTTP wiring —
the guard hitting the live DB, the global `ValidationPipe`, the `/api` prefix,
cookie issuance, the `RolesGuard` — had **no automated tests**, so a regression
in exactly the code most dangerous to break would pass CI unnoticed.

The obvious fix — boot the real app in Jest and drive it with HTTP — hits a hard
wall: `@mastra/*` (pulled in by `AgentsModule`/`WhatsappModule`) ships **ESM**
(e.g. `tokenx` as `.mjs`). Jest's CommonJS transform can't load it, so merely
`import`-ing any file that imports `@mastra/nestjs` crashes the runner at require
time.

## Decision

### A shared `configureApp(app)`

The framework configuration in `main.ts` (security headers, cookie parser, body
limits, `ValidationPipe`, the `AllExceptionsFilter`, the `/api` global prefix,
CORS) is extracted into `backend/src/configure-app.ts`. `main.ts` now just adds
`app.listen()`. The e2e harness calls the same function, so **tests boot the app
exactly the way production does** — same routes, same validation, same cookies.

### Integration tests against a throwaway Postgres DB

`backend/test/critical-routes.e2e-spec.ts` (run with `pnpm test:e2e`) uses
`supertest`. The harness (`test/utils/e2e-app.ts`):

- **drops + recreates** a `crm_e2e_test` database on the **same** Postgres the
  dev DB uses (host port 5433) — so it never touches the developer's real data,
- boots with `NODE_ENV=test` so TypeORM `synchronize` builds the schema from the
  entities (no migrations needed for the throwaway DB),
- bootstraps a known admin via `ADMIN_EMAIL`/`ADMIN_PASSWORD`.

It needs the dev DB running (the same precondition as `pnpm migration:generate`).

### A Mastra-free `TestAppModule`

Because `@mastra/*` can't load under Jest, the suite boots
`backend/test/test-app.module.ts` — a mirror of `AppModule` that imports the
**Mastra-free** half (`Auth`, `Users`, `Contacts`, `Audit`) and omits the
agent/whatsapp/cron/seed modules. It also omits the global `ThrottlerGuard` so
the suite's repeated logins aren't 429'd. Its entity list must stay in sync with
`app.module.ts` / `data-source.ts`.

### The webhook's fail-closed property → a pure unit test

The YCloud webhook can't be reached in the Mastra-free module, but its
**security-critical** part is the HMAC signature check. That logic is extracted
into the pure `backend/src/whatsapp/ycloud-signature.ts`
(`verifyYCloudSignature(rawBody, signature, secret, nowSeconds?)`, with an
injectable clock) and unit-tested exhaustively in `ycloud-signature.spec.ts`:
**fail-closed when no secret**, valid signature inside the replay window, stale/
future timestamp, tampered body, wrong secret, malformed headers. That's a
stronger, faster check than an e2e could give.

### What the e2e locks in

Login (good/bad credentials + an httpOnly cookie); the guard (401 unauthenticated;
**a password reset invalidates a live session immediately**); the `RolesGuard`
(an employee gets 403 on `/api/users`); the forced-password-change gate (403
`PASSWORD_CHANGE_REQUIRED`, with `change-password` still reachable); the
`ValidationPipe` (400 on a bad body); and the **contacts partial-update
regression** — a status-only `PATCH` must not wipe the name.

## Alternatives considered

- **Boot the real `AppModule` with `transformIgnorePatterns` allow-listing
  `@mastra` + its transitive ESM.** Brittle (a deep, shifting dependency chain),
  slow, and it would drag the whole Mastra runtime into every test boot.
  Rejected.
- **Mock `@mastra/*` via `moduleNameMapper`.** Many stubs, and the
  `registerAsync` factory constructs real `PostgresStore`/`Mastra` instances —
  high-maintenance and low-fidelity. Rejected.
- **SQLite / in-memory DB.** Diverges from Postgres (enum types, `pg_advisory`
  locks, `ILIKE`, `jsonb`, `timestamptz`) — exactly the things these tests must
  trust. Rejected in favour of a real throwaway Postgres database.
- **Test against the dev DB directly.** Would mutate the developer's real
  contacts/users. Rejected — a dedicated `crm_e2e_test` is dropped/recreated per
  run.

## Consequences

- Two tiers: `pnpm test` (unit, **no DB**, fast, CI-trivial — 59 tests) and
  `pnpm test:e2e` (needs Postgres up — 10 tests over the critical routes).
- `configure-app.ts` is now the single source of bootstrap truth; `main.ts` and
  tests can't drift on global config.
- `TestAppModule`'s entity/module list must track `app.module.ts`. Extending the
  e2e to agent/webhook routes would first require solving the `@mastra` ESM
  transform.
- The YCloud signature check is now reusable pure code, consistent with the
  project's other pure-core modules.
