import { Module } from '@nestjs/common';
import { join } from 'path';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { Contact } from './common/entities/contact.entity';
import { Appointment } from './common/entities/appointment.entity';
import { AgentConfig } from './common/entities/agent-config.entity';
import { Message } from './common/entities/message.entity';
import { Conversation } from './common/entities/conversation.entity';
import { AppointmentReminder } from './common/entities/appointment-reminder.entity';
import { User } from './common/entities/user.entity';
import { AuditLog } from './common/entities/audit-log.entity';
import { AppSettings } from './common/entities/app-settings.entity';
import { KnowledgeDocument } from './common/entities/knowledge-document.entity';
import { KnowledgeChunk } from './common/entities/knowledge-chunk.entity';
import { EmailAccount } from './common/entities/email-account.entity';
import { EmailMessage } from './common/entities/email-message.entity';
import { PaymentAccount } from './common/entities/payment-account.entity';
import { CalcomAccount } from './common/entities/calcom-account.entity';
import { Service } from './common/entities/service.entity';
import { Call } from './common/entities/call.entity';
import { VapiAccount } from './common/entities/vapi-account.entity';
import { ZadarmaSmsLog } from './sms/zadarma-sms-log.entity';
import { ZadarmaSmsModule } from './sms/zadarma-sms.module';
import { ContactsModule } from './contacts/contacts.module';
import { AppointmentsModule } from './appointments/appointments.module';
import { ServicesModule } from './services/services.module';
import { ConversationsModule } from './conversations/conversations.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { ReportsModule } from './reports/reports.module';
import { EventsModule } from './events/events.module';
import { WhatsappModule } from './whatsapp/whatsapp.module';
import { VapiModule } from './vapi/vapi.module';
import { CallsModule } from './calls/calls.module';
import { SeedModule } from './seed/seed.module';
import { RemindersModule } from './reminders/reminders.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { AuditModule } from './audit/audit.module';
import { SettingsModule } from './settings/settings.module';
import { KnowledgeModule } from './knowledge/knowledge.module';
import { EmailModule } from './email/email.module';
import { PaymentsModule } from './payments/payments.module';
import { CalcomModule } from './calcom/calcom.module';
import { AgentsModule } from './agents/agents.module';

@Module({
  imports: [
    EventEmitterModule.forRoot(),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 120 }]),
    TypeOrmModule.forRoot({
      type: 'postgres',
      url:
        process.env.DATABASE_URL ||
        'postgresql://postgres:W39xlpS9@172.17.0.1:5433/crm_salvadora',
      entities: [
        Contact,
        Appointment,
        Service,
        AgentConfig,
        Message,
        Conversation,
        AppointmentReminder,
        User,
        AuditLog,
        AppSettings,
        KnowledgeDocument,
        KnowledgeChunk,
        EmailAccount,
        EmailMessage,
        PaymentAccount,
        CalcomAccount,
        Call,
        VapiAccount,
        ZadarmaSmsLog,
      ],
      synchronize: false,
      migrationsRun: false,
      retryAttempts: 15,
      retryDelay: 3000,
      extra: {
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000,
        keepAlive: true,
      },
    }),
    ContactsModule,
    AppointmentsModule,
    ServicesModule,
    ConversationsModule,
    DashboardModule,
    ReportsModule,
    AuditModule,
    SettingsModule,
    KnowledgeModule,
    EmailModule,
    PaymentsModule,
    CalcomModule,
    ZadarmaSmsModule,
    VapiModule,
    CallsModule,
    SeedModule,
    RemindersModule,
    HealthModule,
    AuthModule,
    UsersModule,
    WhatsappModule,
    AgentsModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
