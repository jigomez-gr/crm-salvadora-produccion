import * as crypto from 'crypto';

// Reject signatures whose timestamp is more than this many seconds away from now
// (in either direction) — replay-attack protection.
const REPLAY_WINDOW_SECONDS = 300;

/**
 * Verify a YCloud webhook HMAC signature. **Pure and unit-tested** (no Nest, no
 * IO) so the security-critical rules can be exercised exhaustively.
 *
 * Header format: `t=<unix-seconds>,s=<hex-hmac>`, where the HMAC is
 * `HMAC-SHA256(secret, "<t>.<rawBody>")`.
 *
 * Fails **CLOSED**: with no configured `secret` it returns `false`. A public
 * webhook with no signing secret would otherwise accept forged requests from
 * anyone, so the endpoint must reject until a secret is set (the agent's
 * `ycloudWebhookSecret` or the `YCLOUD_WEBHOOK_SECRET` env).
 *
 * @param nowSeconds current unix time in seconds — injectable so the replay
 *   window is deterministically testable; defaults to the real clock.
 */
export function verifyYCloudSignature(
  rawBody: Buffer | undefined,
  signature: string | undefined,
  secret: string | undefined,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): boolean {
  if (!secret) return false; // fail closed — no secret configured
  if (!signature || !rawBody) return false;

  try {
    const parts: Record<string, string> = {};
    for (const part of signature.split(',')) {
      const [key, value] = part.split('=');
      parts[key] = value;
    }

    const timestamp = parts['t'];
    const sig = parts['s'];
    if (!timestamp || !sig) return false;

    const timestampNum = parseInt(timestamp, 10);
    if (Number.isNaN(timestampNum)) return false;
    if (Math.abs(nowSeconds - timestampNum) > REPLAY_WINDOW_SECONDS) return false;

    const payload = `${timestamp}.${rawBody.toString()}`;
    const expected = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');

    const sigBuf = Buffer.from(sig, 'hex');
    const expectedBuf = Buffer.from(expected, 'hex');
    // timingSafeEqual throws on a length mismatch — guard so a wrong-length `s`
    // is a clean `false`, not an exception.
    if (sigBuf.length !== expectedBuf.length) return false;
    return crypto.timingSafeEqual(sigBuf, expectedBuf);
  } catch {
    return false;
  }
}
