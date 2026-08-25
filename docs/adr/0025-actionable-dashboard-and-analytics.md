# ADR 0025 — Actionable dashboard (Inicio) + richer analytics (Informes)

**Status:** Accepted
**Date:** 2026-07-01
**Relates to:** [ADR 0020](0020-reports-analytics.md) (reports base), [ADR 0023](0023-crm-lead-pipeline-kanban.md) (pipeline), [ADR 0002](0002-realtime-sse.md) (SSE), [ADR 0019](0019-list-pagination.md) (pagination envelope). Phase-6 slice.

## Context

Inicio and Informes were **passive**: Inicio showed four static counters + a
read-only conversation list (nothing clickable, no next action); Informes showed
KPIs and bar charts with no trend, no drill-through, no attribution and no export.
For a booking-driven service business run by a non-technical operator, the home
screen should answer **"what do I do now?"** and the reports should answer
**"what's working, and is it getting better?"** — both from the data we already
store (contacts + `pipelineStage` + `source`, appointments + the dormant `price`
column, messages, conversations). No new tables.

## Decision

Everything is **clickable / deep-linked**, aggregation stays in **pure,
unit-tested cores**, and new READ endpoints were added only where a widget needed
data not already served. No chart library — the hand-rolled SVG/Tailwind toolkit
was extended (`components/charts/`).

### Inicio (`frontend/src/app/page.tsx`) — an action panel

- **Quick actions** (Nuevo contacto → `/contacts?new=1`, Nueva cita →
  `/calendar?new=1`, Ir al inbox with an unread badge).
- **"Necesita tu atención"** — a conditional queue built from cheap counts
  (unread, handoff, citas de hoy, leads sin contactar, agentes desactivados); each
  row deep-links to the right screen. Empty → a positive "todo al día" state.
- **Clickable KPI tiles** — Citas hoy · Sin leer · En modo manual · Contactos
  (the two inbox signals replace the low-signal "Próximas citas"/"Agentes
  activos"). `0` is a real value, not `—`.
- **Agenda de hoy**, **conversaciones recientes** (now clickable → open the
  thread), and a **pipeline mini-funnel**. All refresh live on the existing SSE
  events (`appointment.created`, `contact.updated`, `conversation.updated`,
  `message.*`).

### New / extended backend endpoints

- **`GET /api/appointments/today`** — the day's agenda (all statuses, chronological,
  with contact). The business-day window is the pure, unit-tested
  `businessDayWindow(now, tz)` extracted from `countToday` (no more duplicated tz
  math). Declared **before** `GET :id` (Nest route ordering).
- **`GET /api/contacts/board/summary`** — per-stage counts (one `GROUP BY`, no card
  payload) for the mini-funnel. Declared before `:id`/`board/reorder`.
- **`GET /api/dashboard/metrics`** extended with `unreadConversations` +
  `handoffConversations` (via `MessagesService.inboxCounts()` — one grouped
  `SUM`/`COUNT FILTER`, no N+1), `newLeads` (`pipelineStage='new'`), and
  `agentsTotal`.
- **`Appointment.price`** (a dormant `numeric` column) is now wired: optional
  `@IsNumberString` on the create/update DTOs, persisted field-by-field (partial-
  update rule; `null` clears), and an optional "Precio (€)" input on the calendar
  form. **No migration.**

### Informes (`frontend/src/app/reports/page.tsx`) + aggregation

`report-aggregation.ts` (pure) gained, all in the **same single pass** / cheap
grouped queries — no new tables, no N+1:

- **`byService`** (top 8 by count + "Otros") with per-service completion +
  revenue; **`revenue`** total + `byDay` (excludes cancelled; `numeric` parsed
  `String→Number`, null→0).
- **conversion funnel** (`buildConversionFunnel`): a **monotonic at-or-beyond**
  snapshot of the pipeline (LEAD → CONTACTADO → CUALIFICADO → CON CITA → CLIENTE,
  excludes terminal `lost`), so it never renders broken and each step ratio is a
  real pass-rate.
- **source attribution** (`buildSourceStats`): case-insensitively merged, top 6 +
  "Otros", "Sin origen" kept apart; `converted` = reached `booked|won`.
- **trends vs the previous window** (`computeTrend`/`computeTrends`): the service
  fetches the immediately-preceding equal-length window `[prevFrom, from-1ms]`
  (exclusive of `from` so a boundary row isn't double-counted) and diffs the four
  KPIs. Semantics are outcome-based (a drop in **cancellations** is *good*/green);
  `previous=0` → "nuevo"; tiny samples render neutral.

The screen: presets **7/30/90 + custom range** (persisted in `localStorage`),
trended clickable KPIs, the funnel (hero), citas/día with **clickable bars**
(→ `/calendar?date=…`), horas punta, a **donut** of contact status, top services,
capture sources, an auto-hiding **revenue** card ("estimado", only when
`revenue>0`), messages/día demoted to a **sparkline**, and a client-side **CSV
export** of the daily series (formula-injection-safe).

### Drill-through wiring

The target pages now read their deep-link params under a **Suspense boundary**
(App Router requirement for `useSearchParams`), via lazy `useState` initializers
(no synchronous `setState` in an effect — React 19): contacts (`?status`/`?new`/
`?search`), conversations (`?thread`), calendar (`?date`/`?new`).

## Alternatives considered

- **A charting library (recharts/Chart.js/nivo).** Rejected again — drags d3,
  complicates `use client`/SSR and the dynamic brand colour, contradicts the small-
  VPS ethos. The hand-rolled SVG toolkit (Funnel/Donut/HBars/Sparkline/StackedBars)
  covers it.
- **Period-cohort funnel (new contacts → those that booked → completed).** Needs a
  contact↔appointment join and can exceed 100% with repeat customers (looks
  broken). The pipeline **snapshot** funnel is honest, monotonic and cheap; labeled
  "estado actual".
- **Revenue as a must-have / a new price entity.** The `price` column already
  existed; wiring it is near-free and the widget auto-hides when unused. Kept as a
  clearly-labeled *estimate* (list price, not invoicing) rather than inventing €.
- **SSE on Informes.** Rejected — a point-in-time report that repaints mid-read is
  jarring; it refreshes only on range change.
- **New rollup/metrics tables or SQL `date_trunc` bucketing.** Premature; live
  aggregation over the indexed columns is cheap for a single business (same
  reasoning as ADR 0020).

## Consequences

- A genuinely actionable home + decision-grade analytics, still **migration-free**.
- Aggregation stays pure and unit-tested (service/revenue/funnel/source/trend
  cases + the `businessDayWindow` tz cases) — 128 unit tests total.
- Two small new READ endpoints; the dashboard load is 4 cheap queries (no N+1).
- Revenue reporting is unlocked the moment an owner starts filling prices; nothing
  breaks when they don't.
- A wide custom range fetches more rows (bounded per single-business volume) and
  now also the previous window for trends — still cheap; revisit with SQL/rollups
  only if a deployment's data grows large.
