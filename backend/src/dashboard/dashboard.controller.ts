import { Controller, Get, UseGuards } from '@nestjs/common';
import { ContactsService } from '../contacts/contacts.service';
import { AppointmentsService } from '../appointments/appointments.service';
import { AgentsConfigService } from '../agents/agents-config.service';
import { MessagesService } from '../conversations/messages.service';
import { PipelineStage } from '../contacts/pipeline';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../auth/current-user.decorator';
import { UserRole } from '../common/entities/user.entity';

@Controller('dashboard')
@UseGuards(JwtAuthGuard)
export class DashboardController {
  constructor(
    private readonly contactsService: ContactsService,
    private readonly appointmentsService: AppointmentsService,
    private readonly agentsConfigService: AgentsConfigService,
    private readonly messagesService: MessagesService,
  ) {}

  @Get('metrics')
  async getMetrics(@CurrentUser() user: AuthUser) {
    const managerId = user.role === UserRole.SERVICE_MANAGER ? user.id : undefined;

    const [
      contactsCount,
      appointmentsToday,
      upcomingAppointments,
      pendingAppointments,
      agentConfigs,
      inbox,
      newLeads,
    ] = await Promise.all([
      this.contactsService.count(),
      this.appointmentsService.countToday(undefined, managerId),
      this.appointmentsService.findUpcoming(5, managerId),
      this.appointmentsService.countPending(managerId),
      this.agentsConfigService.findAll(),
      this.messagesService.inboxCounts(),
      this.contactsService.countByPipelineStage(PipelineStage.NEW),
    ]);

    const activeAgents = agentConfigs.filter((a) => a.enabled).length;

    return {
      contactsCount,
      appointmentsToday,
      upcomingAppointments: upcomingAppointments.length,
      pendingAppointments,
      activeAgents,
      agentsTotal: agentConfigs.length,
      // Inbox signals — the two that mean "a human must act now".
      unreadConversations: inbox.unread,
      handoffConversations: inbox.handoff,
      // Cold leads waiting on a first touch (top of the funnel).
      newLeads,
    };
  }
}
