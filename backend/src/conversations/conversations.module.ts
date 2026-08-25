import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Message } from '../common/entities/message.entity';
import { Conversation } from '../common/entities/conversation.entity';
import { MessagesService } from './messages.service';
import { ConversationsController } from './conversations.controller';
import { AuthModule } from '../auth/auth.module';
import { YCloudModule } from '../whatsapp/ycloud.module';
import { AgentsConfigModule } from '../agents/agents-config.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Message, Conversation]),
    AuthModule,
    // For the inbox manual-send endpoint (operator replies by hand): the YCloud
    // client to send + the agent config for credentials/number. Both are
    // dependency-free of ConversationsModule, so no import cycle.
    YCloudModule,
    AgentsConfigModule,
  ],
  providers: [MessagesService],
  controllers: [ConversationsController],
  exports: [MessagesService],
})
export class ConversationsModule {}
