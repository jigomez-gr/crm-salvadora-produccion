import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmailAccount } from '../common/entities/email-account.entity';
import { EmailMessage } from '../common/entities/email-message.entity';
import { Contact } from '../common/entities/contact.entity';
import { Service } from '../common/entities/service.entity';
import { AgentConfig } from '../common/entities/agent-config.entity';
import { EmailService } from './email.service';
import { EmailController } from './email.controller';
import { EmailInboundService } from './email-inbound.service';
import { EmailDialogueEvaluatorService } from './email-dialogue-evaluator.service';
import { AuthModule } from '../auth/auth.module';
import { ConversationsModule } from '../conversations/conversations.module';
import { ContactsModule } from '../contacts/contacts.module';
import { AppointmentsModule } from '../appointments/appointments.module';

/**
 * Business email (SMTP + IMAP) — configure account, send mail to contacts,
 * listen for customer replies (IMAP), record conversation threads, and auto-qualify.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([EmailAccount, EmailMessage, Contact, Service, AgentConfig]),
    AuthModule,
    forwardRef(() => ConversationsModule),
    forwardRef(() => ContactsModule),
    forwardRef(() => AppointmentsModule),
  ],
  providers: [EmailService, EmailDialogueEvaluatorService, EmailInboundService],
  controllers: [EmailController],
  exports: [EmailService, EmailInboundService, EmailDialogueEvaluatorService],
})
export class EmailModule {}
