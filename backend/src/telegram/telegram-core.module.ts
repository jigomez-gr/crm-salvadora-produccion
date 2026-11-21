import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TelegramLinkToken } from '../common/entities/telegram-link-token.entity';
import { Contact } from '../common/entities/contact.entity';
import { AgentConfig } from '../common/entities/agent-config.entity';
import { AgentsConfigModule } from '../agents/agents-config.module';
import { ContactsModule } from '../contacts/contacts.module';
import { ConversationsModule } from '../conversations/conversations.module';
import { AuthModule } from '../auth/auth.module';
import { TelegramClientService } from './telegram-client.service';
import { TelegramLinkService } from './telegram-link.service';
import { TelegramService } from './telegram.service';
import { TelegramAdminController } from './telegram-admin.controller';

/**
 * Mastra-free Telegram module. Can be imported by ConversationsModule,
 * AppointmentsModule, RemindersModule, WidgetModule, and TestAppModule without
 * pulling in @mastra/* ESM packages.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([TelegramLinkToken, Contact, AgentConfig]),
    AgentsConfigModule,
    ContactsModule,
    forwardRef(() => ConversationsModule),
    AuthModule,
  ],
  controllers: [TelegramAdminController],
  providers: [TelegramClientService, TelegramLinkService, TelegramService],
  exports: [TelegramClientService, TelegramLinkService, TelegramService],
})
export class TelegramCoreModule {}
