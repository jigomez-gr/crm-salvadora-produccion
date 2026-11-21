import { Module, forwardRef } from '@nestjs/common';
import { TelegramCoreModule } from './telegram-core.module';
import { TelegramWebhookController } from './telegram-webhook.controller';
import { AgentsConfigModule } from '../agents/agents-config.module';
import { ContactsModule } from '../contacts/contacts.module';
import { ConversationsModule } from '../conversations/conversations.module';
import { AgentsModule } from '../agents/agents.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    forwardRef(() => TelegramCoreModule),
    forwardRef(() => AgentsConfigModule),
    forwardRef(() => ContactsModule),
    forwardRef(() => ConversationsModule),
    forwardRef(() => AgentsModule),
    forwardRef(() => AuthModule),
  ],
  controllers: [TelegramWebhookController],
  exports: [TelegramCoreModule],
})
export class TelegramModule {}
