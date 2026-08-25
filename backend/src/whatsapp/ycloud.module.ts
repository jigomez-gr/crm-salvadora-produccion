import { Module } from '@nestjs/common';
import { YCloudClient } from './ycloud-client.service';

/**
 * The bare YCloud send client, with no other dependencies. Extracted into its
 * own module so consumers that need to *send* WhatsApp messages (the inbound
 * webhook, the conversations inbox manual-send, future reminders) can import it
 * without pulling in the webhook controller — and without creating an import
 * cycle (WhatsappModule imports ConversationsModule, so ConversationsModule
 * can't import WhatsappModule back).
 */
@Module({
  providers: [YCloudClient],
  exports: [YCloudClient],
})
export class YCloudModule {}
