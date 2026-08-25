# PRD — White-label Business CRM with AI Agents

**Status:** v4 — reflects the **implemented state** (this document is a spec you
could rebuild the current app from). v4 adds the authentication + roles layer.
**Date:** 2026-06-24
**Requested by:** Josema (community / academy)
**Owner:** Fran

> Earlier drafts (v1/v2) scoped a single booking agent for a live session. This
> version documents what the app actually does now: a multi-agent, UI-configurable
> CRM that a non-technical person can download, run, adapt, and deploy.

## 1. Context

A **white-label business application** that any business can adopt: a CRM with a
dashboard, a contacts/leads section, a calendar, and **AI agents connected to
WhatsApp**. The dental clinic is just the example seed data — nothing is
hardcoded to a vertical.

The product is built so that a **non-technical person** can:

1. **Download** the repo and **run it locally** (Node + a Postgres database).
2. **Adapt it** to their business with Claude Code and from the app's own UI.
3. **Deploy it to their own VPS** with Dokploy, with **push-to-deploy** from GitHub.

It is **single-tenant per deployment**: one deployment serves one business (which
may run several agents). Selling to multiple businesses = one deployment each.

## 2. Goals

- A polished, generic business UI that works as a template for any vertical.
- **Multiple AI agents**, created and configured entirely from the UI (no code,
  no env files): business persona, AI model, and WhatsApp connection.
- Agents connected to **WhatsApp** that book appointments for many contacts, with
  conversations visible live in the app.
- A clean path from "downloaded" → "running locally" → "live on a VPS".

## 3. Non-Goals (explicitly out of scope)

- **Multi-tenant data isolation.** All agents in one deployment **share** the same
  contacts and calendar (one business = one deployment). True per-business data
  separation within a single deployment is future work.
- **Channels other than WhatsApp.** The Agents section is built to grow (the data
  model has a `channel` field), but only WhatsApp ships today.
- **Granular permissions, SSO, self-service signup.** The app **does** have login
  with two roles — admin and employee (see §4.8) — but finer-grained permissions,
  SSO, email-based password reset and open self-registration are out of scope:
  only an admin creates users. Data is still **single-tenant** (shared across all
  users). (See Security note in §7.)
- **Advanced scheduling:** multiple staff/resources, buffers, recurring
  appointments. Single bookable resource per business. (Automated **reminders**
  *do* ship — see §4.9.)

## 4. Functional Requirements (current behaviour)

### 4.1 Dashboard (Inicio) — an action panel (ADR 0025)
- Not a passive scoreboard: quick actions (nuevo contacto / nueva cita / ir al
  inbox), a **"Necesita tu atención"** queue (unread, handoff, citas de hoy,
  leads sin contactar, agentes desactivados), **clickable KPI tiles** (citas hoy,
  sin leer, en modo manual, contactos), **today's agenda**, clickable recent
  conversations (open the thread), and a pipeline **mini-funnel**. Every element
  deep-links into the right screen; all of it updates live via SSE.

### 4.2 Navigation
- Left sidebar: **Dashboard, Contactos, Embudo, Calendario, Conversaciones, Agentes**.

### 4.3 CRM — Contacts
- CRUD: list (with search), create, edit, delete.
- Fields: name, phone (WhatsApp), email, notes, **status** (lead / customer /
  inactive), **tags**, **source**, and **custom fields** (per-business key/value
  pairs, so the CRM adapts to any vertical without code changes).
- List shows a status badge + tags and can be **filtered by status**; search also
  matches tags.
- **CSV import/export:** export all contacts to CSV; import a CSV to bulk
  create/update (merged by phone). Import is lenient — invalid rows are skipped
  and reported, the rest still import — and accepts Spanish or English headers.
- Contact detail shows that contact's appointments (upcoming and past).
- Inbound WhatsApp messages auto-create a contact by phone number (source =
  "whatsapp").
