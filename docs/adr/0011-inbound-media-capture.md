# ADR 0011 — Inbound WhatsApp media capture

**Status:** Accepted
**Date:** 2026-06-30
**Relates to:** [ADR 0009](0009-conversations-delivery-status-and-handoff.md) (conversations / inbox), [ADR 0003](0003-whatsapp-ycloud.md) (YCloud), [ADR 0008](0008-production-hardening-migrations-validation-booking-integrity.md) (migrations). Closes the phase-3 "reliable messaging" line.

## Context

Customers send photos, voice notes, and documents over WhatsApp ("here's my
X-ray", "this is the form you asked for"). Before this change the webhook only
read `text.body` and **silently dropped** everything else — the operator never
saw the message, and the agent ran on an empty turn. Capturing inbound media
has three traps: (1) the YCloud payload shape varies per media type and we can't
exercise it with real media in CI; (2) the media bytes are **customer PII** —
photos/voice/documents must not become a public URL; (3) the agent's LLM can't
see the media, so a naive pass-through produces nonsense replies.

## Decision

### Parsing is a pure function

- `whatsapp/inbound-parser.ts` `parseInboundMessage(inboundMsg)` turns a YCloud
  `whatsappInboundMessage` into `{ externalId, from, body, agentPrompt, media }`,
  with **no NestJS/DB/I-O** — so the per-type shape (the riskiest part) is
  **exhaustively unit-tested**. Mirrors `reminders/reminder-selection.ts`.
- It separates two texts: **`body`** is stored + shown in the inbox + used as the
  last-message preview (the caption, or a localized placeholder so a bare photo
  reads as "📷 Imagen", never blank); **`agentPrompt`** is what the LLM reads (a
  plain-Spanish note like *"[El cliente ha enviado una imagen (no puedes verlo)…]"*
  so replies stay sane). `AgentRunnerService.run()` feeds `agentPrompt` to the
  model but persists `body`.
- Types handled: image / audio / voice (→ audio) / video / document / sticker as
  media; location and any other type (contacts/interactive/reaction/unknown) are
  recorded with a generic note — **never silently dropped**.

### Media is private — streamed through an authenticated proxy

- We store only a **reference** on the message (`mediaType`, `mediaUrl`,
  `mediaId`, `mediaMimeType`, `mediaFilename`) — **never the bytes**. `mediaUrl`
  (YCloud's link) is **server-side only**: the message API runs every row through
  `toMessageView`, which omits `mediaUrl`/`mediaId` (and the internal
  `externalId`/`providerMessageId`). The same view sanitizes the SSE payloads, so
  a media URL never leaves the server.
- `GET /api/conversations/media/:messageId` (behind `JwtAuthGuard`) streams the
  bytes: only authenticated operators can view a customer's media. It fetches the
  stored `mediaUrl` server-side (attaching the agent's YCloud key on `https`
  links in case the endpoint requires it), with a 20 s timeout, and returns the
  bytes with the stored mime type and `Cache-Control: private`. Scheme is
  restricted to `https:` (YCloud) or `data:` (the demo seed) — a defensive SSRF
  guard even though `mediaUrl` only ever comes from a signature-verified webhook
  or the seed.
- The **frontend fetches that endpoint with `credentials: 'include'`** and renders
  the result via a blob object-URL (`<img>`/`<audio>`/`<video>`/download link).
  This authenticates cross-origin where a bare `<img src>` couldn't send the
  cookie, and keeps the bytes access-controlled.

### Demo seed

- The seed adds one inbound image whose `mediaUrl` is a **self-contained `data:`
  SVG** (no network), so the media inbox is visible out of the box and the proxy
  path is exercised end-to-end with zero external dependencies.

## Alternatives considered

- **Render YCloud's media URL directly in the browser.** Simplest, but leaks
  customer PII to anyone with the URL and breaks if the link needs the API key or
  if the cross-site cookie isn't sent. Rejected — privacy + auth.
- **Download and store the bytes (DB bytea / disk) on receipt.** Robust against
  YCloud link expiry, but heavy storage for a single-tenant self-hosted template.
  Deferred; the proxy fetches on demand instead.
- **Send the media to a vision model.** Out of scope (cost, per-agent model
  choice); the agent is told media arrived and asks the customer to describe it.

## Consequences

- Customers' photos/voice/documents now appear in the inbox, access-controlled to
  logged-in operators; nothing is silently dropped.
- New nullable columns on `messages` (migration `Phase3InboundMedia`, additive, no
  backfill — existing rows are text with `mediaType = NULL`).
- **Caveat:** YCloud retains inbound media for a limited window, so very old
  media may 404 from the proxy (logged as a `502`/`404`, never a crash). Real
  media also depends on YCloud actually including a media `link`; if only an id is
  present the proxy can't stream it yet (a documented forward-compat gap —
  `mediaId` is stored for a future Media-API fallback).
