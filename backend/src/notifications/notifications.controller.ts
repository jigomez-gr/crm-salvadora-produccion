import { Controller, Post, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { HumanHandoffNotificationService, HumanNoticeResult } from './human-handoff-notification.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../common/entities/user.entity';

@Controller('notifications')
@UseGuards(JwtAuthGuard, RolesGuard)
export class NotificationsController {
  constructor(
    private readonly notificationService: HumanHandoffNotificationService,
  ) {}

  @Post('test-human-notice')
  @Roles(UserRole.ADMIN, UserRole.SERVICE_MANAGER)
  @HttpCode(HttpStatus.OK)
  async testHumanNotice(): Promise<HumanNoticeResult> {
    return this.notificationService.testNotice();
  }
}
