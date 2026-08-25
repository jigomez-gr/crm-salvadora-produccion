# ADR 0003 — WhatsApp Channel via YCloud

**Status:** Accepted (updated for multi-agent)
**Date:** 2026-06-10

> **Update 2026-06-17 (see [ADR 0005](0005-ui-multi-agent-openrouter.md)):** the
> YCloud integration below is unchanged, but the **configuration moved from env
> vars to per-agent config in the DB, edited from the UI**:
> - Each agent has its own `ycloudApiKey`, `ycloudWebhookSecret` and
>   `whatsappNumber` (env `YCLOUD_*` remain optional fallbacks).
> - The webhook is **per agent**: `POST /api/webhooks/ycloud/:agentKey` (the base
>   `POST /api/webhooks/ycloud` still maps to the seeded `booking` agent). Each
>   agent's config screen shows its own webhook URL to paste into YCloud.
> - Signature is verified with that agent's secret; replies are sent with that
>   agent's key + number. Threads are scoped per agent (`agentKey:phone`).

## Context

The booking agent must send and receive WhatsApp messages. Josema provides a YCloud account (WhatsApp Cloud API with coexistence mode) with test phone numbers, so the provider is given — this ADR records how we integrate it.

## Decision

Integrate WhatsApp through the **YCloud REST API v2** (verified against docs.ycloud.com, 2026-06-10):

- **Auth:** `X-API-Key` header on every request.
- **Send:** `POST https://api.ycloud.com/v2/whatsapp/messages` with `{ from, to, type: "text", text: { body } }` (enqueued send; a `send-directly` variant exists if needed).
- **Receive:** webhook endpoint in NestJS subscribed to `whatsapp.inbound_message.received`. Payload carries `whatsappInboundMessage.from` (customer phone) and `whatsappInboundMessage.text.body`.
- **Webhook verification:** validate the `YCloud-Signature` header (`t=timestamp,s=signature`): HMAC-SHA256 of `timestamp.jsonBody` with the endpoint secret, plus timestamp tolerance check. Mandatory — the endpoint is public.
- **Webhook handling:** return `200` immediately and process asynchronously (YCloud retries up to 7 times on non-2xx — slow agent responses inside the handler would cause duplicate processing). Inbound flow: webhook → persist message → run booking agent (thread = sender phone) → send reply via YCloud → emit SSE events.

Isolate everything YCloud-specific in a single Nest module (`WhatsappModule` with a `YCloudClient` service) so future channels (email, other providers) plug in beside it.

## Consequences

**Gains**

- Coexistence mode: Josema's number keeps working in the WhatsApp app while connected to the API.
- Plain REST + webhook — no SDK dependency needed; the client is a thin `fetch` wrapper.
- Retry semantics are well-defined (10s, 30s, 5m, 30m, 1h, 2h, 2h).

**Costs / risks**

- **24-hour window:** free-form text replies are only allowed within 24h of the customer's last message. The agent always replies to an inbound message, so v1 stays inside the window by design; business-initiated messages would need approved templates (out of scope).
- **Local dev needs a public URL** for webhooks — use a tunnel (cloudflared/ngrok) during development and the live session; the tunnel URL must be configured in the YCloud dashboard (Developers → Webhooks).
- Webhook retries + async processing require **idempotency**: dedupe by inbound message `id` before processing.
