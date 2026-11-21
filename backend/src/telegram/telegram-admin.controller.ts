import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../common/entities/user.entity';
import { AgentsConfigService } from '../agents/agents-config.service';
import { TelegramService } from './telegram.service';

export class ConnectTelegramDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  botToken?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  webhookSecret?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  webhookBaseUrl?: string;
}

export class ConfigureTelegramWebhookDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  webhookBaseUrl?: string;
}

export class ToggleTelegramDto {
  @IsBoolean()
  enabled: boolean;
}

@Controller('agents/:agentKey/telegram')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class TelegramAdminController {
  constructor(
    private readonly agentsConfigService: AgentsConfigService,
    private readonly telegramService: TelegramService,
  ) {}

  @Get('status')
  async getStatus(@Param('agentKey') agentKey: string, @Req() req: Request) {
    const config = await this.agentsConfigService.findByKey(agentKey);
    const fallbackBaseUrl = this.resolveRequestOrigin(req);
    return this.telegramService.getConnectionStatus(config, fallbackBaseUrl);
  }

  @Post('connect')
  @HttpCode(HttpStatus.OK)
  async connect(
    @Param('agentKey') agentKey: string,
    @Body() dto: ConnectTelegramDto,
    @Req() req: Request,
  ) {
    const fallbackBaseUrl = this.resolveRequestOrigin(req);
    return this.telegramService.connectBot(agentKey, dto, fallbackBaseUrl);
  }

  @Post('check')
  @HttpCode(HttpStatus.OK)
  async check(@Param('agentKey') agentKey: string, @Req() req: Request) {
    const config = await this.agentsConfigService.findByKey(agentKey);
    const fallbackBaseUrl = this.resolveRequestOrigin(req);
    return this.telegramService.getConnectionStatus(config, fallbackBaseUrl);
  }

  @Post('configure-webhook')
  @HttpCode(HttpStatus.OK)
  async configureWebhook(
    @Param('agentKey') agentKey: string,
    @Body() dto: ConfigureTelegramWebhookDto,
    @Req() req: Request,
  ) {
    const fallbackBaseUrl = this.resolveRequestOrigin(req);
    return this.telegramService.configureWebhook(
      agentKey,
      dto?.webhookBaseUrl,
      fallbackBaseUrl,
    );
  }

  @Post('toggle')
  @HttpCode(HttpStatus.OK)
  async toggle(
    @Param('agentKey') agentKey: string,
    @Body() dto: ToggleTelegramDto,
    @Req() req: Request,
  ) {
    const fallbackBaseUrl = this.resolveRequestOrigin(req);
    return this.telegramService.toggleEnabled(
      agentKey,
      dto.enabled,
      fallbackBaseUrl,
    );
  }

  @Post('disconnect')
  @HttpCode(HttpStatus.OK)
  async disconnect(@Param('agentKey') agentKey: string, @Req() req: Request) {
    const fallbackBaseUrl = this.resolveRequestOrigin(req);
    return this.telegramService.disconnectBot(agentKey, fallbackBaseUrl);
  }

  private resolveRequestOrigin(req?: Request): string | undefined {
    if (
      process.env.TELEGRAM_WEBHOOK_BASE_URL ||
      process.env.APP_URL ||
      process.env.PUBLIC_URL
    ) {
      return undefined;
    }
    const host = req?.headers?.['x-forwarded-host'] || req?.headers?.host;
    if (!host || typeof host !== 'string') return undefined;
    const protoHeader = req?.headers?.['x-forwarded-proto'];
    const proto =
      typeof protoHeader === 'string' && protoHeader.trim()
        ? protoHeader.split(',')[0].trim()
        : req?.protocol || 'https';
    return `${proto}://${host}`;
  }
}
