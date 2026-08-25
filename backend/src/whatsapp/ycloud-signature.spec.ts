import * as crypto from 'crypto';
import { verifyYCloudSignature } from './ycloud-signature';

describe('verifyYCloudSignature', () => {
  const secret = 'whsec_test_secret';
  const t = 1_700_000_000; // fixed "now" in seconds
  const body = Buffer.from(JSON.stringify({ type: 'whatsapp.inbound_message.received' }));

  const sign = (ts: number, b: Buffer, key: string): string => {
    const hmac = crypto.createHmac('sha256', key).update(`${ts}.${b.toString()}`).digest('hex');
    return `t=${ts},s=${hmac}`;
  };

  const validHeader = sign(t, body, secret);

  it('accepts a correctly-signed request within the replay window', () => {
    expect(verifyYCloudSignature(body, validHeader, secret, t)).toBe(true);
    // ±5 min boundary is fine.
    expect(verifyYCloudSignature(body, validHeader, secret, t + 299)).toBe(true);
    expect(verifyYCloudSignature(body, validHeader, secret, t - 299)).toBe(true);
  });

  it('fails CLOSED when no secret is configured (the core security property)', () => {
    expect(verifyYCloudSignature(body, validHeader, undefined, t)).toBe(false);
    expect(verifyYCloudSignature(body, validHeader, '', t)).toBe(false);
  });

  it('rejects a missing signature or body', () => {
    expect(verifyYCloudSignature(body, undefined, secret, t)).toBe(false);
    expect(verifyYCloudSignature(undefined, validHeader, secret, t)).toBe(false);
  });

  it('rejects a stale/future timestamp (replay protection)', () => {
    expect(verifyYCloudSignature(body, validHeader, secret, t + 301)).toBe(false);
    expect(verifyYCloudSignature(body, validHeader, secret, t - 301)).toBe(false);
  });

  it('rejects a tampered body', () => {
    const tampered = Buffer.from(JSON.stringify({ type: 'evil' }));
    expect(verifyYCloudSignature(tampered, validHeader, secret, t)).toBe(false);
  });

  it('rejects a signature made with the wrong secret', () => {
    const forged = sign(t, body, 'wrong_secret');
    expect(verifyYCloudSignature(body, forged, secret, t)).toBe(false);
  });

  it('rejects malformed signature headers', () => {
    expect(verifyYCloudSignature(body, `s=${'a'.repeat(64)}`, secret, t)).toBe(false); // no t
    expect(verifyYCloudSignature(body, `t=${t}`, secret, t)).toBe(false); // no s
    expect(verifyYCloudSignature(body, `t=notanumber,s=abcd`, secret, t)).toBe(false);
    expect(verifyYCloudSignature(body, `t=${t},s=deadbeef`, secret, t)).toBe(false); // wrong length/value
    expect(verifyYCloudSignature(body, 'garbage', secret, t)).toBe(false);
  });
});
