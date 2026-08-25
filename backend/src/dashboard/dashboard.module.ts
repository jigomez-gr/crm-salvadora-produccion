import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { ContactsModule } from '../contacts/contacts.module';
import { AppointmentsModule } from '../appointments/appointments.module';
import { AgentsConfigModule } from '../agents/agents-config.module';
import { ConversationsModule } from '../conversations/conversations.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    ContactsModule,
    AppointmentsModule,
    AgentsConfigModule,
    // For inbox aggregates (unread + handoff) on the dashboard. Exports
    // MessagesService; dependency-free of DashboardModule, so no cycle.
    ConversationsModule,
    AuthModule,
  ],
  controllers: [DashboardController],
})
export class DashboardModule {}
