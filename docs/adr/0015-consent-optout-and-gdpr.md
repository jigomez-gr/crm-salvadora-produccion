# ADR 0015 — Consent / opt-out & GDPR

**Status:** Accepted
**Date:** 2026-07-01
**Relates to:** [ADR 0014](0014-contacts-fields-and-csv.md) (contact model), [ADR 0013](0013-audit-trail.md) (audit), [ADR 0010](0010-appointment-reminders.md) (reminders). Part of the phase-4 "account & data governance" line.

## Context

The app sends proactive WhatsApp reminders and stores customers' personal data.
Two duties follow: honor an **opt-out** (a customer telling us to stop) and
support **GDPR erasure** (a right-to-be-forgotten request). Neither existed.

## Decision

### Consent / opt-out

- Contacts get `optedOut` (+`optedOutAt`). Opt-out **suppresses proactive
  messages** — `RemindersService` skips an opted-out (or anonymized) contact
  **without claiming** the idempotency row, so a later opt-in can still be
  reminded while the appointment is in band.
- **Inbound STOP/BAJA is honored automatically.** A pure, unit-tested
  `consent-keywords.ts` (`detectConsentKeyword`) recognises whole-message
  keywords (STOP/BAJA/CANCELAR/… → opt-out; ALTA/START/… → opt-in) — accent- and
  punctuation-insensitive, and it never matches a keyword embedded in a sentence
  ("stop by at 5" is not an opt-out). `AgentRunnerService.run()` checks it
  **before** the disabled/handoff gates (a STOP must always be obeyed): it sets
  the flag, emits an `AUDIT_EVENT`, sends **one** confirmation, and does **not**
  call the LLM. Operators can also toggle it by hand (`POST …/consent`).

### GDPR erasure — anonymize in place

- `POST /api/contacts/:id/anonymize` scrubs personal data on the row (name,
  phone→a unique `anon:<id>` tombstone, email, notes, tags, customFields), sets
  `anonymizedAt`, and opts the contact out. The **row and its appointments are
  kept** (de-identified), so business/scheduling history survives. Idempotent.
- Hard delete (`DELETE /api/contacts/:id`) still exists and cascades appointments
  (`onDelete: 'CASCADE'`) for a full removal.
- Both, plus opt-out/in, are audited (ADR 0013).

## Alternatives considered

- **Treat opt-out as "stop replying entirely".** Too aggressive — if a customer
  who once said STOP later messages again, they've re-engaged and the agent
  should answer. Opt-out blocks *proactive* messages (reminders); the one
  confirmation is standard and allowed. Inbound conversation still works.
- **Keyword detection with substring/`includes` matching.** Would mis-fire on
  normal sentences ("can you stop the reminders for now?"). Whole-message
  matching is the safe default; a fuzzier intent model is overkill here.
- **Hard-delete for GDPR instead of anonymize.** Deleting loses appointment
  history the business may legitimately need (and orphans message threads keyed
  by phone). In-place anonymize is the standard middle ground — erase identity,
  keep de-identified records. Hard delete remains available when truly required.
- **A full consent ledger (timestamped grants/revokes, channels, purposes).**
  Over-engineered for a single-tenant template; a boolean + timestamp + the audit
  trail is enough. Revisit if a formal consent record is ever required.

## Consequences

- STOP/BAJA is obeyed without operator action; reminders never reach opted-out or
  anonymized contacts; operators have a one-click GDPR anonymize.
- Migration `Phase4ContactConsent` adds `optedOut`/`optedOutAt`/`anonymizedAt`
  (additive, no backfill).
- `AgentRunnerService` now depends on `ContactsService` (AgentsModule imports
  ContactsModule) — no cycle (ContactsModule is a leaf importing only Auth).
- **Caveats:** anonymize scrubs the **contact row** but message/conversation
  history (keyed by the old phone in `threadId`) is retained for the operator —
  use hard delete for full removal. There's no automated retention/expiry policy
  yet (manual action only). Both are reasonable for a single-tenant self-hosted
  deployment; note them for any compliance review.
