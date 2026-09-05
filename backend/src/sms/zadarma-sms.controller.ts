import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Query,
  Param,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { ZadarmaSmsService, SendSmsResult } from './zadarma-sms.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ZadarmaSmsLog } from './zadarma-sms-log.entity';
import { VapiAccount } from '../common/entities/vapi-account.entity';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  SendSmsDto,
  UpdateZadarmaConfigDto,
  GetSmsLogsQueryDto,
} from './dto/zadarma-sms.dto';

@Controller('sms')
@UseGuards(JwtAuthGuard)
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
  async getLogs(@Query() query: GetSmsLogsQueryDto) {
    const limit = Math.min(Number(query.limit) || 50, 200);
    const qb = this.logRepo
      .createQueryBuilder('log')
      .leftJoinAndSelect('log.contact', 'contact')
      .leftJoinAndSelect('log.call', 'call')
      .leftJoinAndSelect('log.appointment', 'appointment')
      .orderBy('log.fecha', 'DESC')
      .take(limit);

    if (query.phone) {
      qb.where('log.phone ILIKE :phone OR log.numerodestino ILIKE :phone', {
        phone: `%${query.phone}%`,
      });
    }

    return qb.getMany();
  }

  @Get('contact/:contactId')
  async getContactLogs(@Param('contactId') contactId: string) {
    return this.logRepo.find({
      where: { contactId },
      order: { fecha: 'DESC' },
      take: 50,
    });
  }

  @Get('config')
  async getConfig() {
    const vapi = await this.vapiRepo.findOne({ where: {} });
    return {
      hasZadarmaApiKey: Boolean(vapi?.zadarmaApiKey || process.env.ZADARMA_API_KEY),
      maskedZadarmaApiKey: vapi?.zadarmaApiKey
        ? `***${vapi.zadarmaApiKey.slice(-4)}`
        : process.env.ZADARMA_API_KEY
          ? `***${process.env.ZADARMA_API_KEY.slice(-4)}`
          : null,
      hasZadarmaApiSecret: Boolean(vapi?.zadarmaApiSecret || process.env.ZADARMA_API_SECRET),
      zadarmaSenderId: vapi?.zadarmaSenderId || process.env.ZADARMA_SENDER_ID || 'Teamsale',
      zadarmaSmsEnabled: vapi?.zadarmaSmsEnabled ?? true,
      smsAutoConfirmation: vapi?.smsAutoConfirmation ?? true,
      smsConfirmationTemplate: vapi?.smsConfirmationTemplate || null,
      isConfigured: Boolean(
        (vapi?.zadarmaApiKey || process.env.ZADARMA_API_KEY) &&
          (vapi?.zadarmaApiSecret || process.env.ZADARMA_API_SECRET),
      ),
    };
  }

  @Patch('config')
  async updateConfig(@Body() body: UpdateZadarmaConfigDto) {
    let vapi = await this.vapiRepo.findOne({ where: {} });
    if (!vapi) {
      vapi = this.vapiRepo.create({});
    }

    if (body.zadarmaApiKey !== undefined) {
      vapi.zadarmaApiKey = body.zadarmaApiKey ? body.zadarmaApiKey.trim() : null;
    }
    if (body.zadarmaApiSecret !== undefined) {
      vapi.zadarmaApiSecret = body.zadarmaApiSecret ? body.zadarmaApiSecret.trim() : null;
    }
    if (body.zadarmaSenderId !== undefined) {
      vapi.zadarmaSenderId = body.zadarmaSenderId ? body.zadarmaSenderId.trim() : null;
    }
    if (body.zadarmaSmsEnabled !== undefined) {
      vapi.zadarmaSmsEnabled = body.zadarmaSmsEnabled;
    }
    if (body.smsAutoConfirmation !== undefined) {
      vapi.smsAutoConfirmation = body.smsAutoConfirmation;
    }
    if (body.smsConfirmationTemplate !== undefined) {
      vapi.smsConfirmationTemplate = body.smsConfirmationTemplate ? body.smsConfirmationTemplate.trim() : null;
    }

    await this.vapiRepo.save(vapi);

    return {
      success: true,
      message: 'Configuración de Zadarma SMS actualizada correctamente.',
    };
  }
}
