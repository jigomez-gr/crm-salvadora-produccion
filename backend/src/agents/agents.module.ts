import { Module } from '@nestjs/common';
import { AgentsConfigModule } from './agents-config.module';
import { AgentRunnerService } from './agent-runner.service';
import { OpenRouterService } from './openrouter.service';
import { AgentsController } from './agents.controller';
import { WidgetController } from '../widget/widget.controller';
import { ConversationsModule } from '../conversations/conversations.module';
import { ContactsModule } from '../contacts/contacts.module';
import { AppMastraModule } from '../mastra/mastra.module';
import { AuthModule } from '../auth/auth.module';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { SettingsModule } from '../settings/settings.module';
import { ServicesModule } from '../services/services.module';
import { AppointmentsModule } from '../appointments/appointments.module';
import { EmailModule } from '../email/email.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    AgentsConfigModule,
    ConversationsModule,
    ContactsModule,
    AppMastraModule,
    AuthModule,
    // The agent runner injects KnowledgeService to resolve each agent's knowledge
    // base into the prompt (both WhatsApp and playground go through the runner).
    KnowledgeModule,
    SettingsModule,
    ServicesModule,
    AppointmentsModule,
    EmailModule,
    UsersModule,
  ],
  providers: [AgentRunnerService, OpenRouterService],
  controllers: [AgentsController, WidgetController],
  exports: [AgentRunnerService, AgentsConfigModule],
})
export class AgentsModule {}

