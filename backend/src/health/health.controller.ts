import {
  Controller,
  Get,
  ServiceUnavailableException,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

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
    } catch (err: any) {
      throw new ServiceUnavailableException({
        status: 'not-ready',
        reason: 'database-unreachable',
        error: err?.message,
      });
    }
  }

  @Get('db-check')
  async dbCheck() {
    try {
      const ping = await this.dataSource.query('SELECT 1 as ping');
      const users = await this.dataSource.query('SELECT id, email, role, "isActive" FROM users LIMIT 10');
      const tables = await this.dataSource.query(
        "SELECT count(*)::int as count FROM information_schema.tables WHERE table_schema = 'public'"
      );

      const dbUrl = process.env.DATABASE_URL || '';
      const maskedUrl = dbUrl.replace(/:([^:@]+)@/, ':***@');

      return {
        connected: true,
        databaseUrlMasked: maskedUrl,
        tablesCount: tables[0]?.count,
        usersFound: users,
      };
    } catch (err: any) {
      const dbUrl = process.env.DATABASE_URL || '';
      const maskedUrl = dbUrl.replace(/:([^:@]+)@/, ':***@');
      return {
        connected: false,
        databaseUrlMasked: maskedUrl,
        error: err?.message || String(err),
      };
    }
  }
}
