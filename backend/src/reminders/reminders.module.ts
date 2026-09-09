import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Appointment } from '../common/entities/appointment.entity';
import { AppointmentReminder } from '../common/entities/appointment-reminder.entity';
import { Service } from '../common/entities/service.entity';
import { RemindersService } from './reminders.service';
import { AgentsConfigModule } from '../agents/agents-config.module';
import { YCloudModule } from '../whatsapp/ycloud.module';
import { EmailModule } from '../email/email.module';
import { ZadarmaSmsModule } from '../sms/zadarma-sms.module';
import { VapiModule } from '../vapi/vapi.module';

/**
 * Scheduled appointment reminders across WhatsApp, Email, Voice and SMS.
 * Channel preferences and reminder offsets (hours/minutes) are resolved per Service.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Appointment, AppointmentReminder, Service]),
    AgentsConfigModule,
    YCloudModule,
    EmailModule,
    ZadarmaSmsModule,
    VapiModule,
  ],
  providers: [RemindersService],
  exports: [RemindersService],
})
export class RemindersModule {}
