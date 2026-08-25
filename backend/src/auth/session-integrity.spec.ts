import { isSessionStale } from './session-integrity';

describe('isSessionStale', () => {
  // 2026-06-30T12:00:00.800Z — note the sub-second part: it must NOT push the
  // comparison up to the next second (iat is floored, so we floor too).
  const passwordChangedAt = new Date('2026-06-30T12:00:00.800Z');
  const changedAtSec = Math.floor(passwordChangedAt.getTime() / 1000); // 12:00:00

  it('is never stale when the password has never changed (null/undefined)', () => {
    expect(isSessionStale(changedAtSec, null)).toBe(false);
    expect(isSessionStale(changedAtSec, undefined)).toBe(false);
  });

  it('rejects a token issued strictly before the password change', () => {
    expect(isSessionStale(changedAtSec - 1, passwordChangedAt)).toBe(true);
  });

  it('accepts a token re-issued in the SAME second as the change (acting session stays alive)', () => {
    // The change-password endpoint stamps passwordChangedAt and re-signs a token
    // in the same instant; its iat floors to the same second → must stay valid.
    expect(isSessionStale(changedAtSec, passwordChangedAt)).toBe(false);
  });

  it('accepts a token issued after the password change', () => {
    expect(isSessionStale(changedAtSec + 5, passwordChangedAt)).toBe(false);
  });

  it('fails closed when iat is missing or not a finite number', () => {
    expect(isSessionStale(undefined, passwordChangedAt)).toBe(true);
    expect(isSessionStale(Number.NaN, passwordChangedAt)).toBe(true);
  });

  it('a missing iat is still fine when there is no password-change timestamp', () => {
    expect(isSessionStale(undefined, null)).toBe(false);
  });
});
