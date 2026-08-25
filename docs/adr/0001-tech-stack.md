# ADR 0001 — Tech Stack: NestJS + Next.js + TypeORM + Postgres + Mastra

**Status:** Accepted (stack still current)
**Date:** 2026-06-10

> **Update 2026-06-17:** the stack below is unchanged, but two things evolved —
> see [ADR 0005](0005-ui-multi-agent-openrouter.md): (1) the app is now
> **multi-agent**, implemented as one adaptive Mastra agent template driven by
> per-request config (the `instructions`/`model`/`tools`-as-functions design
> below is exactly what makes this possible); (2) the model provider is
> **OpenRouter**, selected per agent from the UI.

## Context

The project (see `docs/PRD.md`) needs a backend with a CRM CRUD, appointments/calendar, and a customizable booking agent connected to WhatsApp, plus a frontend with dashboard, calendar (month/week), and an agent playground. It must be buildable incrementally during academy live sessions, so the stack should be the one the team already masters.

Options considered for the agent layer:

1. **Raw Claude API calls from NestJS** — full control, but we hand-roll tool loops, memory, and conversation threading.
2. **Claude Agent SDK** — strong agent runtime, but oriented to Claude Code-style autonomous agents; heavier than needed for a scoped booking agent.
3. **Mastra** — TypeScript-native agent framework with first-class tools, per-thread memory, Postgres storage, and an official NestJS adapter.

## Decision

- **Backend:** NestJS (TypeScript), TypeORM, PostgreSQL.
- **Frontend:** Next.js (TypeScript).
- **Agents:** Mastra, embedded in the NestJS app via the official `@mastra/nestjs` adapter.

Integration details verified against current Mastra docs (2026-06-10):

- **Embedding:** `MastraModule.register({ mastra })` in `AppModule`; agents are called from Nest services via `MastraService.getAgent(id)` or the `MASTRA` injection token. No separate agent server process.
- **Storage:** `@mastra/pg` (`PostgresStore`) pointed at the **same Postgres instance** as TypeORM. Mastra manages its own tables (`mastra_threads`, `mastra_messages`, etc.) — kept out of TypeORM migrations.
- **Agent customization:** Mastra agents accept `instructions`/`model`/`tools` as functions receiving `requestContext`. The booking agent loads business config (name, services, hours, tone) from our DB and injects it via `requestContext` on each call — customization from the UI without redeploys.
- **Conversation threading:** Mastra Memory threads keyed per contact (e.g., WhatsApp phone number) give per-contact conversation history for both the WhatsApp channel and the playground.

## Consequences

**Gains**

- One backend process and one database — minimal ops for the live demo.
- Agent tools call Nest services directly (availability, booking, contacts) — no HTTP hop between agent and business logic.
- Memory, threading, and tool-loop handling come from Mastra instead of hand-rolled code.
- Playground and WhatsApp channel share the same agent code path, differing only in entry point and thread ID.

**Costs / risks**

- Mastra requires ES2022 modules and Node.js >= 22.13; NestJS defaults to CommonJS. The `@mastra/nestjs` adapter is built for this, but the TS/module config must be validated at project setup before anything else.
- `MastraModule` mounts routes under `/api` and can intercept unrelated routes if imported before app modules — import it last (documented gotcha).
- Two ORMs touch the same DB (TypeORM for domain, Mastra storage for agent state). Mitigated by separate tables and never cross-querying Mastra tables from TypeORM.
- Mastra evolves fast; APIs must be checked against embedded docs (`node_modules/@mastra/*/dist/docs/`) at implementation time, not from memory.
