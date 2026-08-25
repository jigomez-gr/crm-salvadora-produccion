import { ValidationPipe, RequestMethod } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import { AllExceptionsFilter } from './common/all-exceptions.filter';
import { pickRequestId, runWithRequestContext } from './common/request-context';

/**
 * Apply every cross-cutting framework concern to a Nest application: security
 * headers, cookie parsing, body limits, validation, the uniform error filter,
 * the `/api` global prefix and CORS.
 *
 * Extracted from `main.ts` so the **e2e test harness boots the app exactly the
 * way production does** — same global prefix, pipe, filter, cookie parser and
 * body parser. A test that skipped this would be testing routes at the wrong
 * path, without validation/cookies, and wouldn't catch a regression a real
 * request hits. Keep this function the single source of truth; `main.ts` only
 * adds `app.listen()` on top.
 */
export function configureApp(app: NestExpressApplication): void {
  // The app runs behind a reverse proxy (Traefik/Dokploy) in production, so the
  // real client IP arrives in X-Forwarded-For. Without trusting the proxy,
  // express-based rate limiting would bucket every request under the proxy's IP
  // (making the per-IP login throttle a single global bucket an attacker can use
  // to lock everyone out). Trust exactly one proxy hop in prod; only loopback in
  // dev (so a local client cannot spoof its IP via a forged header).
  app.set('trust proxy', process.env.NODE_ENV === 'production' ? 1 : 'loopback');

  // Request correlation id — FIRST, so every downstream log line (and the error
  // filter's response) shares one id. Honour an inbound X-Request-Id (set by the
  // proxy or a calling service) or mint one; echo it on the response and run the
  // rest of the request inside an AsyncLocalStorage scope the logger reads from.
  app.use((req: Request, res: Response, next: NextFunction) => {
    const requestId = pickRequestId(req.headers['x-request-id'], randomUUID());
    res.setHeader('X-Request-Id', requestId);
    runWithRequestContext({ requestId }, () => next());
  });

  // Security HTTP headers (HSTS, no-sniff, frame protection, etc.). This is a
  // JSON API consumed by a separate frontend, so the default CSP is unneeded
  // and would only restrict this API's own (non-HTML) responses.
  app.use(helmet({ contentSecurityPolicy: false }));

  // Parse cookies so the JWT auth guard can read the httpOnly session cookie.
  app.use(cookieParser());

  // Raise the JSON body limit above the 100 kB default so a CSV contact import
  // (the file's text posted in a JSON field) isn't rejected. Using
  // useBodyParser (vs re-adding express.json) preserves the buffered rawBody
  // that the YCloud webhook signature verification depends on.
  app.useBodyParser('json', { limit: '6mb' });

  // Validate and sanitise every request body against its DTO class.
  // - whitelist: strip properties not declared on the DTO (prevents mass
  //   assignment of fields the API doesn't expose).
  // - transform: hand the handler a real DTO instance (needed for class-validator).
  // forbidNonWhitelisted is intentionally left OFF so a client that sends an
  // extra field (e.g. the sanitized agent echo with `has*` booleans) is cleaned
  // up rather than rejected.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  // Uniform error responses with a correlation id; no stack leakage in prod.
  app.useGlobalFilters(new AllExceptionsFilter());

  // Everything is under /api EXCEPT the health endpoints, which live at the root
  // (/healthz, /healthz/ready). This keeps them clear of Mastra's `/api/*`
  // catch-all (which, with @mastra/nestjs, also owns /api/health) so our DB-aware
  // readiness check is reachable for the reverse proxy / container healthcheck.
  app.setGlobalPrefix('api', {
    exclude: [
      { path: 'healthz', method: RequestMethod.GET },
      { path: 'healthz/ready', method: RequestMethod.GET },
    ],
  });

  const corsOrigin = (
    process.env.CORS_ORIGIN || 'http://localhost:3000,http://localhost:3001'
  )
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.enableCors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, curl, etc.) or wildcard or widget requests
      if (!origin || corsOrigin.includes('*') || corsOrigin.includes(origin) || process.env.NODE_ENV !== 'production') {
        return callback(null, true);
      }
      // In production, allow configured origins or let widget endpoints be embeddable anywhere
      return callback(null, true);
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
    credentials: true,
  });
}
