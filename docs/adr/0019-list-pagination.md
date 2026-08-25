# ADR 0019 — Server-side pagination for the contacts list

**Status:** Accepted
**Date:** 2026-07-01
**Relates to:** [ADR 0013](0013-audit-trail.md) (the audit list — the reference pagination already shipped), [ADR 0014](0014-contacts-fields-and-csv.md) (contacts). Phase-5 hardening, slice 3.

## Context

Of the list endpoints, only the audit trail was paginated. `GET /api/contacts`
returned an **unbounded array** and the contacts page loaded **every** contact
into the browser and did search + status filtering client-side. That's fine for
the demo's handful of rows, but a real CRM with thousands of contacts would ship
the entire table on every page load and filter it in the browser — slow and
memory-hungry.

## Decision

Mirror the audit pattern (`{ items, total, limit, offset }`) for contacts.

- **`QueryContactsDto`** — `limit` (1–200) / `offset` plus the filters
  `search` and `status`, validated like `QueryAuditDto` (`@Type(() => Number)`,
  `@IsEnum(ContactStatus)`).
- **`ContactsService.list()`** runs a `createQueryBuilder` with `take`/`skip`,
  newest-first, pushing the filters down to SQL so they **compose with paging**:
  a `status` `andWhere` and a case-insensitive `ILIKE` search across
  `name` / `phone` / `email` / `tags` (`array_to_string(c.tags, ',')`), returning
  `getManyAndCount()` as `{ items, total, limit, offset }`.
- **`ContactsController`** clamps the page size (default 50, max 200), like the
  audit controller. `GET /api/contacts/export` and `POST .../import` stay
  **un-paginated** — a CSV export must contain every row.
- **Frontend:** a `ContactPage` envelope type; the contacts page holds
  `offset` + `PAGE_SIZE`, **debounces** the search box (300 ms) and sends
  `search` + `status` as query params, renders one page with the same
  Anterior/Siguiente + "X–Y de N" controls as the audit page, and resets to
  page 1 whenever a filter changes. The client-side `.filter()` is gone.

## Alternatives considered

- **Cursor (keyset) pagination.** More robust for very large, fast-changing
  tables, but heavier to implement and the audit precedent is offset-based.
  Offset is plenty for a single-business CRM; revisit if a list ever gets huge.
- **A shared generic `PaginationQueryDto` / `Page<T>`.** The codebase keeps
  modules decoupled and the audit DTO/envelope are module-local; duplicating the
  small shape per module is consistent and avoids a shared-types coupling.
  Could be extracted later if a third list copies it again.
- **Keep filtering client-side but cap the fetch.** Silently dropping rows past a
  cap would break search. Pushing filters to the server is the correct fix.

## Consequences

- The contacts list scales: one page at a time, filtered in SQL.
- `{ items, total, limit, offset }` is now the house pagination shape (audit +
  contacts + conversations). `GET /api/contacts` changed from `Contact[]` to that
  envelope — the only consumer (the contacts page) and the e2e were updated
  together.
- A backend e2e asserts the envelope shape, `limit`/`offset` paging, and that
  search filters server-side.

### Conversations inbox (same slice's follow-up — done)

The **conversations** inbox (`listThreads`) was the other unbounded list, and it
re-fetched the *whole* thread list on every SSE event. It now uses the same
envelope: `QueryThreadsDto` (limit ≤ 100, default 30) → `getManyAndCount` with
`skip`/`take`, and `GET /api/conversations` returns `{ items, total, limit,
offset }`. The inbox holds `offset`/`PAGE_SIZE`, renders one page with a compact
Anterior/Siguiente pager, and — crucially — its SSE refresh now re-pulls **only
the current page** (the loader closes over `offset`), not every thread. Two
consumers had to move together: the inbox and the dashboard's "recent
conversations" (now `GET /api/conversations?limit=10` reading `.items`). A
backend e2e asserts the envelope + default/clamped `limit`. `GET /api/appointments`
(date-window scoped) and per-thread messages stay naturally bounded.
