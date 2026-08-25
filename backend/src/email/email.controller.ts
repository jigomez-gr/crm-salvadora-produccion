import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Ip,
  UseGuards,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { EmailService } from './email.service';
import {
  SendEmailDto,
  TestEmailDto,
  UpdateEmailConfigDto,
} from './dto/email.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser, AuthUser } from '../auth/current-user.decorator';
import { UserRole } from '../common/entities/user.entity';
import { AUDIT_EVENT, AuditAction, AuditRecord } from '../audit/audit.types';

@Controller('email')
@UseGuards(JwtAuthGuard)
export class EmailController {
  constructor(
    private readonly email: EmailService,
    private readonly events: EventEmitter2,
  ) {}

  private audit(record: AuditRecord): void {
    this.events.emit(AUDIT_EVENT, record);
  }

  /** Whether an email account is configured — any operator (drives the UI). */
  @Get('status')
  status() {
    return this.email.status();
  }

  /** The email account config (secret stripped) — ADMIN only. */
  @Get('config')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  config() {
    return this.email.getConfigView();
  }

  /** Update the email account — ADMIN only. */
  @Put('config')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  async updateConfig(
    @Body() dto: UpdateEmailConfigDto,
    @CurrentUser() actor: AuthUser,
    @Ip() ip: string,
  ) {
    const view = await this.email.updateConfig(dto);
    this.audit({
      actor: { id: actor.id, email: actor.email },
      action: AuditAction.EMAIL_CONFIG_UPDATE,
      summary: 'Actualizó la cuenta de correo (SMTP)',
      targetType: 'email',
      ip,
      metadata: { changed: Object.keys(dto) },
    });
    return view;
  }

  /** Send a test email to verify the configuration — ADMIN only. */
  @Post('test')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  test(@Body() dto: TestEmailDto) {
    return this.email.sendTest(dto.to);
  }

  /** Send an email to a contact — any operator. */
  @Post('send')
  async send(
    @Body() dto: SendEmailDto,
    @CurrentUser() actor: AuthUser,
    @Ip() ip: string,
  ) {
    const message = await this.email.send(
      dto.contactId,
      dto.subject,
      dto.body,
      actor.email,
    );
    this.audit({
      actor: { id: actor.id, email: actor.email },
      action: AuditAction.EMAIL_SENT,
      // PII-light: no recipient/subject/body — just the action + the contact id.
      summary: 'Envió un correo a un contacto',
      targetType: 'contact',
      targetId: dto.contactId,
      ip,
    });
    return message;
  }

  /** A contact's sent-email history — any operator. */
  @Get('contact/:contactId')
  history(@Param('contactId', ParseUUIDPipe) contactId: string) {
    // Validate the id so a malformed one is a clean 400, not a uuid-cast 500.
    return this.email.historyFor(contactId);
  }
}
