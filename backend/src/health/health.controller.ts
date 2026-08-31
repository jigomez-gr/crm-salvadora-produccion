import {
  Controller,
  Get,
  Res,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { Response } from 'express';

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
  async readiness(@Res() res: Response) {
    try {
      await this.dataSource.query('SELECT 1');
      return res.status(200).json({ status: 'ready', database: 'connected' });
    } catch (err: any) {
      return res.status(200).json({
        status: 'not-ready',
        reason: 'database-unreachable',
        error: err?.message || String(err),
      });
    }
  }

  @Get('db-check')
  async dbCheck(@Res() res: Response) {
    const dbUrl = process.env.DATABASE_URL || '';
    const maskedUrl = dbUrl.replace(/:([^:@]+)@/, ':***@');

    try {
      const ping = await this.dataSource.query('SELECT 1 as ping');
      const users = await this.dataSource.query('SELECT id, email, role, "isActive" FROM users LIMIT 10');
      const tables = await this.dataSource.query(
        "SELECT count(*)::int as count FROM information_schema.tables WHERE table_schema = 'public'"
      );

      return res.status(200).json({
        connected: true,
        databaseUrlMasked: maskedUrl,
        tablesCount: tables[0]?.count,
        usersFound: users,
      });
    } catch (err: any) {
      return res.status(200).json({
        connected: false,
        databaseUrlMasked: maskedUrl,
        errorMessage: err?.message || String(err),
        errorName: err?.name,
        errorStack: err?.stack,
      });
    }
  }
}
