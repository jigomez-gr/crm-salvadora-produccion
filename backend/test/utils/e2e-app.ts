import { Test, TestingModule } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Client } from 'pg';

/**
 * Boots the app against a throwaway Postgres database so the e2e suite exercises
 * the actual wiring — the stateful auth guard, the global ValidationPipe + error
 * filter, the `/api` prefix and CORS — through `configureApp` exactly as
 * production runs it.
 *
 * It uses `TestAppModule` (the Mastra-free half of `AppModule`) rather than the
 * real `AppModule`: `@mastra/*` ships ESM that Jest's CommonJS transform can't
 * load, so importing the agent/whatsapp files would crash the runner at require
 * time. See `test/test-app.module.ts`.
 *
 * The database (`crm_e2e_test`) is dropped and recreated before each run on the
 * SAME Postgres instance the dev DB uses (host port 5433), so it never touches
 * the developer's real data. `NODE_ENV=test` keeps TypeORM `synchronize` on, so
 * the schema is built from the entities — no migrations needed for the test DB.
 */

export const E2E_ADMIN_EMAIL = 'e2e-admin@crmsalvadora.local';
export const E2E_ADMIN_PASSWORD = 'E2eAdmin123!';

const TEST_DB_NAME = 'crm_e2e_test';

// Connect to the same server the dev DB lives on; only the database name differs.
const BASE_URL =
  process.env.E2E_DATABASE_URL ||
  process.env.DATABASE_URL ||
  'postgresql://crm:crm@localhost:5432/crm_salvadora';

function withDatabase(name: string): string {
  const url = new URL(BASE_URL);
  url.pathname = `/${name}`;
  return url.toString();
}

/** Drop + recreate the test database, evicting any leftover connections first. */
async function recreateTestDatabase(): Promise<string> {
  const client = new Client({ connectionString: withDatabase('postgres') });
  await client.connect();
  try {
    // A Mastra/TypeORM pool from a previous run may still hold connections; evict
    // them so DROP DATABASE doesn't fail with "database is being accessed".
    await client.query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity
       WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [TEST_DB_NAME],
    );
    await client.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAME}`);
    await client.query(`CREATE DATABASE ${TEST_DB_NAME}`);
  } finally {
    await client.end();
  }
  return withDatabase(TEST_DB_NAME);
}

export interface E2eContext {
  app: NestExpressApplication;
  close: () => Promise<void>;
}

export async function bootstrapTestApp(): Promise<E2eContext> {
  const testUrl = await recreateTestDatabase();

  // Configure the run BEFORE AppModule is imported — its TypeORM and Mastra
  // factories read these at module-evaluation time.
  process.env.NODE_ENV = 'test'; // not 'production' → synchronize builds the schema
  process.env.DATABASE_URL = testUrl;
  process.env.SEED_DEMO_DATA = 'false'; // a clean, predictable DB
  process.env.JWT_SECRET =
    process.env.JWT_SECRET || 'e2e-insecure-test-secret-0123456789';
  process.env.ADMIN_EMAIL = E2E_ADMIN_EMAIL;
  process.env.ADMIN_PASSWORD = E2E_ADMIN_PASSWORD; // non-default → no forced change
  process.env.COOKIE_SECURE = 'false'; // plain http in tests
  process.env.CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:3000';
  const { TestAppModule } = await import('../test-app.module');
  const { configureApp } = await import('../../src/configure-app');

  // Rate limiting is disabled by TestAppModule (it omits the global
  // ThrottlerGuard) so the suite's repeated logins aren't 429'd.
  const moduleRef: TestingModule = await Test.createTestingModule({
    imports: [TestAppModule],
  }).compile();

  const app = moduleRef.createNestApplication<NestExpressApplication>({
    rawBody: true,
  });
  configureApp(app);
  await app.init();

  return {
    app,
    close: async () => {
      await app.close();
    },
  };
}

/** Resolve after `ms` — used to cross a whole-second boundary deterministically. */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
