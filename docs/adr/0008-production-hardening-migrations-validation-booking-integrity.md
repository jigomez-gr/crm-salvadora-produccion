# ADR 0008 — Production hardening: migrations, input validation & booking integrity

**Status:** Accepted
**Date:** 2026-06-30
**Relates to:** [ADR 0006](0006-security-hardening-and-demo-seed.md) (hardening), [ADR 0007](0007-authentication-and-roles.md) (auth). Supersedes ADR 0006's *"`synchronize: true` (prototype) — no migrations"* consequence.

## Context

A deep audit found the template solid as a teaching tool but not safe to put a
real business on. Three classes of problem stood out, all converging on data
integrity and a safe production runtime: (1) the schema was derived by
`synchronize: true` on every boot, so any entity change a student makes could DROP
columns/tables and lose data; (2) request bodies were untyped interfaces with no
runtime validation, so the API accepted invalid dates, unbounded strings and
wrong types (500s, bad data); (3) booking — the product's core — had **no
overlap protection at any level**, so two customers (or two concurrent webhooks)
could be booked into the same slot, and deletes hard-removed history.

## Decision

### Schema is migration-based in production

- `app.module.ts`: `synchronize: NODE_ENV !== 'production'` and
  `migrationsRun: NODE_ENV === 'production'`. Dev keeps zero-config synchronize;
  prod applies versioned migrations on boot.
- A standalone `src/data-source.ts` drives the CLI (`pnpm migration:generate|run|revert|show`).
- The **initial migration is idempotent** (`CREATE … IF NOT EXISTS`, guarded enum/
  FK creation). An existing deployment whose schema was built by `synchronize`
  records it as a no-op **baseline** on first boot — no manual step. Later
  migrations need not be idempotent.
- Container healthchecks gate rollout; migrations run before `app.listen()`, so a
  healthy API implies a migrated, connected DB.

### Global input validation + uniform errors

- DTOs are **classes** with `class-validator`; a global `ValidationPipe`
  (`whitelist`, `transform`) validates and strips every body. `forbidNonWhitelisted`
  is off so a client sending an extra field (e.g. the sanitized agent echo) is
  cleaned, not rejected.
- A global `AllExceptionsFilter` returns `{statusCode,error,message,requestId,timestamp}`
  and never leaks stack traces on 5xx; the `requestId` aids support.
- Fail-fast env validation (`common/env.ts`) aborts a misconfigured production
  boot (missing `JWT_SECRET`/`CORS_ORIGIN`/`DATABASE_URL`, or default `ADMIN_PASSWORD`).

### Booking integrity

- **No double-booking via an advisory lock, not a DB constraint.** `create()` and
  the time-changing path of `update()` run in a transaction that takes
  `pg_advisory_xact_lock(BOOKING_LOCK_KEY)`, then re-checks overlap before insert.
  This is race-safe and holds across multiple app instances. An `EXCLUDE USING gist`
  constraint was rejected because TypeORM can't model it (every `migration:generate`
  would emit a spurious `DROP`) and because it would fail to install on a DB with
  pre-existing overlaps. The lock keys on a constant today; it becomes per-resource
  when multi-resource scheduling lands.
- Overlap is half-open (`[start, end)`): adjacent appointments don't conflict.
- Business validation: `endsAt > startsAt` always; no booking in the past on create.
- **Cancellation is logical:** `DELETE` and PATCH→`cancelled` set
  `cancelledAt/cancelledBy/cancellationReason`; rows (and history) are preserved.
- Phone numbers are normalised to **E.164** (`libphonenumber-js`) at a single
  point — strict on manual create/update, lenient on the WhatsApp upsert — so the
  same person isn't duplicated across channels.
- New `appointments` columns (`agentKey`, `notes`, `price`, cancellation fields,
  `updatedAt`) + indexes on `startsAt`, `(status, startsAt)`, `contactId`;
  `contacts.updatedAt`.

## Consequences

- Evolving the data model no longer risks data loss; the schema change path is
  explicit and reviewable. Non-technical users get a green **CI** (lint + build +
  test) before anything deploys, and documented **backups + restore**.
- The booking flow is correct under concurrency and preserves history.
- Trade-offs: the advisory lock serialises all bookings (fine for one resource;
  revisit for multi-resource). `migration:generate` requires the dev DB running.
- Still single-tenant; reminders, message delivery state, GDPR tooling and the
  white-label settings screen are tracked as later phases.
