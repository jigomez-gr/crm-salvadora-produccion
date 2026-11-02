import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppSettings } from '../common/entities/app-settings.entity';
import { AgentConfig } from '../common/entities/agent-config.entity';
import { EmailModule } from '../email/email.module';
import { ZadarmaSmsModule } from '../sms/zadarma-sms.module';
import { VapiModule } from '../vapi/vapi.module';
import { YCloudModule } from '../whatsapp/ycloud.module';
import { HumanHandoffNotificationService } from './human-handoff-notification.service';
import { NotificationsController } from './notifications.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([AppSettings, AgentConfig]),
    forwardRef(() => EmailModule),
    ZadarmaSmsModule,
    forwardRef(() => VapiModule),
    forwardRef(() => YCloudModule),
    AuthModule,
  ],
  providers: [HumanHandoffNotificationService],
  controllers: [NotificationsController],
  exports: [HumanHandoffNotificationService],
})
export class NotificationsModule {}
