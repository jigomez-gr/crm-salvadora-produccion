import { Module, forwardRef } from '@nestjs/common';
import { AgentsConfigModule } from './agents-config.module';
import { AgentRunnerService } from './agent-runner.service';
import { OpenRouterService } from './openrouter.service';
import { ContactQueryEvaluatorService } from '../widget/contact-query-evaluator.service';
import { AgentsController } from './agents.controller';
import { WidgetController } from '../widget/widget.controller';
import { ConversationsModule } from '../conversations/conversations.module';
import { ContactsModule } from '../contacts/contacts.module';
import { AppMastraModule } from '../mastra/mastra.module';
import { AuthModule } from '../auth/auth.module';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { SettingsModule } from '../settings/settings.module';
import { ServicesModule } from '../services/services.module';
import { CategoriesModule } from '../categories/categories.module';
import { AppointmentsModule } from '../appointments/appointments.module';
import { EmailModule } from '../email/email.module';
import { UsersModule } from '../users/users.module';
import { VapiModule } from '../vapi/vapi.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { TelegramCoreModule } from '../telegram/telegram-core.module';
import { TelegramModule } from '../telegram/telegram.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';

@Module({
  imports: [
    AgentsConfigModule,
    ConversationsModule,
    ContactsModule,
    AuthModule,
    // The agent runner injects KnowledgeService to resolve each agent's knowledge
    // base into the prompt (both WhatsApp and playground go through the runner).
    KnowledgeModule,
    SettingsModule,
    ServicesModule,
    CategoriesModule,
    AppointmentsModule,
    EmailModule,
    UsersModule,
    VapiModule,
    NotificationsModule,
    forwardRef(() => TelegramCoreModule),
    forwardRef(() => TelegramModule),
    forwardRef(() => WhatsappModule),
    // IMPORTANT: AppMastraModule registers MastraController with a catch-all
    // `/api/*` route, so it MUST be imported last after all other controllers.
    AppMastraModule,
  ],
  providers: [AgentRunnerService, OpenRouterService, ContactQueryEvaluatorService],
  controllers: [AgentsController, WidgetController],
  exports: [AgentRunnerService, AgentsConfigModule, ContactQueryEvaluatorService],
})
export class AgentsModule {}

