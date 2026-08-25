# ADR 0018 — Observability: structured logging + request correlation

**Status:** Accepted
**Date:** 2026-07-01
**Relates to:** [ADR 0008](0008-production-hardening-migrations-validation-booking-integrity.md) (the `AllExceptionsFilter` + `requestId` this builds on), [ADR 0006](0006-security-hardening-and-demo-seed.md) (no PII/secrets in logs). Phase-5 hardening, slice 2.

## Context

Logging was the Nest default: colourised **plain text**, no structure, no
request-wide correlation id, and a hard-coded verbosity. For a self-hosted
deployment that reads logs through a viewer (Dokploy/Loki/CloudWatch) this means:
fields (level, context, requestId) can't be parsed; a **successful** request's
log lines can't be tied together (the `requestId` only existed once an error was
thrown, minted inside the filter); and verbosity can't be tuned per environment.
There was also no error tracker.

## Decision

### A structured app logger (`StructuredLogger`)

Installed via `NestFactory.create(AppModule, { bufferLogs: true })` +
`app.useLogger(new StructuredLogger())`, so it drives **every existing
`new Logger(Ctx.name)` call site** unchanged. Output is:

- **production:** one **JSON** line per entry (`timestamp`, `level`, `context`,
  `message`, `requestId`, `stack?`) — parseable by a log aggregator, and
- **development:** the familiar coloured human-readable Nest format.

`LOG_LEVEL` (`error|warn|log|debug|verbose`, `info` aliases `log`) sets the
verbosity floor — default `log` in prod, `debug` in dev. `LOG_FORMAT`
(`json|pretty`) forces the format. The decision logic (level threshold, format
resolution, JSON serialization) lives in the **pure, unit-tested**
`common/log-format.ts`.

### Per-request correlation id (AsyncLocalStorage)

A middleware in `configureApp` runs **first**: it honours an inbound
`X-Request-Id` (so a value from the proxy / a calling service is preserved
end-to-end) or mints one (`pickRequestId`, pure + tested), echoes it on the
response, and runs the rest of the request inside an `AsyncLocalStorage` scope
(`common/request-context.ts`). The logger reads the id from that scope, and the
`AllExceptionsFilter` reuses the **same** id it already returns to the client —
so a request's every log line and its error response now share one id, with no
change to any function signature.

### PII-safe by construction

The logger only **structures** existing messages; the codebase already logs
PII-free (tool *names* and token *counts*, never args/results/message text — see
`agent-runner.service.ts`). No request bodies, args, or secrets are added.

### No `@sentry/node` dependency (a deliberate non-inclusion)

Error tracking is intentionally **not** wired with `@sentry/node`: its current
versions pull a heavy OpenTelemetry auto-instrumentation footprint that cuts
against this project's minimal-deps, zero-config, non-technical-self-host ethos,
and most such deployments won't have a Sentry DSN. The structured JSON logs
already enable aggregator-based alerting on 5xx. The `AllExceptionsFilter` is the
single error chokepoint and is documented as the **one-file hook** to add Sentry
later (gated on a `SENTRY_DSN`), should a deployment want it.

## Alternatives considered

- **`nestjs-pino`.** Adds `pino` + `pino-http` + transport deps and a different
  logging model. The custom logger keeps **zero new dependencies** and reuses
  Nest's dev formatting. Rejected.
- **A request-scoped DI provider for the id.** Request-scoped providers are
  "viral" (everything that injects them becomes request-scoped) and carry a perf
  cost. `AsyncLocalStorage` propagates implicitly with none of that. Chosen.
- **Add `@sentry/node` now (env-gated).** Heavy OTel footprint, rarely
  configured by the target user. Deferred to a documented hook (above).

## Consequences

- **Zero-config:** dev logs look the same; production automatically emits JSON.
  Operators tune with `LOG_LEVEL` / `LOG_FORMAT` (documented in `.env.example`).
- One correlation id ties a request's logs to its error response, honoured
  end-to-end from the proxy. The e2e asserts the `X-Request-Id` header.
- `configureApp` owns the middleware, so tests boot with it too. `configure-app`
  remains the single source of bootstrap truth (ADR 0017).
- Adding Sentry later is a localized change in `AllExceptionsFilter` + `main.ts`.
