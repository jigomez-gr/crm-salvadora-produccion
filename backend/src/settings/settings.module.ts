import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppSettings } from '../common/entities/app-settings.entity';
import { SettingsService } from './settings.service';
import { SettingsController } from './settings.controller';
import { AuthModule } from '../auth/auth.module';
import { AgentsConfigModule } from '../agents/agents-config.module';

/**
 * App settings + white-label branding + onboarding. AuthModule provides the
 * guards (and UsersService for the stateful auth guard); AgentsConfigModule lets
 * onboarding seed the default agent with a vertical preset. The branding route
 * is intentionally public. Audit writes go via the event bus.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([AppSettings]),
    AuthModule,
    AgentsConfigModule,
  ],
  providers: [SettingsService],
  controllers: [SettingsController],
  exports: [SettingsService],
})
export class SettingsModule {}
