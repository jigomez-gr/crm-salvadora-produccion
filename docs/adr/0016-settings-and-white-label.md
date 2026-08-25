# ADR 0016 — App settings & white-label branding

**Status:** Accepted
**Date:** 2026-07-01
**Relates to:** [ADR 0013](0013-audit-trail.md) (audit), [ADR 0005](0005-ui-multi-agent-openrouter.md) (UI-configured product). Part of the phase-4 "account & data governance" line; the onboarding wizard (a later slice) builds on the `onboardingCompleted` flag added here.

## Context

The product is a **white-label template**: any business should be able to make it
its own (name, logo, colour) without touching code, and start from a clean slate
before going live. Neither existed — "CRM Academy" was hardcoded and the demo
seed could only be removed by hand in the DB.

## Decision

### A single `AppSettings` row

A one-row table (the service **get-or-creates** it on first access — no seed):
`businessName`, `brandColor`, `logoUrl` (a data: URL or external URL),
`onboardingCompleted`. Nothing here is secret.

### Public branding, admin-only editing

- `GET /api/settings/branding` is **public** (no auth) and returns only the
  non-sensitive branding subset, so the **login screen** can render the brand
  *before* the user signs in. The frontend `BrandingContext` fetches it once and
  applies it across the app (sidebar, login, tab title).
- `GET /api/settings` (authed) returns the full row; `PUT /api/settings` and
  `POST /api/settings/clear-demo` are **admin-only**. Updates are audited.
- The logo is stored inline (a data: URL); `main.ts` already raised the JSON body
  limit (ADR 0014), so an uploaded image fits.

### "Clear demo data"

`POST /api/settings/clear-demo` wipes all CRM data — contacts, appointments,
conversations, messages, reminders — in **one transaction, FK-safe order**,
keeping users, agent configs, settings and the audit trail. It's meant to be run
**before** entering real data (turn the seeded demo into a blank slate). Audited.

## Alternatives considered

- **Per-deployment branding via env vars / a config file.** Would force a
  non-technical user to edit files and redeploy; the whole point is UI
  configuration (consistent with ADR 0005's agent config). Rejected.
- **Full theme engine (override the whole palette).** The accent colour is applied
  to the logo mark (sidebar + login) — a meaningful white-label touch — without
  the cost/risk of re-theming every component. A deeper theme can come later.
- **Store the logo as a file/object.** A data: URL keeps a single-tenant
  self-hosted deploy dependency-free (no object store, no static-file serving).
  Revisit if logos get large or a CDN is wanted.
- **A per-row `isDemo` flag to delete only seeded rows.** Cleaner in theory, but
  the action is intended for *before* real data exists, so "wipe all CRM data" is
  simpler and unambiguous. Documented clearly in the UI ("start clean before
  going live").

### Onboarding wizard (follow-up, same `onboardingCompleted` flag)

A first-run, admin-only wizard collects the business name and a **vertical
preset** and seeds the default `booking` agent in one click:

- Presets (`settings/presets.ts`, **pure data**): dental / beauty / barber /
  fitness / generic — each a persona (`tone`, `businessDescription`), a service
  list and working hours. `GET /api/settings/presets` lists them.
- `POST /api/settings/onboarding {businessName, preset}` (admin) updates the
  default agent's persona/services/hours via `AgentsConfigService` (only the
  non-secret fields — keys/numbers are untouched), sets the business name (shared
  with branding) and flips `onboardingCompleted`. Audited (`onboarding.complete`).
- The frontend `OnboardingWizard` overlay (rendered by `AuthGate` for admins)
  shows only while `onboardingCompleted` is false; "Omitir" just sets the flag.
  `SettingsModule` imports `AgentsConfigModule` for this (no cycle — it's a leaf).

## Consequences

- A business brands the app, runs a one-step setup, and starts clean entirely
  from the UI.
- New `app_settings` table (migration `Phase4AppSettings`); the onboarding wizard
  reuses its `onboardingCompleted` flag (no extra migration).
- **Caveats:** "clear demo data" deletes **all** CRM data (not just seeded rows) —
  it's a pre-go-live reset, labelled as such. Branding's brand colour styles the
  logo mark, not the entire UI theme (yet).
