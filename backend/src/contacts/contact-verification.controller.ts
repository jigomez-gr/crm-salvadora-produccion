import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ContactVerificationService } from './contact-verification.service';
import {
  RequestVerificationDto,
  ConfirmVerificationDto,
  CheckContradictionDto,
} from './dto/contact-verification.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Request } from 'express';

@Controller('contacts')
export class ContactVerificationController {
  constructor(
    private readonly verificationService: ContactVerificationService,
  ) {}

  /**
   * Request OTP verification code (sent via email, SMS, or WhatsApp).
   * Valid for maximum 7 minutes.
   */
  @Post('verification/request')
  async requestVerification(
    @Body() dto: RequestVerificationDto,
    @Req() req: Request,
  ) {
    const ip = req.ip || (req.headers['x-forwarded-for'] as string) || undefined;
    return this.verificationService.sendOtp({
      contactId: dto.contactId,
      destination: dto.destination,
      channel: dto.channel,
      changeType: dto.changeType,
      oldValues: undefined,
      newValues: {
        name: dto.name,
        phone: dto.phone,
        email: dto.email,
      },
      source: dto.source || 'web',
      ipAddress: ip,
    });
  }

  /**
   * Confirm OTP code. If correct within 7 minutes, verifies possession
   * and clears emailerroneo or updates identity data.
   */
  @Post('verification/confirm')
  async confirmVerification(
    @Body() dto: ConfirmVerificationDto,
    @Req() req: Request,
  ) {
    const ip = req.ip || (req.headers['x-forwarded-for'] as string) || undefined;
    return this.verificationService.verifyOtp({
      destination: dto.destination,
      code: dto.code,
      ipAddress: ip,
    });
  }

  /**
   * Check if provided phone/email/name contradict existing contact records.
   */
  @Post('verification/check-contradiction')
  async checkContradiction(@Body() dto: CheckContradictionDto) {
    return this.verificationService.detectContradiction(dto);
  }

  /**
   * Get audit trace of identity/verification history for a contact (CRM operators).
   */
  @UseGuards(JwtAuthGuard)
  @Get(':id/identity-history')
  async getIdentityHistory(@Param('id') id: string) {
    return this.verificationService.getIdentityHistory(id);
  }
}
