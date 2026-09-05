import { Controller, Post, Get, Patch, Body, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { ZadarmaSmsService, SendSmsResult } from './zadarma-sms.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ZadarmaSmsLog } from './zadarma-sms-log.entity';
import { VapiAccount } from '../../common/entities/vapi-account.entity';

export class SendSmsDto {
  number: string;
  message: string;
  sender?: string;
  contactId?: string;
  callId?: string;
  appointmentId?: string;
}

export class UpdateZadarmaConfigDto {
  zadarmaApiKey?: string;
  zadarmaApiSecret?: string;
  zadarmaSenderId?: string;
  zadarmaSmsEnabled?: boolean;
}

@Controller('api/sms')
export class ZadarmaSmsController {
  constructor(
    private readonly smsService: ZadarmaSmsService,
    @InjectRepository(ZadarmaSmsLog)
    private readonly logRepo: Repository<ZadarmaSmsLog>,
    @InjectRepository(VapiAccount)
    private readonly vapiRepo: Repository<VapiAccount>,
  ) {}

  @Post('send')
  @HttpCode(HttpStatus.OK)
  async send(@Body() body: SendSmsDto): Promise<SendSmsResult> {
    return this.smsService.sendSms(body);
  }

  @Get('logs')
  async getLogs(@Query('limit') limit = 50) {
    return this.logRepo.find({
      order: { fecha: 'DESC' },
      take: Math.min(Number(limit) || 50, 200),
    });
  }

  @Get('config')
  async getConfig() {
    const [vapi] = await this.vapiRepo.find({ take: 1 });
    return {
      zadarmaApiKey: (vapi as any)?.zadarmaApiKey ? '***' + (vapi as any).zadarmaApiKey.slice(-4) : null,
      zadarmaSenderId: (vapi as any)?.zadarmaSenderId || null,
      zadarmaSmsEnabled: (vapi as any)?.zadarmaSmsEnabled ?? true,
      isConfigured: Boolean((vapi as any)?.zadarmaApiKey && (vapi as any)?.zadarmaApiSecret),
    };
  }

  @Patch('config')
  async updateConfig(@Body() body: UpdateZadarmaConfigDto) {
    let [vapi] = await this.vapiRepo.find({ take: 1 });
    if (!vapi) {
      vapi = this.vapiRepo.create({});
    }

    if (body.zadarmaApiKey !== undefined) (vapi as any).zadarmaApiKey = body.zadarmaApiKey.trim();
    if (body.zadarmaApiSecret !== undefined) (vapi as any).zadarmaApiSecret = body.zadarmaApiSecret.trim();
    if (body.zadarmaSenderId !== undefined) (vapi as any).zadarmaSenderId = body.zadarmaSenderId.trim() || null;
    if (body.zadarmaSmsEnabled !== undefined) (vapi as any).zadarmaSmsEnabled = body.zadarmaSmsEnabled;

    await this.vapiRepo.save(vapi);

    return {
      success: true,
      message: 'Zadarma SMS configuration updated successfully',
    };
  }
}
