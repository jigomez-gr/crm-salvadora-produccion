# ADR 0005 — UI-configurable multi-agent + OpenRouter

**Status:** Accepted
**Date:** 2026-06-17
**Supersedes:** parts of [ADR 0004](0004-llm-provider-opencode-go.md) (LLM provider)

## Context

The product must be usable by **non-technical** people who download it, adapt it
with Claude Code, and sell it to a business — all **without touching code or env
vars**. Two things were previously code/env-only and needed to move into the UI:

1. **AI model + key.** ADR 0004 fixed the model and key via `AGENT_MODEL` /
   `OPENCODE_API_KEY` env at process start.
2. **WhatsApp connection.** YCloud key, webhook secret and number were global env
   vars; there was a single hardcoded agent.

The owner also asked to **create multiple agents** from the UI, each with its own
WhatsApp connection and model.

## Decision

### Provider: OpenRouter (replaces OpenCode Go as primary)

- One key gives access to hundreds of models. Listing endpoint
  `GET https://openrouter.ai/api/v1/models` is public (no key) — proxied by the
  backend (`GET /api/agents/models`, cached 1h) to feed a dropdown. The UI shows a
  **curated** shortlist (`RECOMMENDED_MODELS`) with a "see all" toggle.
- The agent's `model` is resolved **per request** via Mastra's dynamic model
  function `model: ({ requestContext }) => ({ providerId: 'openrouter', modelId,
  url: 'https://openrouter.ai/api/v1', apiKey })`. The OpenAI-compatible object
  form (url + apiKey) bypasses gateway resolution and uses the per-agent key.
- Fallbacks: `OPENROUTER_API_KEY` / `AGENT_MODEL` env are used only when the
  agent config leaves them empty.

### Multi-agent: configs as agents + one adaptive Mastra template

- Each "agent" is an **`AgentConfig` row** (CRUD from the UI). New fields:
  `model`, `openrouterApiKey`, `ycloudApiKey`, `ycloudWebhookSecret`, `channel`.
- There is still **one Mastra agent definition** (`TEMPLATE_AGENT_ID`). It adapts
  per request because `instructions`, `model` and the tools all read the active
  `agentConfig` from `requestContext`. We do **not** register N Mastra agents.
- Tools use the installed signature `execute: async (inputData, context)` and read
  config via `context.requestContext.get('agentConfig')` (services/hours/timezone).
- `AgentRunnerService.run({ agentKey, ... })` loads that agent's config, runs the
  template, and is wrapped in try/catch so a missing/invalid key yields a friendly
  message instead of a 500.

### WhatsApp: per-agent webhook URL

- Webhook route is `POST /api/webhooks/ycloud/:agentKey` (the base
  `POST /api/webhooks/ycloud` stays, mapping to the seeded `booking` agent).
- The agent's config screen shows its own webhook URL to paste into YCloud.
- Signature is verified with that agent's `ycloudWebhookSecret` (env fallback);
  replies are sent with that agent's `ycloudApiKey` + `whatsappNumber`.
- Threads are scoped per agent: `${agentKey}:${phone}`.

## Consequences

- A non-technical user can create an agent, paste an OpenRouter key, pick a model,
  paste a YCloud key, copy the webhook URL into YCloud, and be live — no code/env.
- **Shared data:** all agents in one deployment share the same contacts and
  calendar. The product is single-tenant-per-deployment (one business = one
  deploy), so this is intentional; true multi-business isolation is a future step.
- **Credentials in the DB:** API keys/secrets are stored in `agent_configs` and
  returned to the admin UI (shown in password fields). Acceptable for a
  single-tenant, self-hosted, unauthenticated demo; revisit if auth/multi-tenant
  is added.
- Env vars `OPENCODE_API_KEY`/`AGENT_MODEL`/`YCLOUD_*` become optional fallbacks.
