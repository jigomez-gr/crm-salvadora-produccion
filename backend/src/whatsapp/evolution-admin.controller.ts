import {
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
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../common/entities/user.entity';
import { AgentsConfigService } from '../agents/agents-config.service';
import { EvolutionProvider } from './providers/evolution.provider';

@Controller('agents/:agentKey/whatsapp/evolution')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class EvolutionAdminController {
  constructor(
    private readonly agentsConfigService: AgentsConfigService,
    private readonly evolutionProvider: EvolutionProvider,
  ) {}

  @Get('status')
  async getStatus(@Param('agentKey') agentKey: string) {
    const config = await this.agentsConfigService.findByKey(agentKey);
    return this.evolutionProvider.getConnectionStatus(config);
  }

  @Post('connect')
  @HttpCode(HttpStatus.OK)
  async connect(
    @Param('agentKey') agentKey: string,
    @Req() req: Request,
  ) {
    const config = await this.agentsConfigService.findByKey(agentKey);
    const fallbackBaseUrl = this.resolveRequestOrigin(req);
    return this.evolutionProvider.connectInstance(config, fallbackBaseUrl);
  }

  @Get('qr')
  async getQr(@Param('agentKey') agentKey: string) {
    const config = await this.agentsConfigService.findByKey(agentKey);
    return this.evolutionProvider.getQr(config);
  }

  @Post('configure-webhook')
  @HttpCode(HttpStatus.OK)
  async configureWebhook(
    @Param('agentKey') agentKey: string,
    @Req() req: Request,
  ) {
    const config = await this.agentsConfigService.findByKey(agentKey);
    const fallbackBaseUrl = this.resolveRequestOrigin(req);
    return this.evolutionProvider.configureWebhook(config, fallbackBaseUrl);
  }

  @Post('restart')
  @HttpCode(HttpStatus.OK)
  async restart(@Param('agentKey') agentKey: string) {
    const config = await this.agentsConfigService.findByKey(agentKey);
    return this.evolutionProvider.restartInstance(config);
  }

  @Post('disconnect')
  @HttpCode(HttpStatus.OK)
  async disconnect(@Param('agentKey') agentKey: string) {
    const config = await this.agentsConfigService.findByKey(agentKey);
    return this.evolutionProvider.logoutInstance(config);
  }

  private resolveRequestOrigin(req?: Request): string | undefined {
    if (
      process.env.EVOLUTION_WEBHOOK_BASE_URL ||
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
        : req?.protocol || 'http';
    return `${proto}://${host}`;
  }
}
