import { Module } from '@nestjs/common';
import { YCloudModule } from './ycloud.module';
import { YCloudWebhookController } from './ycloud-webhook.controller';
import { EvolutionWebhookController } from './evolution-webhook.controller';
import { EvolutionAdminController } from './evolution-admin.controller';
import { ConversationsModule } from '../conversations/conversations.module';
import { ContactsModule } from '../contacts/contacts.module';
import { AgentsModule } from '../agents/agents.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    YCloudModule,
    ConversationsModule,
    ContactsModule,
    AgentsModule,
    AuthModule,
  ],
  controllers: [
    YCloudWebhookController,
    EvolutionWebhookController,
    EvolutionAdminController,
  ],
  // Re-export YCloudModule so existing importers of WhatsappModule still resolve
  // YCloudClient, WhatsappGatewayService, and EvolutionProvider.
  exports: [YCloudModule],
})
export class WhatsappModule {}
