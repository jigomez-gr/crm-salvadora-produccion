import { Logger } from '@nestjs/common';
import type { CookieOptions } from 'express';

const logger = new Logger('Auth');

// Name of the httpOnly cookie that carries the JWT.
export const ACCESS_TOKEN_COOKIE = 'access_token';

// How long a session lasts, in seconds. The JWT expiry and the cookie maxAge
// are both derived from this single value so they never drift apart.
export const TOKEN_TTL_SECONDS =
  Number(process.env.JWT_EXPIRES_IN_SECONDS) || 24 * 60 * 60; // default 1 day
export const COOKIE_MAX_AGE_MS = TOKEN_TTL_SECONDS * 1000;

/**
 * JWT signing secret. MUST be set via env in production. Falls back to a
 * clearly-insecure dev value (with a loud warning) so local dev works out of
 * the box without forcing a non-technical user to generate a secret first.
 */
let cachedSecret: string | undefined;
export function getJwtSecret(): string {
  if (cachedSecret) return cachedSecret;
  const secret = process.env.JWT_SECRET;
  if (secret && secret.length >= 16) {
    cachedSecret = secret;
    return cachedSecret;
  }
  if (process.env.NODE_ENV === 'production') {
    // Fail hard in production rather than signing tokens with a known secret.
    throw new Error(
      'JWT_SECRET is required in production (set a long random string in the environment).',
    );
  }
  logger.warn(
    '⚠ JWT_SECRET not set (or too short) — using an INSECURE development secret. Set JWT_SECRET before deploying.',
  );
  cachedSecret = 'dev-insecure-jwt-secret-change-me-before-deploying';
  return cachedSecret;
}

/**
 * Cookie flags for the auth cookie.
 * - httpOnly: JS cannot read it → not stealable via XSS.
 * - sameSite 'lax': not sent on cross-site requests → CSRF mitigation. Works
 *   across localhost:3000↔3001 and across subdomains of one site in prod.
 * - secure: HTTPS-only. Enable in production (COOKIE_SECURE=true).
 */
export function authCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.COOKIE_SECURE === 'true',
    path: '/',
    maxAge: COOKIE_MAX_AGE_MS,
  };
}
