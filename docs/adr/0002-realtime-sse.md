# ADR 0002 — UI Realtime Updates via Server-Sent Events (SSE)

**Status:** Accepted
**Date:** 2026-06-10

## Context

The PRD requires that WhatsApp conversations handled by the agent appear live in the app UI during the demo (inbox view, playground, and ideally calendar updates when the agent books an appointment). The constraint set for this decision: **the simplest approach possible**.

Options:

1. **Polling** — `setInterval` + REST. Trivial, but messages appear with visible delay and it wastes requests; weak demo effect.
2. **WebSockets (socket.io)** — full duplex, but adds a dependency, a gateway, client connection management, and reconnection handling. Duplex is unnecessary: the client never pushes through the socket (sending happens via normal REST/agent calls).
3. **Server-Sent Events (SSE)** — one-directional server→client stream over plain HTTP. NestJS supports it natively with the `@Sse()` decorator (returns an RxJS `Observable`), and the browser consumes it with the native `EventSource` API. Zero extra dependencies on either side, automatic reconnection built into `EventSource`.

## Decision

Use **SSE** with NestJS's built-in `@Sse()` decorator.

- A single events endpoint (e.g., `GET /api/events`) streams domain events to the frontend.
- Internally, NestJS's event emitter (`@nestjs/event-emitter`) bridges producers to the SSE stream: the WhatsApp webhook handler and the agent tools emit events (`message.received`, `message.sent`, `appointment.created`), and the SSE controller forwards them.
- The frontend subscribes with native `EventSource` and updates the inbox/calendar views.

## Consequences

**Gains**

- Live updates with zero new dependencies: `@Sse()` is core NestJS, `EventSource` is native browser API.
- Automatic client reconnection for free.
- One-directional fits the actual data flow — all client→server actions are normal HTTP calls.

**Costs / risks**

- SSE streams don't survive serverless platforms well — fine for the demo (single long-running Nest process), revisit if deployment target changes.
- In-memory event bus means events are lost on restart and won't fan out across multiple instances. Acceptable for v1 single-instance; the UI re-fetches state on load anyway.
- If we ever need client→server push over the same channel (e.g., typing indicators), this becomes a WebSockets migration — out of scope now.
