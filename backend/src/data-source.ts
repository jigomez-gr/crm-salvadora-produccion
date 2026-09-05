import 'reflect-metadata';
import * as dotenv from 'dotenv';
dotenv.config();
import { DataSource } from 'typeorm';
import { join } from 'path';
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
import { Service } from './common/entities/service.entity';
import { Call } from './common/entities/call.entity';
import { VapiAccount } from './common/entities/vapi-account.entity';
import { PaymentAccount } from './common/entities/payment-account.entity';
import { CalcomAccount } from './common/entities/calcom-account.entity';
import { ZadarmaSmsLog } from './sms/zadarma-sms-log.entity';

/**
 * Standalone TypeORM DataSource used ONLY by the migration CLI
 * (`pnpm migration:generate` / `migration:run` / `migration:revert`).
 *
 * The running app configures TypeORM in `app.module.ts`. This file mirrors that
 * connection so the CLI sees the same entities and the same database. Keep the
 * entity list in sync with `app.module.ts`.
 */
export const AppDataSource = new DataSource({
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
    ZadarmaSmsLog,
  ],
  // When run through ts-node (CLI) __dirname is src/, matching *.ts; at runtime
  // it is dist/, matching the compiled *.js.
  migrations: [join(__dirname, 'migrations', '*.{ts,js}')],
  synchronize: false,
});
