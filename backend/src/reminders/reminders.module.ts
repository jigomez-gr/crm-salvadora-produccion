import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Appointment } from '../common/entities/appointment.entity';
import { AppointmentReminder } from '../common/entities/appointment-reminder.entity';
import { RemindersService } from './reminders.service';
import { AgentsConfigModule } from '../agents/agents-config.module';
import { YCloudModule } from '../whatsapp/ycloud.module';

/**
 * Scheduled WhatsApp appointment reminders. The cron lives in RemindersService;
 * actual sends are gated per-agent (remindersEnabled + an approved template), so
 * importing this module is safe even when no agent has reminders turned on.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Appointment, AppointmentReminder]),
    AgentsConfigModule,
    YCloudModule,
  ],
  providers: [RemindersService],
})
export class RemindersModule {}
