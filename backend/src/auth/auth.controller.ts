import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Ip,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Response } from 'express';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { CurrentUser, AuthUser } from './current-user.decorator';
import { AllowPasswordChangePending } from './allow-password-change-pending.decorator';
import { ACCESS_TOKEN_COOKIE, authCookieOptions } from './auth.constants';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { AUDIT_EVENT, AuditAction, AuditRecord } from '../audit/audit.types';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly events: EventEmitter2,
  ) {}

  private audit(record: AuditRecord): void {
    this.events.emit(AUDIT_EVENT, record);
  }

  /**
   * Email + password → sets the httpOnly JWT cookie. Tightly rate-limited
   * (5/min/IP) on top of the global throttler to blunt credential stuffing.
   */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
    @Ip() ip: string,
  ) {
    const { token, user } = await this.auth.login(dto?.email, dto?.password);
    res.cookie(ACCESS_TOKEN_COOKIE, token, authCookieOptions());
    this.audit({
      actor: { id: user.id, email: user.email },
      action: AuditAction.LOGIN,
      summary: `Inició sesión (${user.email})`,
      targetType: 'user',
      targetId: user.id,
      ip,
    });
    return { user };
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @AllowPasswordChangePending()
  @HttpCode(HttpStatus.OK)
  logout(@Res({ passthrough: true }) res: Response) {
    // Clear with the same flags used to set it (sans maxAge).
    const { maxAge: _omit, ...opts } = authCookieOptions();
    res.clearCookie(ACCESS_TOKEN_COOKIE, opts);
    return { ok: true };
  }

  /**
   * Change the signed-in user's own password. Verifies the current one, applies
   * the strength policy, and re-issues the cookie so the acting session stays
   * valid (other sessions are invalidated). Reachable while a password change is
   * still pending (that's the whole point).
   */
  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  @AllowPasswordChangePending()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async changePassword(
    @CurrentUser() current: AuthUser,
    @Body() dto: ChangePasswordDto,
    @Res({ passthrough: true }) res: Response,
    @Ip() ip: string,
  ) {
    const { token, user } = await this.auth.changePassword(
      current.id,
      dto.currentPassword,
      dto.newPassword,
    );
    res.cookie(ACCESS_TOKEN_COOKIE, token, authCookieOptions());
    this.audit({
      actor: { id: user.id, email: user.email },
      action: AuditAction.PASSWORD_CHANGE,
      summary: 'Cambió su propia contraseña',
      targetType: 'user',
      targetId: user.id,
      ip,
    });
    return { user };
  }

  /** Returns the current session's user — used by the frontend to restore state. */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  @AllowPasswordChangePending()
  me(@CurrentUser() user: AuthUser) {
    return { user };
  }
}
