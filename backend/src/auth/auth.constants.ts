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
 * JWT signing secret.
 */
let cachedSecret: string | undefined;
export function getJwtSecret(): string {
  if (cachedSecret) return cachedSecret;
  const secret = process.env.JWT_SECRET;
  if (secret && secret.length >= 16) {
    cachedSecret = secret;
    return cachedSecret;
  }
  cachedSecret = secret || 'super-secret-crm-key-39xlps9-jwt-token-2026';
  return cachedSecret;
}

/**
 * Cookie flags for the auth cookie.
 * - httpOnly: JS cannot read it → not stealable via XSS.
 * - sameSite 'lax': not sent on cross-site requests → CSRF mitigation.
 * - secure: HTTPS-only.
 */
export function authCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.COOKIE_SECURE === 'true' || process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: COOKIE_MAX_AGE_MS,
  };
}
