# CRM Academy — guide for Claude / AI agents

White-label business CRM with AI agents: an **actionable dashboard** (action
queue + today's agenda + live KPIs, everything deep-linked) and **analytics**
(the LEAD→CITA→CLIENTE funnel, source attribution, no-show/cancellation trends,
estimated revenue — all drillable, ADR 0025), contacts (CRM) with a
**lead pipeline** (Kanban board), calendar, and **multiple AI agents** that book
appointments over **WhatsApp**. Models via
**OpenRouter**, WhatsApp via **YCloud** — both configured per agent **from the UI**
(no code/env). Single-tenant per deployment. Built so a non-technical person can
download, run, adapt (with Claude Code), and deploy it.

## Repo layout

- `backend/` — NestJS + TypeORM + **Mastra** (the AI agent runtime). See `backend/CLAUDE.md`.
- `frontend/` — Next.js (App Router) + Tailwind. See `frontend/CLAUDE.md`.
- `docs/` — `PRD.md` (what it does + scope, current state) and `adr/` (technical decisions). Read these before non-trivial changes.
- `docker-compose.yml` — local dev database only. `docker-compose.prod.yml` — full prod stack for Dokploy.

## Package manager — pnpm ONLY (never npm)

**Always use `pnpm`. Never run `npm` or `npx`** — npm is considered insecure here.
Equivalents: `pnpm install` (not `npm install`), `pnpm <script>` (not `npm run <script>`),
`pnpm exec <bin>` (not `npx <bin>`), `pnpm dlx <pkg>` (one-off, not `npx <pkg>`). This
applies to humans **and** AI agents working in this repo.

## Run locally

- DB: `docker compose up -d` (Postgres on host port **5433**) — or use a cloud/native Postgres.
- Backend: `cd backend && pnpm install && pnpm start:dev` → http://localhost:3001
- Frontend: `cd frontend && pnpm install && pnpm dev` → http://localhost:3000
- Env: `backend/.env` (`DATABASE_URL`, `PORT`); `frontend/.env.local` (`NEXT_PUBLIC_API_URL`). AI/WhatsApp keys are **not** env — configured per agent in the UI.
- **Demo data:** first run against an **empty** DB auto-seeds demo contacts/appointments/conversations (`backend/src/seed`). Idempotent (skips if data exists); set `SEED_DEMO_DATA=false` to disable.
- **Tests:** `cd backend && pnpm test` (unit, no DB) and `pnpm test:e2e` (integration over the security-critical routes — needs the dev DB up; uses a throwaway `crm_e2e_test` database, never your data). See ADR 0017 + `backend/CLAUDE.md` → Testing.

## Architecture (big picture)

- Mastra runs **inside** the NestJS process (no separate agent server).
- Realtime: **SSE** (`GET /api/events`) + native `EventSource` (ADR 0002).
- **Multi-agent:** each agent is an `AgentConfig` row; **one adaptive Mastra template** serves all, resolving the active config per request (ADR 0005).
- **Agent configurability (ADR 0022):** each agent has a free-text **behaviour prompt** (`customInstructions`, layered under the internal guardrails) and a **knowledge base** — upload documents (TXT/MD/CSV/PDF/DOCX/XLSX) it answers from, all from the UI (view/delete included). Retrieval is size-triggered: small bases are injected whole, large ones use **Postgres full-text search** (no vector DB/embeddings — OpenRouter has none; pgvector is a documented phase-2). Lives in the Mastra-free `knowledge/` module.
- Models: **OpenRouter** (per-agent key + model). WhatsApp: **YCloud**, per-agent webhook `POST /api/webhooks/ycloud/:agentKey`.
- **Conversations** are a first-class entity (`conversations`, one row per thread): the inbox shows unread counts + WhatsApp **delivery status** (sent/delivered/read) and supports **human handoff** (pause the agent on a thread and reply by hand). Inbound WhatsApp **media** (images/audio/video/documents) is captured and shown in the inbox, streamed through an **authenticated proxy** so the bytes stay private (operators only) and the YCloud URL never leaves the server (ADR 0011). See `backend/CLAUDE.md` → Conversations & inbox.
- **Appointment reminders** (`@nestjs/schedule` cron): WhatsApp HSM-template reminders 24h/2h before a cita, idempotent (no double-send) and gated per-agent. See `backend/CLAUDE.md` → Appointment reminders.
- Data (contacts/appointments) is **shared** across agents (one business = one deployment).

## White-label & settings

- **App settings** live in a single `AppSettings` row (`settings/`): **white-label branding** (business name, brand colour, logo) plus the onboarding flag. The branding subset is served **publicly** (`GET /api/settings/branding`) so the login screen renders it pre-auth; the frontend `BrandingContext` applies it across the app (sidebar, login, tab title). Editing is admin-only.
- **Business email (SMTP, ADR 0024):** an admin connects a mailbox (Gmail/Outlook/custom domain) from **Ajustes → Correo electrónico** (`nodemailer`, provider presets + a test button); operators then **email a contact from its ficha**, with a per-contact sent history. Config is a dedicated `EmailAccount` (its secret never rides `GET /api/settings`); endpoints under `/api/email/*` (Mastra-free module). Send-only in v1.
- An admin **"Vaciar datos de demostración"** action (`POST /api/settings/clear-demo`) wipes the demo contacts/appointments/conversations so a business can start clean before going live (keeps users/agents/settings). See ADR 0016.
- A first-run **onboarding wizard** (admin-only, shown until `onboardingCompleted`) collects the business name and a **vertical preset** (dental/beauty/barber/fitness/generic) that seeds the default agent's persona, services and hours in one click (`POST /api/settings/onboarding`). Skippable.

## Conventions

- Code, comments, identifiers: **English**. User-facing UI copy and `README.md`/`docs/DEPLOYMENT.md`: **Spanish** (audience is non-technical Spanish speakers). PRD/ADRs: English.
- Domain logic lives in Nest services; Mastra tools are thin wrappers (no business logic in tool definitions).
- Backend on `:3001` (global prefix `/api`), frontend on `:3000`.

## Gotchas

- `AgentsModule` (which imports Mastra) **must be imported LAST** in `backend/src/app.module.ts` — Mastra mounts catch-all routes under `/api` (incl. its own `/api/health`). The app's healthcheck therefore lives at the **root** `/healthz` + `/healthz/ready`, excluded from the global `/api` prefix.
- **Schema is migration-based.** TypeORM `synchronize` is **dev-only** (`NODE_ENV!=='production'`); in production the app runs **migrations on boot** (`migrationsRun`). Evolve the schema with `pnpm migration:generate` (needs the dev DB up), never by editing prod by hand. The initial migration is **idempotent** (safe to baseline an existing synchronized DB). See `backend/CLAUDE.md` → Database & migrations.
- **All request bodies are validated** by a global `ValidationPipe` against DTO **classes** (`*/dto/*.ts`, `class-validator`); errors come back through a global exception filter with a `requestId`. DTOs are classes, not interfaces.
- `NEXT_PUBLIC_API_URL` is baked at **build** time, not runtime (matters for deploys).
- Local DB host port is **5433**; inside the prod compose network it's `db:5432`.

## Security posture (important)

- **Authentication + roles** — the app has a login (JWT in an httpOnly cookie). Two roles: **admin** (full access, incl. user management) and **employee** (everything except `/users`). Every domain controller is guarded (`JwtAuthGuard`); `/users` is admin-only (`RolesGuard` + `@Roles`). Self-registration is disabled — only an admin creates users from the Users screen. An initial admin is bootstrapped on first run (`ADMIN_EMAIL`/`ADMIN_PASSWORD`). `JWT_SECRET` is **required in production** (the API refuses to start without it). The only intentionally-public endpoints are login and the signature-verified WhatsApp webhook. Auth lives in `backend/src/auth` + `backend/src/users`; see `backend/CLAUDE.md` → Security.
- **Account security & session integrity (ADR 0012)** — users **change their own password** (`POST /api/auth/change-password`, which re-issues the cookie). The `JwtAuthGuard` is **stateful**: it re-validates the live user on every request, so a **deactivated/deleted account** and a **password change/reset** invalidate existing sessions immediately (not only at token expiry), and a role change applies at once. A **forced password change** (`mustChangePassword`) is set on an admin reset, on user creation (the admin-typed password is temporary), and on a default-password bootstrap admin — the app shows a mandatory change screen and the API blocks every other route (403 `PASSWORD_CHANGE_REQUIRED`) until it's done.
- **Secrets never leave the server in API responses** — agent configs are sanitized (`sanitizeAgentConfig`) and users never expose `passwordHash` (`UsersService.sanitize`); the UI gets `has*` booleans and sends secrets only to change them. Secret values are stored in the DB (single-tenant) and are not exposed by `GET /api/agents`.
- **Audit trail (ADR 0013)** — governance-relevant actions (login, password change, user + contact create/update/delete, CSV import, opt-out/in, GDPR anonymize) are recorded to an append-only `audit_logs` table and shown on an **admin-only** Auditoría screen (`GET /api/audit`). Writes are decoupled via the event bus (producers don't import the audit module); entries snapshot the actor's email (survives deletion) and stay PII-light (a short summary, never message text).
- **Consent / opt-out & GDPR (ADR 0015)** — a customer who texts **STOP/BAJA** is opted out automatically (one confirmation, no LLM); **ALTA/START** re-opts-in. Opted-out (and anonymized) contacts get **no reminders**. Operators can toggle opt-out and **anonymize** a contact (GDPR erasure: scrub personal data, keep de-identified appointment history) from the contact page. All of it is audited.
- **Webhook is fail-closed** — rejects (401) unless a signing secret is configured.
- **Hardening:** `helmet` security headers, global rate limiting (`@nestjs/throttler`), non-root Docker users, secrets kept out of logs, **`trust proxy`** so per-IP limits work behind Traefik. **Fail-fast env validation** (`backend/src/common/env.ts`): in production the API refuses to start if `JWT_SECRET`/`CORS_ORIGIN`/`DATABASE_URL` are missing or if `ADMIN_PASSWORD` is left at the public default. See `backend/CLAUDE.md` → Security.
- **Observability (ADR 0018):** logs are **structured JSON** in production (parseable by a log viewer) / pretty in dev, tunable via `LOG_LEVEL`/`LOG_FORMAT`, every line tagged with a **per-request correlation id** (`X-Request-Id`) the error response also carries. Zero-config, PII-free. Sentry is intentionally not bundled (the error filter is a documented hook).
- If keys were ever reachable publicly (e.g. via a tunnel before hardening), **rotate them**.

## Deeper guidance

- Authoritative agent/stack rules: the **`crm-academy-stack`** skill — read it for any backend/agent work.
- Deployment (Dokploy, for non-technical users): `docs/DEPLOYMENT.md`.

> `CLAUDE.md` and `AGENTS.md` are kept identical automatically (a hook mirrors
> `CLAUDE.md` → `AGENTS.md` on save). **Edit `CLAUDE.md`** — it is the source of
> truth. Scoped guides live in `backend/` and `frontend/`.
