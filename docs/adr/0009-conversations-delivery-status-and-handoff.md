# ADR 0009 — Conversations entity: inbox state, delivery status & human handoff

**Status:** Accepted
**Date:** 2026-06-30
**Relates to:** [ADR 0002](0002-realtime-sse.md) (SSE), [ADR 0005](0005-ui-multi-agent-openrouter.md) (multi-agent/YCloud), [ADR 0008](0008-production-hardening-migrations-validation-booking-integrity.md) (migrations/validation). First slice of "reliable, observable messaging" continued from ADR 0008.

## Context

Threads in the inbox were **derived on the fly** by grouping `messages` by
`threadId`. That had two problems for a real business:

1. **No home for per-thread state.** A real operator needs to know which threads
   are unread, whether a WhatsApp reply was actually *delivered/read*, and to be
   able to **take over** a conversation from the bot and answer by hand. None of
   that fits in a `messages` row.
2. **N+1 on the inbox.** `listThreads()` ran one query for the distinct threads,
   then *two more per thread* (last message + count). Fine for a demo, wrong for
   a busy inbox.

WhatsApp also gives delivery/read receipts (via YCloud `whatsapp.message.updated`
webhooks) that we were dropping on the floor — the operator had no way to tell a
sent reply from a delivered one from a failed one.

## Decision

### Conversations are a first-class entity

- New `conversations` table, **one row per `threadId`** (PK is the natural key,
  not a generated id). It holds: `handoff`, `unreadCount`, `lastInboundAt` (the
  WhatsApp 24h window), a denormalised `lastMessage*` preview, `messageCount`,
  `agentKey`, `contactId`, `channel`.
- `MessagesService` owns **both** `Message` and `Conversation`. Every saved
  message calls `touchConversation()` — an atomic `INSERT … ON CONFLICT DO UPDATE`
  that bumps `unreadCount` on inbound, refreshes the preview and tracks
  `lastInboundAt`. The inbox is now **one joined query** (`listThreads`), no N+1.
- Existing deployments are **backfilled**: the Phase 3 migration derives
  `conversations` from `messages` in SQL (and `rebuildAllConversations()` does the
  same for the demo seed, which inserts messages directly), so prior threads show
  up immediately.

### Outbound messages carry a delivery status

- `Message` gains `status` (`received` | `queued` | `sent` | `delivered` |
  `read` | `failed`) and `providerMessageId`.
- An agent/manual WhatsApp reply is saved `queued`; after the send it's `sent`
  (+ `providerMessageId`) or `failed`. YCloud `whatsapp.message.updated` webhooks
  (same endpoint) then advance it to `delivered`/`read`, correlated by
  `providerMessageId`. Status **never downgrades** (out-of-order webhooks can't
  turn a `read` back into `delivered`). Playground replies are `sent` immediately
  (no provider).
- `AgentRunnerService.run()` now returns `{ reply, outbound }` so the webhook can
  reconcile the status of exactly the message it sent.

### Human handoff + manual reply

- `PATCH /api/conversations/:threadId/handoff` toggles `handoff`. While on,
  `AgentRunnerService` still records the inbound (so it appears in the inbox and
  bumps unread) but **does not auto-reply** — same shape as the agent's global
  `enabled` switch, but per-thread. The playground is never handed off.
- `POST /api/conversations/:threadId/messages` (WhatsApp only) sends a manual
  operator reply (persist `queued` → send → reconcile). `POST …/read` clears the
  unread badge.

### Module structure

- `YCloudClient` was extracted into a dependency-free `YCloudModule`. The webhook
  (in `WhatsappModule`, which imports `ConversationsModule`) and the inbox
  manual-send (in `ConversationsModule`) both need to *send*; a shared leaf module
  lets `ConversationsModule` import it **without** an import cycle.

## Alternatives considered

- **Keep deriving threads from messages, add columns to messages.** Per-thread
  state (handoff/unread) has no natural message row to live on, and the N+1 would
  remain. Rejected.
- **A separate `ConversationsService`.** More DI wiring for no gain — the webhook
  and runner already inject `MessagesService`; it owns both repos instead.
- **Track unread per message (a `readAt`).** The UI only needs a per-thread
  count/badge; a single `unreadCount` is simpler and is what the inbox renders.

## Consequences

- The inbox is observable (delivery/read) and operable (handoff + manual reply) —
  closer to a real WhatsApp business inbox.
- Realtime adds two SSE events: `message.status` and `conversation.updated`
  (registered in `events.controller.ts` **and** `frontend/src/hooks/useEvents.ts`).
- The YCloud status-webhook contract (`whatsapp.message.updated` →
  `whatsappMessage.{id,status}`) is assumed per YCloud's docs; the mapping is
  centralised (`YCLOUD_STATUS_MAP`) and easy to adjust if a deployment sees a
  different shape.
- **Still upcoming** (rest of "reliable messaging"): scheduled reminders
  (`@nestjs/schedule`, needs HSM), inbound media capture.
