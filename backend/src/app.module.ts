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
// IMPORTANT: AgentsModule (which imports AppMastraModule with NestMastraModule) MUST be last.
// NestMastraModule mounts catch-all routes under /api; importing it earlier returns 404s
// for routes registered after it.

@Module({
  imports: [
    EventEmitterModule.forRoot(),
    // Cron scheduling (appointment reminders). Sends are gated per-agent.
    ScheduleModule.forRoot(),
    // Rate limiting: cap requests per IP to blunt brute-force and abuse (e.g.
    // someone hammering the public webhook or the LLM playground). 120 req/min.
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 120 }]),
    TypeOrmModule.forRoot({
      type: 'postgres',
      url:
        process.env.DATABASE_URL ||
        'postgresql://crm:crm@localhost:5432/crm_salvadora',
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
      ],
      migrations: [join(__dirname, 'migrations', '*.{js,ts}')],
      // Auto-sync schema to ensure services, knowledge, payments and call tables exist
      synchronize: true,
      migrationsRun: false,
    }),
    ContactsModule,
    AppointmentsModule,
    ServicesModule,
    ConversationsModule,
    DashboardModule,
    // Reports/analytics + audit trail + settings APIs — kept well before
    // AgentsModule (Mastra's `/api/*` catch-all) so their routes aren't shadowed.
    ReportsModule,
    AuditModule,
    SettingsModule,
    // Agent knowledge base (Mastra-free). Before AgentsModule so its routes
    // aren't shadowed by the Mastra catch-all; AgentsModule injects its service.
    KnowledgeModule,
    // Business email (SMTP) — Mastra-free, before AgentsModule's catch-all.
    EmailModule,
    // Payments (Stripe Checkout, Bizum, Webhooks) — Mastra-free, before AgentsModule
    PaymentsModule,
    // Cal.com integration — Mastra-free, before AgentsModule
    CalcomModule,
    // VAPI voice agent & calls channel — before AgentsModule
    VapiModule,
    CallsModule,
    EventsModule,
    WhatsappModule,
    SeedModule,
    RemindersModule,
    // Health endpoints — before AgentsModule so /api/health isn't shadowed.
    HealthModule,
    // Auth + user management. Imported before AgentsModule (Mastra's catch-all).
    AuthModule,
    UsersModule,
    AgentsModule, // MUST be last — see comment above
  ],
  providers: [
    // Apply the rate limiter globally to every route.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