- **Consent / opt-out:** a customer who replies **STOP / BAJA** on WhatsApp is
  marked opted-out automatically (gets one confirmation, no agent reply) and
  stops receiving reminders; **ALTA / START** re-subscribes. An operator can also
  toggle opt-out by hand.
- **GDPR:** a contact can be **anonymized** (personal data scrubbed, de-identified
  appointment history kept) or deleted. All consent/GDPR actions are audited.
- **Lead pipeline (Kanban):** a dedicated **Embudo** board (ADR 0023) with six
  funnel stages — **Nuevo · Contactado · Cualificado · Cita agendada · Cliente ·
  Perdido** — where operators **drag contacts between columns**. Each card shows
  the contact's tags, lifecycle status and **next appointment**. Booking an
  appointment (manually or by the agent) **auto-advances** a lead to "Cita
  agendada"; new leads enter at "Nuevo". The board updates **live** (SSE) and is a
  separate funnel dimension from the lifecycle `status` (they coexist).
- **Enviar correo:** from a contact's ficha an operator can **send an email**
  (compose subject + body), provided the business email account is configured
  (§4.10) and the contact has an address. Each send is recorded in a per-contact
  **"Correos enviados"** history (sent/failed). See ADR 0024.

### 4.4 Calendar
- Full calendar with **month and week** views (Google-Calendar style).
- Appointments always belong to a contact; created/edited manually or by an agent.
- Live refresh when an agent books (SSE `appointment.created`).
- **Booking integrity:** no double-booking (overlap is rejected, serialised with a
  DB advisory lock so concurrent bookings are safe); coherent window
  (`end > start`, no past) enforced; cancellation is **logical** (status +
  audit fields, history preserved), not a hard delete. Single bookable resource.

### 4.5 Agents (multi-agent)
- **List** all agents; **create** a new agent ("Nuevo agente": business name +
  description); **open** an agent to configure it; **delete** an agent.
