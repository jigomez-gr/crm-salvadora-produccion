import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CallsService, CallsQueryDto } from './calls.service';
import { VapiService } from '../vapi/vapi.service';

@Controller('calls')
@UseGuards(JwtAuthGuard)
export class CallsController {
  constructor(
    private readonly callsService: CallsService,
    private readonly vapiService: VapiService,
  ) {}

  @Get()
  async findAll(@Query() query: CallsQueryDto) {
    return this.callsService.findAll(query);
  }

  @Get('stats')
  async getStats() {
    return this.callsService.getStats();
  }

  @Post('sync')
  @HttpCode(HttpStatus.OK)
  async syncRecent() {
    return this.vapiService.syncRecentCalls();
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const call = await this.callsService.findOne(id);
    if (call.vapiCallId && (!call.transcript || call.status === 'in-progress')) {
      return this.vapiService.syncCallFromVapi(call.id).catch(() => call);
    }
    return call;
  }

  @Post(':id/sync')
  @HttpCode(HttpStatus.OK)
  async syncOne(@Param('id') id: string) {
    return this.vapiService.syncCallFromVapi(id);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: { notes?: string; needsReview?: boolean },
  ) {
    return this.callsService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string) {
    return this.callsService.remove(id);
  }

  @Post('outbound')
  @HttpCode(HttpStatus.OK)
  async startOutbound(@Body() body: { phone: string; contactId?: string }) {
    return this.vapiService.startOutboundCall(body.phone, body.contactId);
  }
}
