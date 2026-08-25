# ADR 0020 — Reports / analytics (no new tables)

**Status:** Accepted
**Date:** 2026-07-01
**Relates to:** [ADR 0001](0001-tech-stack.md) (stack), the dashboard metrics endpoint. Phase-5 hardening, slice 5.

## Context

The "dashboard" was four raw counters (`contactsCount`, `appointmentsToday`,
`upcomingAppointments`, `activeAgents`). There was no over-time view, no
completion/cancellation rates, no lead→active conversion, no per-hour or
message-volume breakdown — all of which a small business would actually use, and
all of which are **derivable from the existing** appointment / contact / message
rows.

## Decision

A read-only analytics feature over the existing data — **no new tables**.

- **`GET /api/reports/summary?from&to`** (`JwtAuthGuard`, **not** admin-only —
  it's aggregate, non-PII business data, useful to any operator, unlike the
  audit trail). `ReportsQueryDto` validates the optional ISO date range; the
  service defaults to the **last 30 days**.
- **`ReportsService`** injects the `Appointment` / `Contact` / `Message` repos
  (`TypeOrmModule.forFeature`, no new entity), runs **bounded** range queries
  (appointments by `startsAt`, messages/new-contacts by `createdAt`) plus one
  grouped **contacts-by-status snapshot**, and hands the rows to the pure
  aggregator.
- **`report-aggregation.ts` is pure and unit-tested.** It does all day/hour
  bucketing in the **business timezone** (`TZDate`, like
  `AppointmentsService.countToday`) so charts aren't shifted 1–2h vs the
  container's UTC. It produces: appointments `byStatus` + completion/cancellation
  **rates**, a continuous `byDay` series (`enumerateDays` fills gaps) and a 24-bucket
  `byHour`; contacts `byStatus` + **conversion rate** + new-contacts `byDay`;
  messages inbound/outbound totals + `byDay`.
- Registered **before `AgentsModule`** in `app.module.ts` so `/api/reports/*`
  isn't shadowed by Mastra's `/api/*` catch-all (same gotcha as audit/settings).
- **Frontend `/reports`** (a new "Informes" sidebar entry, visible to all): a
  range preset (7/30/90 days), a KPI strip, and **hand-rolled SVG/Tailwind
  stacked-bar charts — no chart library** (keeps the bundle/deps minimal,
  consistent with the rest of the app).

## Alternatives considered

- **SQL `date_trunc(... AT TIME ZONE tz)` grouping.** Pushes bucketing into the
  DB, but the timezone expressions are fragile and hard to unit-test. Fetching
  the bounded rows and bucketing in a **pure, tested** function is clearer and
  the row counts are small for a single business. Revisit with SQL aggregation
  (or a cache / rollup table) only if a deployment's data gets large.
- **A charting library (recharts/Chart.js).** Adds a dependency and bundle
  weight; hand-rolled bars cover the need and match the minimal-deps ethos.
- **A pre-aggregated metrics table.** Premature — live aggregation over the
  already-indexed columns (`[status, startsAt]`) is cheap.
- **Admin-only (like the audit trail).** The audit is PII-adjacent governance
  data; reports are aggregate business figures, so any authenticated operator
  can see them.

## Consequences

- Real analytics from existing data — **no migration**.
- The pure aggregator is reusable and fully unit-tested (timezone bucketing,
  rates, continuous day series, empty-safe). Adding a metric = extend the pure
  function + the page.
- A wide date range fetches more rows (bounded per single-business volume); if
  that ever matters, move bucketing to SQL or add a cache — the API shape stays.
- An e2e asserts the summary shape, the auth guard, and range validation.
