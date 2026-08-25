import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';

// No providers needed — the default TypeORM DataSource is injectable globally.
@Module({
  controllers: [HealthController],
})
export class HealthModule {}
