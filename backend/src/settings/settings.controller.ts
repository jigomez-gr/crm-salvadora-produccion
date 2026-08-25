import {
  Body,
  Controller,
  Get,
  Ip,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { SettingsService } from './settings.service';
import { OnboardingDto, UpdateSettingsDto } from './dto/settings.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser, AuthUser } from '../auth/current-user.decorator';
import { UserRole } from '../common/entities/user.entity';
import { AUDIT_EVENT, AuditAction, AuditRecord } from '../audit/audit.types';

@Controller('settings')
export class SettingsController {
  constructor(
    private readonly settings: SettingsService,
    private readonly events: EventEmitter2,
  ) {}

  private audit(record: AuditRecord): void {
    this.events.emit(AUDIT_EVENT, record);
  }

  /**
   * PUBLIC branding subset (no auth) — the login screen renders the business
   * name / logo / colour before the user is authenticated. Non-sensitive.
   */
  @Get('branding')
  branding() {
    return this.settings.getBranding();
  }

  /** Full settings — any authenticated user (the app reads them widely). */
  @Get()
  @UseGuards(JwtAuthGuard)
  get() {
    return this.settings.get();
  }

  /** Available onboarding presets (for the wizard) — any authenticated user. */
  @Get('presets')
  @UseGuards(JwtAuthGuard)
  presets() {
    return this.settings.presets();
  }

  /** Apply the onboarding wizard (seed the default agent) — ADMIN only. */
  @Post('onboarding')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async onboarding(
    @Body() dto: OnboardingDto,
    @CurrentUser() actor: AuthUser,
    @Ip() ip: string,
  ) {
    const settings = await this.settings.applyOnboarding(dto);
    this.audit({
      actor: { id: actor.id, email: actor.email },
      action: AuditAction.ONBOARDING_COMPLETE,
      summary: `Completó el onboarding (negocio "${settings.businessName}", preset "${dto.preset}")`,
      targetType: 'settings',
      ip,
    });
    return settings;
  }

  /** Update settings — ADMIN only. */
  @Put()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async update(
    @Body() dto: UpdateSettingsDto,
    @CurrentUser() actor: AuthUser,
    @Ip() ip: string,
  ) {
    const settings = await this.settings.update(dto);
    this.audit({
      actor: { id: actor.id, email: actor.email },
      action: AuditAction.SETTINGS_UPDATE,
      summary: 'Actualizó la configuración (marca / negocio)',
      targetType: 'settings',
      ip,
      metadata: { changed: Object.keys(dto) },
    });
    return settings;
  }

  /** Wipe all CRM data (contacts/appointments/conversations) — ADMIN only. */
  @Post('clear-demo')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async clearDemo(@CurrentUser() actor: AuthUser, @Ip() ip: string) {
    const result = await this.settings.clearDemoData();
    this.audit({
      actor: { id: actor.id, email: actor.email },
      action: AuditAction.DATA_CLEAR_DEMO,
      summary:
        'Vació los datos de demostración (contactos, citas y conversaciones)',
      targetType: 'data',
      ip,
    });
    return result;
  }
}
