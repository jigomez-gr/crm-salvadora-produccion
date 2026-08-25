/**
 * Pure session-integrity rules — no NestJS, no DB, no I/O — so the security
 * logic that decides "is this token still valid?" is unit-testable in isolation
 * (mirrors the pure-core pattern used by reminder-selection.ts / inbound-parser.ts).
 *
 * A JWT stays cryptographically valid until it expires, but we want a password
 * change (or admin reset) to immediately invalidate every OTHER session. We do
 * that by stamping `passwordChangedAt` on the user and rejecting any token whose
 * issued-at (`iat`) predates it.
 */

/**
 * True when a token issued at `tokenIatSeconds` (the JWT `iat`, in WHOLE seconds)
 * predates the user's last password change and must therefore be rejected.
 *
 * Comparison is at one-second granularity because `iat` is floored to the second
 * by the JWT spec: a token re-issued in the same second as the password change
 * (as the change-password endpoint does, to keep the acting session alive) has
 * `iat === floor(passwordChangedAt)` and is intentionally treated as FRESH.
 *
 * - No `passwordChangedAt` (never changed) → never stale.
 * - Missing `iat` → can't prove freshness → treat as stale (fail closed).
 */
export function isSessionStale(
  tokenIatSeconds: number | undefined,
  passwordChangedAt: Date | null | undefined,
): boolean {
  if (!passwordChangedAt) return false;
  if (typeof tokenIatSeconds !== 'number' || !Number.isFinite(tokenIatSeconds)) {
    return true;
  }
  const passwordChangedAtSeconds = Math.floor(passwordChangedAt.getTime() / 1000);
  return tokenIatSeconds < passwordChangedAtSeconds;
}
