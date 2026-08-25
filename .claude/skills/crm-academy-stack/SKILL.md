---
name: crm-academy-stack
description: CRM-academy stack conventions and Mastra-NestJS integration rules. Trigger - writing or reviewing any backend (NestJS, TypeORM, Postgres), frontend (Next.js), or agent (Mastra) code in this project.
---

# CRM-academy Stack Conventions

Authoritative stack and integration rules for this project. Read `docs/PRD.md` for scope and `docs/adr/0001-tech-stack.md` for the full decision record before implementing.

## Stack

| Layer    | Choice                              |
| -------- | ----------------------------------- |
| Backend  | NestJS + TypeScript                 |
| ORM      | TypeORM                             |
| Database | PostgreSQL (single instance)        |
| Frontend | Next.js + TypeScript                |
| Agents   | Mastra via `@mastra/nestjs` adapter |
| Realtime | SSE — NestJS `@Sse()` + native `EventSource` (ADR 0002) |
| WhatsApp | YCloud REST API v2 + signed webhooks (ADR 0003) |

## Mastra integration rules (verified 2026-06-10 — re-verify against embedded docs)

1. **Never trust memorized Mastra APIs.** Before writing Mastra code, check embedded docs: `grep -r "<Symbol>" node_modules/@mastra/core/dist/docs/references`. If packages are missing, fetch `https://mastra.ai/llms.txt`. The full Mastra skill lives at `/home/franblakia/hagalink/.claude/skills/mastra/SKILL.md` — read it for any non-trivial agent work.
2. **Embedding:** Mastra runs inside the NestJS process. `MastraModule.register({ mastra })` in `AppModule`, **imported LAST** — imported earlier it intercepts unrelated routes under `/api` and returns 404s.
3. **Calling agents:** from Nest services via `MastraService.getAgent(id)` or `@Inject(MASTRA)`. Do not spawn a separate Mastra server.
4. **Storage:** `@mastra/pg` `PostgresStore` on the same Postgres as TypeORM. Mastra owns its tables (`mastra_threads`, `mastra_messages`, ...). NEVER reference Mastra tables from TypeORM entities or migrations; never query them with TypeORM.
5. **Customization & multi-agent (ADR 0005):** there is ONE adaptive Mastra agent template (`TEMPLATE_AGENT_ID = 'assistant'` in `booking-agent.ts`); each "agent" is an `AgentConfig` row (CRUD from the UI). The agent's `instructions`, `model` AND tools all resolve the active config from `requestContext` per call (set by `AgentRunnerService` from `agentKey`). No hardcoded business prompts, no N registered agents.
6. **Threads:** scoped per agent — key `${agentKey}:${phone}` for WhatsApp, `${agentKey}:playground-…` for the playground. Same template agent, different thread/resource IDs.
7. **Modules/Node:** Mastra requires ES2022 modules and Node >= 22.13. Validate `tsconfig` (`module: ES2022`, `moduleResolution: bundler`) before adding Mastra code; NestJS CommonJS defaults will fail.
8. **Models (ADR 0005, supersedes 0004):** provider is **OpenRouter**, configured **per agent from the UI** (`model` + `openrouterApiKey` on `AgentConfig`), NOT env. Resolved per request via the dynamic `model: ({ requestContext }) => ({ providerId: 'openrouter', modelId, url: 'https://openrouter.ai/api/v1', apiKey })` in `booking-agent.ts` (object form bypasses gateway resolution and uses the per-agent key). `OPENROUTER_API_KEY`/`AGENT_MODEL` env are optional fallbacks only. Catalogue: backend proxies `GET https://openrouter.ai/api/v1/models` at `/api/agents/models` (curated `RECOMMENDED_MODELS` + full list).
9. **createTool signature (installed version):** `execute: async (inputData, context) => ...` — `inputData` IS the validated input; read per-request values with `context?.requestContext?.get('agentConfig')` (this is how tools get the active agent's services/hours/timezone). The old v0.x `async ({ context })` signature fails silently (Mastra feeds the TypeError back to the model as a tool error; nothing reaches the logs).
10. **Reasoning models & errors:** some models emit inline `<think>` blocks; `stripReasoning()` in AgentRunnerService removes them. Tool errors are invisible by default — `traced()` wrapper in mastra.module.ts logs dep failures, and AgentRunnerService logs toolCalls/toolResults at debug level. AgentRunnerService also wraps `generate()` in try/catch → returns a friendly Spanish message (not a 500) when the model/key is misconfigured.

## Realtime rules (ADR 0002)

- Single SSE endpoint (`GET /api/events`) using NestJS core `@Sse()` returning an RxJS Observable. No socket.io.
- Producers (webhook handler, agent tools) emit via `@nestjs/event-emitter`; the SSE controller forwards. Event names: `message.received`, `message.sent`, `appointment.created`.
- Frontend uses native `EventSource`. UI re-fetches full state on load; SSE is only for live deltas.

## WhatsApp / YCloud rules (ADR 0003 — verified 2026-06-10)

- Auth header `X-API-Key`. Send: `POST https://api.ycloud.com/v2/whatsapp/messages` with `{ from, to, type: "text", text: { body } }`.
- Inbound: webhook event `whatsapp.inbound_message.received`; payload at `whatsappInboundMessage.{from,to,type,text.body,id}`.
- ALWAYS verify `YCloud-Signature` header (`t=timestamp,s=signature`, HMAC-SHA256 of `timestamp.jsonBody` with endpoint secret + timestamp tolerance).
- Webhook handler returns 200 immediately, processes async (YCloud retries 7x on non-2xx). Dedupe by inbound message `id` (idempotency).
- All YCloud specifics live in `WhatsappModule` / `YCloudClient` — no YCloud types leak into domain code.
- Free-form replies only within the 24h customer-service window; v1 only ever replies to inbound messages, so no templates needed.
- Local dev: webhooks need a public tunnel (cloudflared/ngrok) configured in YCloud dashboard → Developers → Webhooks.

## Project conventions

- All code, comments, identifiers, and UI copy in **English**.
- Domain rules live in Nest services; Mastra tools are thin wrappers that call those services (no business logic inside tool definitions).
- Appointments always belong to a contact (FK required). Single bookable resource in v1 — no multi-staff logic.
- Docs live in `docs/` (PRD) and `docs/adr/` (decisions, correlative numbering).