- Per-agent **Configuración** tab, all editable from the UI:
  - **Business persona:** name, **description** (*what the business is*), tone, timezone, enabled on/off.
  - **Agent behaviour** (`customInstructions`): a free-text prompt for *how* the agent should act (tone, what to offer/avoid, policies), layered on top of the internal guardrails — which always take precedence (ADR 0022).
  - **Knowledge base** (ADR 0022): upload documents (TXT/MD/CSV/PDF/DOCX/XLSX, ≤ 4 MB) the agent answers from; the screen lists them (name/size/date) and lets the owner **delete** them, with an indicator of how much is used and the mode. Small bases are given to the agent whole; large ones are searched per message (Postgres full-text search — no external vector DB).
  - **AI model (OpenRouter):** paste an OpenRouter API key + pick a model from a
    dropdown (curated shortlist + "see all" over OpenRouter's live catalogue).
  - **WhatsApp connection (YCloud):** paste a YCloud API key + WhatsApp number;
    the screen shows that agent's **own webhook URL** (with a Copy button) to paste
    into YCloud, plus a field for the YCloud **webhook secret**.
  - **Services** (name + duration) and **working hours** (per weekday).
- Per-agent **Playground** tab: chat with the agent from inside the app (no
  WhatsApp needed) — used to validate config before connecting WhatsApp.
- What an agent does: manages appointments conversationally (checks availability,
  books, lists, cancels), using tools against the app's own contacts/calendar, and
  answers business questions from its **knowledge base** (following its behaviour
  instructions), while staying within the internal guardrails.

### 4.6 Conversations
- Inbox-style view: thread list + message pane, live via SSE. Shows both WhatsApp
  and Playground conversations. Threads are scoped per agent (`agentKey:phone`).
- **Unread badges:** each thread shows how many inbound messages the operator
  hasn't opened yet; opening a thread clears it.
- **Delivery status:** outbound WhatsApp messages show their state (enviando →
  enviado → entregado → leído, or *no entregado*), updated live from YCloud
  status webhooks.
- **Human handoff:** the operator can take over a WhatsApp thread — the agent
  stops auto-replying there — and **reply by hand** from the inbox (free-text is
  only delivered inside WhatsApp's 24h window). Re-activating the agent hands the
  thread back. Conversations are a first-class entity (`conversations`), which
  also makes the inbox a single query rather than an N+1 over messages.
- **Inbound media:** photos, voice notes, videos and documents a customer sends
  over WhatsApp are captured and shown in the inbox (image/audio/video inline, a
  document as a download). Nothing is silently dropped. The media is **private** —
  streamed through an authenticated endpoint (operators only), never a public URL.

### 4.7 Realtime
- Single SSE endpoint (`GET /api/events`); events `message.received`,
  `message.sent`, `message.status` (delivery/read change), `conversation.updated`
  (unread/handoff change), `appointment.created`. Frontend uses native
  `EventSource`.

### 4.8 Authentication & users
- **Login** with email + password; the session is a JWT in an **httpOnly cookie**.
  Every screen is behind auth; the only public endpoints are login and the signed
  WhatsApp webhook.
- **Two roles:** **admin** (everything, including user management) and **employee**
  (everything except the Users screen).
- **Users screen (admin only):** full CRUD of system users. **No open
  registration** — only an admin creates accounts. Passwords are hashed (bcrypt)
  and must meet a strength policy; anti-lockout guards prevent deleting your own
  account or removing the last active admin. An initial admin is bootstrapped on
  first run from `ADMIN_EMAIL`/`ADMIN_PASSWORD`.
- **Change your own password:** every user can change their password from the app
  (verifying the current one); the session stays active afterwards.
- **Forced password change:** when an admin **creates** a user or **resets**
  someone's password (a temporary one), or when the initial admin is left on the
  **default** password, the user must choose a new password before they can use
  the app — a mandatory screen blocks everything else until they do.
- **Session integrity:** changing or resetting a password **logs out that user's
  other sessions**, and **deactivating** an account ends its session immediately
  (it doesn't linger until the token would have expired).
- **Audit trail (admin only):** an **Auditoría** screen lists security and
  user-management actions (who logged in, who changed/reset a password, who
  created/edited/deleted a user) with timestamp, actor and originating IP —
  paginated and filterable by action. It's append-only and PII-light.

### 4.9 Appointment reminders
- The app automatically sends a **WhatsApp reminder 24 h and 2 h before** each
  scheduled appointment, so customers don't forget (fewer no-shows).
- **Opt-in per agent** (it's off by default): the operator enables reminders and
  enters the name of an **approved WhatsApp template (HSM)** — required to message
  outside the 24h window — from the agent's config screen. The template takes the
  customer name, the service, and the date/time.
- Reminders are **idempotent**: each one is sent at most once (safe across cron
  ticks and multiple app instances). A same-day booking is never sent a "24h
  before" reminder. Delivery is recorded; a misconfigured template fails loudly
  in the logs rather than silently.

### 4.10 Settings, white-label & onboarding
- **Ajustes screen (admin only):** set the **business name**, **brand colour**
  and **logo**. The branding shows across the app — sidebar, login screen and the
  browser tab — so a business makes the CRM its own without touching code. The
  login screen reads the branding from a public endpoint so it's branded before
  sign-in.
- **Onboarding wizard:** on first run an admin is guided through a one-step setup —
  business name + a **vertical preset** (clínica dental, peluquería, barbería,
  gimnasio, genérico) — which seeds the default agent's persona, services and
  working hours. It can be skipped and fine-tuned later from the Agents screen.
- **Correo electrónico (SMTP):** an admin connects a sending mailbox — **Gmail,
  Outlook or a custom domain** — via SMTP, with provider presets that auto-fill
  the server settings, guided help (e.g. Gmail app passwords) and a **test-email**
  button. Operators then email contacts from their ficha (§4.3). The SMTP password
  is stored write-only (never returned). See ADR 0024.
- **Start clean:** an admin can **wipe the demo data** (contacts, appointments and
  conversations) to begin from zero before going live; users, agents and settings
  are kept. (Audited.)

## 5. How the agents work (architecture)

- **Agents are configurations** (`agent_configs` rows), not separate runtimes.
- **One adaptive Mastra agent template** serves all of them: its `instructions`,
  `model`, and tools resolve the active agent's config from `requestContext` on
  each request. No N agents are registered.
- **Model = OpenRouter**, resolved per request from the agent's stored key + model
  (env vars are optional fallbacks only).
- **WhatsApp = YCloud**, per-agent webhook `POST /api/webhooks/ycloud/:agentKey`,
  signature verified with the agent's stored secret, replies sent with its stored
  key + number.
- See `docs/adr/0005-ui-multi-agent-openrouter.md` for the full decision record.

## 6. Deployment & running

- **Local:** Node 22.13+, **pnpm** (not npm), a Postgres database (Docker, or
  Neon/Supabase cloud, or native), `pnpm start:dev` (backend) + `pnpm dev`
  (frontend). See `README.md`.
- **Tests:** `pnpm test` (unit, no DB) and `pnpm test:e2e` (integration; needs
  the dev Postgres up — it uses a throwaway `crm_e2e_test` database). See ADR 0017.
- **Production:** a single `docker-compose.prod.yml` (db + api + web) deployed on
  **Dokploy** as a Docker Compose project, GitHub-connected with **auto-deploy**.
  Domains/HTTPS are env-driven (Traefik). Keys/models are configured in the UI, not
  in env. See `docs/DEPLOYMENT.md`.

## 7. Notes & decisions

- **AI provider:** OpenRouter (ADR 0005), superseding OpenCode Go (ADR 0004).
- **Credentials:** API keys/secrets are stored in the DB (`agent_configs`). They
  are **write-only over the API** — config responses are sanitized (the UI gets
  `has*` booleans, never the values) and updates ignore empty secret fields so a
  round-trip never wipes them. Acceptable for a single-tenant, self-hosted
  deployment; revisit if auth/multi-tenant is added.
- **Security hardening (ADR 0006):** webhook fails closed (401) without a signing
  secret; `helmet` security headers; global rate limiting (`@nestjs/throttler`);
  non-root Docker users; no PII/secrets in logs.
- **Authentication (login + roles):** JWT in an httpOnly cookie; two roles
  (admin/employee); every domain endpoint is guarded and `/users` is admin-only;
  passwords hashed with bcrypt; `JWT_SECRET` is **required in production**. Data is
  still single-tenant (all users share the same contacts/calendar/agents). The
  signed WhatsApp webhook remains the only intentionally-public endpoint; keep the
  app behind HTTPS in production (`COOKIE_SECURE=true`).
- **Demo data seed (ADR 0006):** on first run against an empty DB, `backend/src/seed`
  loads sample contacts/appointments/conversations (idempotent; `SEED_DEMO_DATA=false`
  to disable). Complements the always-seeded default `booking` agent config.
- **Schema & migrations (ADR 0008):** dev derives the schema from the entities
  (`synchronize`), but **production runs TypeORM migrations on boot**
  (`synchronize: false`), so evolving the model can no longer drop data. The
  initial migration is idempotent (baselines an existing DB). Evolve with
  `pnpm migration:generate`.
- **Input validation & errors (ADR 0008):** every request body is validated by a
  global `ValidationPipe` against DTO classes; a global filter returns uniform
  error JSON with a `requestId`. Fail-fast env validation aborts a misconfigured
  production boot. CI (lint + build + test) guards every change.
- **WhatsApp messaging reliability:** the YCloud client sends with a timeout +
  retry/backoff and a typed result (delivery failures are logged, not swallowed),
  and supports approved **template (HSM)** messages for sending outside the 24h
  window. Inbound webhooks are **atomically idempotent** (a duplicate delivery
  never runs the agent twice), and the agent loop is **cost-bounded** per message.
- **Conversations, delivery status & handoff (ADR 0009):** conversations are a
  first-class entity, so the inbox is a single query (no N+1) and has a home for
  per-thread state. Outbound WhatsApp messages carry a **delivery status**
  (sent/delivered/read/failed), reconciled from YCloud status webhooks; the inbox
  shows **unread counts** and lets an operator take over a thread (**human
  handoff**, pausing the agent) and **reply manually**.
- **Appointment reminders (ADR 0010):** a `@nestjs/schedule` cron sends WhatsApp
  HSM-template reminders 24h/2h before each appointment. The "which are due"
  decision is a pure, unit-tested function; sends are idempotent (a unique
  claim row prevents double-sends across ticks/instances) and gated per agent.
- **Inbound media capture (ADR 0011):** inbound WhatsApp media is parsed by a
  pure, unit-tested function and stored as a **reference** on the message (never
  the bytes). The inbox streams it through an **authenticated proxy**, so customer
  photos/voice/documents stay private (operators only) and the YCloud URL never
  leaves the server. The agent is told media arrived (it can't see the file).
- **Account security & session integrity (ADR 0012):** users change their own
  password (`POST /api/auth/change-password`, which re-issues the cookie). The
  auth guard is **stateful** — it re-validates the live user on every request, so
  a deactivation/deletion and a password change/reset invalidate sessions at once
  (the stale-token rule is a pure, unit-tested function comparing the token's
  `iat` to the user's `passwordChangedAt`). A `mustChangePassword` flag (admin
  reset, user creation, default-password bootstrap) forces a change before any
  other use, enforced server-side (403 `PASSWORD_CHANGE_REQUIRED`), not just in
  the UI.
- **Audit trail (ADR 0013):** governance-relevant actions (login, password
  change, user create/update/delete, contact create/update/delete/import) are
  recorded to an append-only `audit_logs` table and read back on an admin-only
  screen. Writes are decoupled via the in-process event bus (producers don't
  depend on the audit module), best-effort (never block the action), and the
  actor email is snapshotted so an entry survives the user's deletion.
- **Richer contacts & CSV (ADR 0014):** contacts gain `status`/`tags`/`source`/
  `customFields`; CSV import/export upserts by phone with lenient per-row error
  reporting. CSV parse/serialize is a pure, unit-tested module. A partial `PATCH`
  applies only the fields sent (it never wipes omitted ones).
- **Consent / opt-out & GDPR (ADR 0015):** contacts carry `optedOut` +
  `anonymizedAt`. An inbound WhatsApp STOP/BAJA opts out automatically (one
  confirmation, no LLM; keyword detection is a pure, unit-tested function);
  ALTA/START re-opts-in. Reminders skip opted-out/anonymized contacts. A GDPR
  **anonymize** action scrubs personal data in place but keeps the de-identified
  appointment history. All of it is audited.
- **Settings & white-label (ADR 0016):** a single `AppSettings` row holds the
  business name / brand colour / logo; the branding subset is served publicly so
  the login screen is branded pre-auth. An admin-only "clear demo data" action
  wipes contacts/appointments/conversations (FK-safe, in one transaction) to start
  clean before going live.
- **Automated testing (ADR 0017):** two tiers. `pnpm test` runs **pure-core unit
  tests** (no DB) over the risky logic (reminders, CSV, consent keywords, session
  staleness, inbound media parsing, the YCloud signature check). `pnpm test:e2e`
  runs **integration tests** (`supertest`) that boot the app against a throwaway
  `crm_e2e_test` Postgres DB and lock in the security-critical request paths —
  login + httpOnly cookie, the stateful guard (a password reset kills live
  sessions), role enforcement, the forced-password-change gate, validation, and
  the contacts partial-update that must not wipe fields. Because `@mastra/*`
  can't load under Jest, the e2e boots a Mastra-free `TestAppModule`; the
  webhook's fail-closed property is covered by the pure signature unit test.
- **Observability (ADR 0018):** logs are **structured JSON** in production (one
  line per entry with level/context/requestId, parseable by a log viewer) and
  human-readable in dev — zero-config, tunable via `LOG_LEVEL`/`LOG_FORMAT`. A
  middleware attaches a **per-request correlation id** (`X-Request-Id`, honoured
  from the proxy or minted) propagated via `AsyncLocalStorage`, so a request's
  every log line and its error response share one id. Logs stay PII-free. Sentry
  is intentionally not bundled (heavy footprint, rarely configured by the target
  user); the error filter is the documented one-file hook to add it later.
- **List pagination (ADR 0019):** the high-volume lists are **server-side
  paginated** (`{items,total,limit,offset}`). `GET /api/contacts` (max 200/page)
  pushes the search + status filters down to SQL (case-insensitive across
  name/phone/email/tags), so the contacts page fetches one page at a time instead
  of every row (export/import stay full). `GET /api/conversations` (max 100, default
  30) is paginated too — the inbox renders one page and its SSE refresh re-pulls
  only the current page instead of the whole thread list. Both mirror the audit
  list.
- **Reports / analytics (ADR 0020, extended ADR 0025):** the **Informes** section
  (visible to any operator) — `GET /api/reports/summary?from&to` aggregates the
  **existing** appointment/contact/message/pipeline/source rows (no new tables)
  into: KPIs **with a trend vs the previous period** (completion & cancellation
  rates — a drop in cancellations reads as *good*/green — and new contacts), the
  **LEAD→CITA→CLIENTE conversion funnel**, appointments & messages per day, busiest
  hours, **top services**, **capture-source attribution** (which channel produced
  contacts *and* bookings), a contact-status **donut**, and **estimated revenue**
  (from an optional per-appointment price; auto-hides when unset). The range is a
  7/30/90 preset **or a custom range** (remembered), every chart/KPI **drills
  through** to the matching filtered screen, and the daily series **exports to
  CSV**. All bucketing is in the business timezone; the aggregation is a pure,
  unit-tested function; the charts are hand-rolled accessible SVG (no chart lib).
- **Responsive & accessibility (ADR 0021):** the app works on a phone — the
  sidebar collapses to an **off-canvas drawer** (hamburger top bar; static column
  from `md` up), and the shared `Modal` is a proper accessible dialog (`role`/
  `aria-modal`/`aria-labelledby`, focus trap + restore, labelled close). The
  admin-chosen brand colour gets a **contrast-safe** logo mark (WCAG-luminance
  foreground). The data-dense pages adapt too: the inbox switches to a mobile
  list/detail view, tables scroll horizontally, the calendar toolbar wraps, and
  page padding softens on small screens.

## 8. Tech stack (see ADRs)

| Layer | Choice | ADR |
| --- | --- | --- |
| Backend | NestJS + TypeScript | 0001 |
| ORM / DB | TypeORM + PostgreSQL | 0001 |
| Frontend | Next.js + TypeScript + Tailwind | 0001 |
| Agents | Mastra (embedded in NestJS) | 0001, 0005 |
| Realtime | SSE (`@Sse()` + `EventSource`) | 0002 |
| WhatsApp | YCloud REST v2 + signed webhooks (per agent) | 0003, 0005 |
| AI models | OpenRouter (per-agent key + model) | 0005 |
| Auth | JWT (httpOnly cookie) + roles (admin/employee), bcrypt | — |

## 9. Future iterations (parking lot)

- Per-business data isolation (true multi-tenant).
- Additional channels (email, Instagram, web chat…).
- Auth extras: granular/per-section permissions, SSO, email-based password reset
  (login + admin/employee roles already ship — see §4.8).
- Advanced scheduling: multiple staff/resources, buffers, recurring appointments.
  (Reminders already ship — see §4.9.)
- Lead pipeline extras: owner-configurable stages, a funnel/conversion view in
  Informes, per-column pagination for very large stages (the Kanban board itself
  already ships — see §4.3).
- DB migrations instead of `synchronize`.
