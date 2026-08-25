import {
  Controller,
  Get,
  Patch,
  Post,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { VapiService } from './vapi.service';
import { VapiAccountConfigDto } from './vapi.types';

@Controller('vapi')
@UseGuards(JwtAuthGuard)
export class VapiController {
  constructor(private readonly vapiService: VapiService) {}

  @Get('config')
  async getConfig() {
    return this.vapiService.getConfigSanitized();
  }

  @Patch('config')
  async updateConfig(@Body() dto: VapiAccountConfigDto) {
    return this.vapiService.updateConfig(dto);
  }

  @Get('catalog')
  getCatalog() {
    return this.vapiService.getCatalog();
  }

  @Get('preview-prompt')
  async previewPrompt() {
    return this.vapiService.previewPrompt();
  }

  @Post('sync-tools')
  @HttpCode(HttpStatus.OK)
  async syncTools() {
    return this.vapiService.syncTools();
  }

  @Post('publish')
  @HttpCode(HttpStatus.OK)
  async publishAssistant() {
    return this.vapiService.publishAssistant();
  }

  @Post('test-call')
  @HttpCode(HttpStatus.OK)
  async testCall(@Body() body: { phone: string; contactId?: string }) {
    return this.vapiService.startOutboundCall(body.phone, body.contactId);
  }
}
