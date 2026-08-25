# ADR 0010 — Scheduled WhatsApp appointment reminders

**Status:** Accepted
**Date:** 2026-06-30
**Relates to:** [ADR 0005](0005-ui-multi-agent-openrouter.md) (per-agent YCloud), [ADR 0008](0008-production-hardening-migrations-validation-booking-integrity.md) (migrations), [ADR 0009](0009-conversations-delivery-status-and-handoff.md) (delivery status / HSM sending). Continues the "reliable messaging" line.

## Context

A real booking business loses money to no-shows. The single highest-value
automation a CRM can add is an **appointment reminder** — but doing it right has
three traps: (1) WhatsApp forbids free-text outside a 24h window, so reminders
**must** use an approved template (HSM); (2) a naive "send if start − now ≤ 24h"
rule sends a "24h before" reminder to a *same-day* booking; (3) a cron that runs
on every instance, or overlaps itself, **double-sends**.

## Decision

### Scheduling

- `@nestjs/schedule` (`ScheduleModule.forRoot()` in `app.module.ts`).
  `RemindersService.@Cron('*/15 * * * *')` calls `runOnce(now)`. The cron is
  always registered; **actual sends are gated per agent** (`remindersEnabled` +
  `reminderTemplateName`), so it's a cheap no-op until configured.
- Reminder offsets: **24h and 2h** before the appointment (`REMINDER_OFFSETS`,
  fixed for v1, documented as adaptable).

### "Which reminders are due" is a pure function

- `selectDueReminders(appointments, alreadySent, now)` (`reminder-selection.ts`)
  has no DB/clock/I/O and is **exhaustively unit-tested**. A reminder fires only
  inside the band `(offset − GRACE, offset]` (`GRACE = 30 min`):
  - **at or just past** the trigger → tolerates a missed tick / brief downtime;
  - **never far before** it → a same-day booking's time-until-start never enters
    the 24h band, so it doesn't get a 24h reminder.
- The cron cadence is kept ≤ `GRACE` so no band is stepped over.

### Idempotent + multi-instance safe

- An `appointment_reminders` row with a **unique `(appointmentId, offsetLabel)`**
  is **claimed before sending**. A concurrent tick or a second app instance hits
  `23505` and bails — the same atomic-claim pattern used for inbound webhook
  dedupe (ADR 0009). On success the row is `sent` (+ `providerMessageId`); a
  persistent failure is `failed` with **no app-level retry** (YCloudClient already
  retries transient 5xx/429; a permanent failure is almost always a misconfigured
  template, which shouldn't be re-attempted every 15 min — it's logged loudly).

### Configuration (per agent, from the UI)

- `AgentConfig` gains `remindersEnabled`, `reminderTemplateName`,
  `reminderTemplateLanguage` (all **non-secret**, returned by the API). The agent
  config screen exposes them. The template is expected to take 3 body params:
  name, service, date+time (formatted in the agent timezone, `es` locale).

## Alternatives considered

- **Boolean flags on `appointment` (`reminder24hSentAt`, …)** instead of a table.
  Rigid (every new offset is a migration) and no place for status/provider id.
  Rejected for a small dedicated table.
- **Send if `start − now ≤ offset` and not sent.** Simpler, but sends stale
  "24h" reminders to last-minute bookings. The band avoids that. Rejected.
- **An external scheduler / queue (BullMQ, cron container).** Overkill for a
  single-tenant self-hosted template; in-process `@nestjs/schedule` + an atomic
  DB claim is multi-instance-safe with zero extra infra.

## Consequences

- Fewer no-shows, with no operator effort once a template is approved + entered.
- The feature is **safe by default** (off until configured) and **safe under
  scale-out** (atomic claim). Brief downtime degrades gracefully (misses at most
  the reminders whose band fully elapsed while down — never duplicates).
- New dependency: `@nestjs/schedule`. New table `appointment_reminders` + 3
  `agent_configs` columns (migration `Phase3Reminders`, no backfill).
- **Caveat:** the HSM template's exact placeholder shape is deployment-specific;
  a mismatch surfaces as a logged send failure, not a crash.
