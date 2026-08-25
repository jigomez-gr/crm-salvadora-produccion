# ADR 0023 — CRM lead pipeline (Kanban board)

**Status:** Accepted
**Date:** 2026-07-01
**Relates to:** [ADR 0014](0014-contact-crm-fields.md) (contact CRM fields), [ADR 0002](0002-realtime-sse.md) (SSE realtime), [ADR 0019](0019-list-pagination.md). Phase-6.

## Context

Contacts already carried a coarse lifecycle `status` (lead / active / inactive), but there was no way to **work** leads through a sales funnel — the core job of a captación-focused CRM. Owners asked for the familiar **Kanban pipeline**: columns of stages, drag cards between them, well integrated with the rest of the app (bookings, inbox, contact detail).

## Decision

### A new `pipelineStage`, distinct from `status`
Add a dedicated **`pipelineStage`** column to `contacts` — the sales funnel — kept **separate from `status`** (the lifecycle). `status` is wired into Informes (conversionRate), the contacts filter and badges; overloading it with six funnel states would break those. The two coexist: `status` = what the contact *is*, `pipelineStage` = where in the funnel you're *working* it. Existing contacts are **backfilled** on migration so the board is meaningful on day one: `active → won`, `inactive → lost`, `lead → new`.

The six stages (owner-chosen, marketing-standard for appointment businesses): **Nuevo · Contactado · Cualificado · Cita agendada · Cliente · Perdido** (`new/contacted/qualified/booked/won/lost`). Values are English (stored); Spanish labels + colours live on the frontend (`lib/pipeline.ts`), per the code-English / UI-Spanish convention. Stored as **varchar, not a PG enum**, so stages can become owner-configurable later without an `ALTER TYPE`.

### Ordering within a column: `boardPosition`
A `double precision` **`boardPosition`** (higher = top) gives manual within-column ordering. A drag computes a **midpoint** between the card's new neighbours (`positionBetween`), so only the moved card is written — no re-indexing the column. New contacts get `Date.now()`; the migration seeds existing rows from `createdAt` (newest nearest the top).

### Move = the existing `PATCH /api/contacts/:id`
Dragging a card sends `{ pipelineStage, boardPosition }` through the **existing** contact update endpoint (added to the DTO + the partial-update field list) — no new write surface, and it reuses the audit trail. A dedicated **`GET /api/contacts/board`** returns the board: contacts grouped by stage (counts exact, cards capped per column — per-column pagination is a documented phase-2), each card enriched with its **next upcoming appointment** (one `DISTINCT ON (contactId)` query — no N+1).

### Integration (the point of "well integrated")
- **Auto-advance on booking.** When an appointment is created — manually *or by the AI agent* (both go through `AppointmentsService.create → 'appointment.created'`) — a `@OnEvent` handler in `ContactsService` advances the lead to **"Cita agendada"** if it's behind (and re-engages a LOST lead). Decoupled via the event bus, so `ContactsModule` needn't depend on `AppointmentsModule`. Best-effort — never breaks a booking.
- **Live board (SSE).** `ContactsService` emits a PII-free **`contact.updated`** ( `{id, pipelineStage}` ) on every mutation; a new `EventsController` handler forwards it. The board (and, in future, the list) refetch live — including when a booking auto-advances a card. The board **ignores the refetch mid-drag** (guarded by a ref) so it never yanks a card from under the pointer.
- New WhatsApp senders and CSV imports enter at **"Nuevo"**.

### Frontend — a dedicated `/pipeline` page with `@dnd-kit`
The board is its **own sidebar section** ("Embudo", available to all operators), not a tab under Contactos (owner's choice). Drag-and-drop uses **`@dnd-kit`** (`core`/`sortable`/`utilities`) — accessible (keyboard sensor) and touch-capable, which native HTML5 DnD is not (the app is responsive, ADR 0021). Moves are **optimistic** (instant local update + `PATCH`), reverting via a refetch on error. Cross-column placement is finalised in `onDragOver`; only pure same-column reorders run `arrayMove` in `onDragEnd` (avoids an off-by-one).

## Alternatives considered
- **Reuse/redefine `status` as the pipeline.** Rejected — it's load-bearing for Informes/filters/badges; a parallel field is cleaner and lower-risk.
- **Configurable stages now.** Deferred — a fixed, well-designed funnel ships value immediately; varchar storage keeps the door open.
- **A move-only endpoint + a `pipeline_order` reindex table.** Over-engineered for a single-business CRM; float midpoints on the existing PATCH are simpler and effectively never collide at this scale.
- **Hand-rolled drag-and-drop (no dep).** Rejected — robust touch/keyboard/auto-scroll DnD is exactly what `@dnd-kit` exists for; three small tree-shakeable packages are justified.

## Consequences
- Owners get a real sales pipeline that reflects and drives the same data as the rest of the app; a booking visibly moves a lead forward with no manual step.
- Zero new infrastructure beyond three frontend packages; one additive migration (validated up/down/backfill on a throwaway DB).
- Pure core (`contacts/pipeline.ts`: stages + `nextStageOnBooking`) is unit-tested; the board endpoint + stage move are e2e-tested.
- **Phase-2 hooks:** per-column pagination for very large stages; owner-configurable stages (varchar already allows it); a funnel/conversion view in Informes; a stage picker on the contact detail page.
