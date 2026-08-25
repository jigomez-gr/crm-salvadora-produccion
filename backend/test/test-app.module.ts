import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { Contact } from '../src/common/entities/contact.entity';
import { Appointment } from '../src/common/entities/appointment.entity';
import { AgentConfig } from '../src/common/entities/agent-config.entity';
import { Message } from '../src/common/entities/message.entity';
import { Conversation } from '../src/common/entities/conversation.entity';
import { AppointmentReminder } from '../src/common/entities/appointment-reminder.entity';
import { User } from '../src/common/entities/user.entity';
import { AuditLog } from '../src/common/entities/audit-log.entity';
import { AppSettings } from '../src/common/entities/app-settings.entity';
import { KnowledgeDocument } from '../src/common/entities/knowledge-document.entity';
import { KnowledgeChunk } from '../src/common/entities/knowledge-chunk.entity';
import { EmailAccount } from '../src/common/entities/email-account.entity';
import { EmailMessage } from '../src/common/entities/email-message.entity';
import { ContactsModule } from '../src/contacts/contacts.module';
import { ConversationsModule } from '../src/conversations/conversations.module';
import { ReportsModule } from '../src/reports/reports.module';
import { AuditModule } from '../src/audit/audit.module';
import { KnowledgeModule } from '../src/knowledge/knowledge.module';
import { EmailModule } from '../src/email/email.module';
import { AuthModule } from '../src/auth/auth.module';
import { UsersModule } from '../src/users/users.module';

/**
 * The application module used by the e2e suite. It mirrors the production
 * `AppModule` but **deliberately excludes the Mastra-backed modules**
 * (`AgentsModule`/`WhatsappModule`) and the cron/seed modules.
 *
 * Why a separate module instead of importing the real `AppModule`: `@mastra/*`
 * ships ESM (e.g. `tokenx` as `.mjs`) that Jest's CommonJS transform cannot load,
 * so merely importing any file that imports `@mastra/nestjs` crashes the test
 * runner at require time. The webhook's security behaviour is covered instead by
 * the pure `ycloud-signature.spec.ts` unit test (fail-closed verification),
 * which is more exhaustive than an e2e could be.
 *
 * The schema is built by TypeORM `synchronize` (NODE_ENV !== 'production'), so
 * the full entity list is registered here to match the real DB. Keep this list
 * in sync with `app.module.ts` / `data-source.ts`.
 *
 * Note: the global `ThrottlerGuard` (registered via `APP_GUARD` in the real
 * `AppModule`) is intentionally NOT registered here — the suite's repeated
 * logins would otherwise trip the 5/min login throttle, and rate limiting isn't
 * what these tests cover. `ThrottlerModule` is still imported so the `@Throttle`
 * decorators on controllers resolve harmlessly.
 */
@Module({
  imports: [
    EventEmitterModule.forRoot(),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 120 }]),
    TypeOrmModule.forRoot({
      type: 'postgres',
      url:
        process.env.DATABASE_URL ||
        'postgresql://crm:crm@localhost:5433/crm_e2e_test',
      entities: [
        Contact,
        Appointment,
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
      ],
      synchronize: true,
      migrationsRun: false,
    }),
    ContactsModule,
    ConversationsModule,
    ReportsModule,
    AuditModule,
    KnowledgeModule,
    EmailModule,
    AuthModule,
    UsersModule,
  ],
})
export class TestAppModule {}
