import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmailAccount } from '../common/entities/email-account.entity';
import { EmailMessage } from '../common/entities/email-message.entity';
import { Contact } from '../common/entities/contact.entity';
import { EmailService } from './email.service';
import { EmailController } from './email.controller';
import { AuthModule } from '../auth/auth.module';

/**
 * Business email (SMTP) — configure a single account and send mail to contacts.
 * Mastra-free, so it's registered comfortably before `AgentsModule` (Mastra's
 * `/api/*` catch-all). Reads the `Contact` repo (recipient lookup) but owns its
 * own account/history tables. Audit writes go via the event bus.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([EmailAccount, EmailMessage, Contact]),
    AuthModule,
  ],
  providers: [EmailService],
  controllers: [EmailController],
  exports: [EmailService],
})
export class EmailModule {}
