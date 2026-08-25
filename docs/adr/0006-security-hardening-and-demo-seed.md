# ADR 0006 — Security hardening, agent guardrails & demo data seed

**Status:** Accepted — the *"still unauthenticated"* consequence is now superseded by [ADR 0007](0007-authentication-and-roles.md) (login + roles).
**Date:** 2026-06-17
**Relates to:** [ADR 0003](0003-whatsapp-ycloud.md) (webhook), [ADR 0005](0005-ui-multi-agent-openrouter.md) (per-agent credentials)

## Context

A security audit of the running app (which had been temporarily exposed to the
public internet via a Tailscale Funnel tunnel) surfaced several real issues, and
the agent was producing low-quality output that leaked internal mechanics. The
app is a single-tenant, **unauthenticated** admin tool (ADR 0005, PRD §3), so any
endpoint reachable on the network is effectively public. Separately, a fresh
install was an empty shell, which is a poor first-run experience for the
non-technical audience.

Problems addressed:

1. `GET /api/agents` / `…/config` returned the per-agent secrets
   (`openrouterApiKey`, `ycloudApiKey`, `ycloudWebhookSecret`) in plaintext.
2. The YCloud webhook **accepted unsigned requests** when no signing secret was
   configured (it returned `true` from signature verification).
3. No rate limiting, no security headers, containers ran as root, and tool
   call/result payloads (customer PII) were written to logs.
4. The agent leaked tool names, contact ids and "creating contact" internals to
   the end user, asked for the phone number it already knew, and invented data.
5. Empty database on first run.

## Decision

### Secrets are write-only over the API

- `sanitizeAgentConfig()` (`agents-config.service.ts`) strips the three secret
  fields from every config response and adds `hasOpenrouterApiKey` /
  `hasYcloudApiKey` / `hasYcloudWebhookSecret` booleans. Applied in
  `agents.controller` for `findAll`, `getConfig`, `create`, `update`.
- `AgentsConfigService.update()` ignores empty/undefined secret fields, so the
  sanitized round-trip (UI sends blank for untouched secrets) never wipes a
  stored value. To change a secret, send a new non-empty value.
- Internal callers (agent runner, webhook handler) still read the full entity via
  `findByKeyOrNull` — sanitization is presentation-layer only.

### Webhook fails closed

- `YCloudWebhookController.verifySignature()` now **rejects (401)** when no secret
  is configured on the agent or `YCLOUD_WEBHOOK_SECRET` env, instead of accepting
  the request. The signed-request path (HMAC-SHA256 of `timestamp.rawBody`, 5-min
  tolerance) is unchanged.

### Transport & process hardening

- `helmet()` in `main.ts` (HSTS, `X-Content-Type-Options`, `X-Frame-Options`,
  etc.; CSP disabled — this is a JSON API, not HTML).
- Global rate limit via `ThrottlerModule` + `ThrottlerGuard` (120 req/min/IP) to
  blunt brute-force and abuse of the public webhook / LLM playground.
- Dockerfiles drop to the non-root `node` user in the runtime stage.
- Logs never include tool args/results (PII): the runner logs tool *names* only,
  and the `traced()` wrapper no longer logs args.
- `.gitignore` widened to `.env*` (keeping `*.example`) so no env file is ever
  committed.

### Agent guardrails + customer context

- `AgentRunnerService` sets `requestContext('customer')` =
  `{ contactId, phone, name, nameKnown }`. The booking/list/update tools read
  `contactId` from there, so the model never handles a contact UUID. The
  instructions render a "Cliente actual" block and forbid revealing tools/ids,
  inventing data, or asking for a known phone.
- New `updateContactDetails` tool lets the agent save a new customer's real name.

### Demo data seed

- `backend/src/seed` (`SeedModule` / `SeedService`) seeds demo contacts,
  appointments and conversations **only when the contacts table is empty** on
  startup. Dates are computed relative to "now" (today/this week/past) so the demo
  always looks current. Disable with `SEED_DEMO_DATA=false`.

## Consequences

- The admin API no longer leaks secrets, and the webhook is safe to expose even
  before auth exists. **Authentication is still out of scope (PRD §3) and remains
  the top prerequisite before any real public deployment** — the non-webhook
  endpoints (contacts, conversations, agents) are still unauthenticated.
- Setting the webhook secret is now **required** for the webhook to work (it
  returns 401 until then). This is intentional.
- Keys exposed before this change should be rotated.
- The `multer` (DoS) advisory from `@nestjs/platform-express` is left as-is: the
  app has no file-upload routes, and forcing multer 2.x would break NestJS 10.
  Revisit on a NestJS major upgrade.
- Demo seed is convenient for first-run but should be disabled in production.
