import 'reflect-metadata';
import * as dotenv from 'dotenv';
dotenv.config();
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { validateEnv } from './common/env';
import { configureApp } from './configure-app';
import { StructuredLogger } from './common/structured-logger';

async function bootstrap() {
  // Fail fast on a misconfigured production environment (missing secrets, CORS,
  // DB URL, or a default admin password) before doing any other work.
  validateEnv();

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true, // needed for YCloud webhook signature verification
    // Buffer boot logs until our structured logger is installed below, so even
    // startup lines come out in the configured format.
    bufferLogs: true,
  });

  // Structured logging: JSON (parseable) in production, pretty in dev, with a
  // per-request correlation id. Drives every existing `new Logger()` call site.
  app.useLogger(new StructuredLogger());

  // Security headers, cookies, body limits, validation, error filter, the /api
  // prefix and CORS — shared with the e2e harness so tests boot like production.
  configureApp(app);

  const port = process.env.PORT || 3001;
  await app.listen(port);
  console.log(`Backend running on http://localhost:${port}`);
  console.log(`Dashboard metrics: http://localhost:${port}/api/dashboard/metrics`);
}

bootstrap();
