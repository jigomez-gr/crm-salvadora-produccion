import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VapiAccount } from '../common/entities/vapi-account.entity';
import { Call } from '../common/entities/call.entity';
import { Contact } from '../common/entities/contact.entity';
import { Appointment } from '../common/entities/appointment.entity';
import { Service } from '../common/entities/service.entity';
import { AgentConfig } from '../common/entities/agent-config.entity';
import { AppSettings } from '../common/entities/app-settings.entity';
import { AppointmentsModule } from '../appointments/appointments.module';
import { ContactsModule } from '../contacts/contacts.module';
import { AuthModule } from '../auth/auth.module';
import { VapiService } from './vapi.service';
import { VapiWebhookService } from './vapi-webhook.service';
import { VapiController } from './vapi.controller';
import { VapiWebhookController } from './vapi-webhook.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      VapiAccount,
      Call,
      Contact,
      Appointment,
      Service,
      AgentConfig,
      AppSettings,
    ]),
    forwardRef(() => AppointmentsModule),
    forwardRef(() => ContactsModule),
    AuthModule,
  ],
  providers: [VapiService, VapiWebhookService],
  controllers: [VapiWebhookController, VapiController],
  exports: [VapiService, VapiWebhookService],
})
export class VapiModule {}
