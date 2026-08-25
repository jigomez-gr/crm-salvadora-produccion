# ADR 0014 — Richer contacts & CSV import/export

**Status:** Accepted
**Date:** 2026-07-01
**Relates to:** [ADR 0013](0013-audit-trail.md) (audit — contact actions are recorded), [ADR 0008](0008-production-hardening-migrations-validation-booking-integrity.md) (migrations/validation). Part of the phase-4 "account & data governance" line.

## Context

The CRM stored only name / phone / email / notes per contact. To work as a
template for any vertical and to let an operator move contacts off spreadsheets,
contacts need lifecycle state, labels, provenance, business-specific fields, and
bulk CSV in/out.

## Decision

### Richer contact model

Add to `contacts`: `status` (enum `lead` / `active` / `inactive`, default
`lead`), `tags` (text[]), `source` (where it came from — `whatsapp` for an
auto-created WhatsApp contact, `manual`, `import`, …), and `customFields` (jsonb
key→value, so a business adds its own fields with no schema change). Additive
migration, no backfill (existing contacts become tag-less leads).

### CSV import / export

- **Parsing/serializing is a pure function** (`contacts/csv.ts`,
  `parseCsv`/`toCsv`) — RFC 4180-ish (quoted fields, embedded commas/newlines,
  escaped quotes, CRLF/LF) — exhaustively unit-tested, mirroring the pure-core
  pattern of `reminder-selection.ts` / `inbound-parser.ts`.
- **Export:** `GET /api/contacts/export` returns `text/csv` (attachment).
- **Import:** `POST /api/contacts/import` takes `{csv}` and **upserts by phone**
  (loose E.164). It is **lenient** — an invalid row (no phone, bad email) is
  skipped and reported with its line number, the rest still import — and maps
  **Spanish or English headers** (nombre/name, teléfono/phone, …). It returns
  `{created, updated, skipped, errors}`.
- The frontend reads the file with `FileReader` and posts the text; `main.ts`
  raises the JSON body limit to 6 MB via `useBodyParser` (which **preserves the
  buffered `rawBody`** the YCloud webhook signature needs — re-adding
  `express.json` would not).
- Contact create/update/delete and import emit `AUDIT_EVENT`s (ADR 0013) — but
  WhatsApp auto-create (`upsertByPhone`) does **not**, to avoid flooding the
  trail with system actions.

### Bonus fix — partial updates no longer wipe fields

`ContactsService.update()` now applies **only the fields actually provided**
(skipping `undefined`) instead of `Object.assign(contact, {...dto})`. A
class-transformed DTO carries omitted optional fields as `undefined`
own-properties (ES2022 class fields), so the old spread/assign **silently wiped**
stored values on a partial `PATCH` (e.g. a status-only edit blanked the name).
The new pattern is mandatory for any partial update.

## Alternatives considered

- **A CSV library (csv-parse / papaparse).** Pulls a dependency for a small,
  well-understood format; a ~40-line pure parser is testable and dependency-free
  (the repo favours minimal deps). Rejected.
- **Multipart file upload (multer).** The conventional way to receive a file, but
  it adds a dependency and middleware; posting the text in a JSON field is enough
  for the expected import sizes (a few hundred to a few thousand contacts) and
  keeps the endpoint a plain validated DTO. Rejected for now.
- **Strict import (fail the whole file on any bad row).** Worse for a
  non-technical user with a messy spreadsheet — one typo would block everything.
  Lenient per-row with a report is friendlier.
- **`customFields` as columns / a separate table.** Over-engineered for a
  single-tenant template; jsonb keeps it schema-free and simple. Revisit if
  per-field querying/indexing is ever needed.

## Consequences

- Contacts become a usable light CRM (segment by status/tags, adapt per vertical,
  move data in/out). Migration `Phase4ContactFields` is additive.
- The partial-update fix removes a real latent data-loss bug.
- **Caveat:** import has no dedupe preview / dry-run and no column-mapping UI —
  it trusts the header names. Good enough for the target user; a mapping step is
  future work.
