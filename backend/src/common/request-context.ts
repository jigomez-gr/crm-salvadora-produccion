import { AsyncLocalStorage } from 'async_hooks';

/**
 * Per-request context propagated implicitly (no need to thread it through every
 * function signature). Today it carries just a correlation id so every log line
 * emitted while handling a request can be tied together, and the error filter
 * reuses the same id it already returns to the client.
 */
export interface RequestStore {
  requestId: string;
}

const storage = new AsyncLocalStorage<RequestStore>();

/** Run `fn` (and everything it awaits) within a request scope. */
export function runWithRequestContext<T>(store: RequestStore, fn: () => T): T {
  return storage.run(store, fn);
}

/** The current request's correlation id, or undefined outside a request. */
export function getRequestId(): string | undefined {
  return storage.getStore()?.requestId;
}

/**
 * Pick the correlation id for a request: honour a well-formed inbound
 * `X-Request-Id` (so a value set by the proxy / a calling service is preserved
 * end-to-end), otherwise mint a fresh one. **Pure** — the fallback is injected
 * so it's deterministically testable.
 */
export function pickRequestId(
  incoming: string | string[] | undefined,
  fallback: string,
): string {
  const value = Array.isArray(incoming) ? incoming[0] : incoming;
  const trimmed = (value || '').trim();
  // Bound the length so a hostile header can't bloat every log line / response.
  if (trimmed && trimmed.length <= 200) return trimmed;
  return fallback;
}
