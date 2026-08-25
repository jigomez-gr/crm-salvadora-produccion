import { Module } from '@nestjs/common';
import { YCloudModule } from './ycloud.module';
import { YCloudWebhookController } from './ycloud-webhook.controller';
import { ConversationsModule } from '../conversations/conversations.module';
import { ContactsModule } from '../contacts/contacts.module';
import { AgentsModule } from '../agents/agents.module';

@Module({
  imports: [YCloudModule, ConversationsModule, ContactsModule, AgentsModule],
  controllers: [YCloudWebhookController],
  // Re-export YCloudModule so existing importers of WhatsappModule still resolve
  // YCloudClient.
  exports: [YCloudModule],
})
export class WhatsappModule {}
