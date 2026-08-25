import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Contact } from '../common/entities/contact.entity';
import { Appointment } from '../common/entities/appointment.entity';
import { Message } from '../common/entities/message.entity';
import { SeedService } from './seed.service';
import { ConversationsModule } from '../conversations/conversations.module';

import { Service } from '../common/entities/service.entity';
import { User } from '../common/entities/user.entity';
import { Call } from '../common/entities/call.entity';
import { VapiAccount } from '../common/entities/vapi-account.entity';

// Seeds demo data on first run (empty DB only). See SeedService.
@Module({
  imports: [
    TypeOrmModule.forFeature([Contact, Appointment, Message, Service, User, Call, VapiAccount]),
    // For MessagesService.rebuildAllConversations() — seeded messages are
    // inserted directly, so we build their conversation rows afterwards.
    ConversationsModule,
  ],
  providers: [SeedService],
})
export class SeedModule {}
