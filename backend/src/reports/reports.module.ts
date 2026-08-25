import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Appointment } from '../common/entities/appointment.entity';
import { Contact } from '../common/entities/contact.entity';
import { Message } from '../common/entities/message.entity';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';
import { AuthModule } from '../auth/auth.module';

/**
 * Analytics module. Injects the appointment/contact/message repos directly
 * (aggregates over existing rows — no new entity). Registered comfortably before
 * AgentsModule in `app.module.ts` so its `/api/reports` routes aren't shadowed by
 * Mastra's `/api/*` catch-all (same gotcha as the audit module).
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Appointment, Contact, Message]),
    AuthModule,
  ],
  providers: [ReportsService],
  controllers: [ReportsController],
})
export class ReportsModule {}
