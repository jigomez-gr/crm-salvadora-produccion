import {
  Controller,
  Get,
  ServiceUnavailableException,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

/**
 * Health endpoints for the reverse proxy / orchestrator. PUBLIC by design (no
 * auth) and exempt from rate limiting.
 *
 * Mounted at the ROOT (outside the `/api` global prefix — see main.ts) under the
 * `healthz` namespace so they never collide with @mastra/nestjs, which provides
 * its own `/api/health`, `/api/ready`, `/api/info` plus an `/api/*` catch-all.
 *
 * - GET /healthz        → liveness (process is up)
 * - GET /healthz/ready  → readiness (DB reachable) — 503 if not
 */
@Controller('healthz')
@SkipThrottle()
export class HealthController {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  @Get()
  liveness() {
    return { status: 'ok', uptime: Math.round(process.uptime()) };
  }

  @Get('ready')
  async readiness() {
    try {
      await this.dataSource.query('SELECT 1');
      return { status: 'ready' };
    } catch {
      throw new ServiceUnavailableException({
        status: 'not-ready',
        reason: 'database-unreachable',
      });
    }
  }
}
