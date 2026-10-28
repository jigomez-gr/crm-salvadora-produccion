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
  RequestBookingVerificationDto,
  ConfirmBookingVerificationDto,
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
   * Request OTP code to unsubscribe / cancel services (baja por restricción técnica)
   * based on email and mobile phone.
   */
  @Post('baja-restriccion-tecnica/request')
  async requestBajaRestriccionTecnica(
    @Body() dto: { email: string; phone: string },
    @Req() req: Request,
  ) {
    const ip = req.ip || (req.headers['x-forwarded-for'] as string) || undefined;
    return this.verificationService.requestBajaRestriccionTecnica({
      email: dto.email,
      phone: dto.phone,
      ipAddress: ip,
    });
  }

  /**
   * Confirm OTP code to apply the baja por restricción técnica.
   */
  @Post('baja-restriccion-tecnica/confirm')
  async confirmBajaRestriccionTecnica(
    @Body() dto: { email: string; phone: string; code: string },
    @Req() req: Request,
  ) {
    const ip = req.ip || (req.headers['x-forwarded-for'] as string) || undefined;
    return this.verificationService.confirmBajaRestriccionTecnica({
      email: dto.email,
      phone: dto.phone,
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

  /**
   * Request OTP verification for web booking.
   * If contact is already valid and recognized in CRM, returns requiresOtp=false.
   * Otherwise ("cuando no acierte con un contacto valido"):
   * Sends 6-digit OTP code to WhatsApp (if contactadowassap === 'S') or SMS,
   * plus to Email (if provided).
   */
  @Post('booking-verification/request')
  async requestBookingVerification(
    @Body() dto: RequestBookingVerificationDto,
    @Req() req: Request,
  ) {
    const ip = req.ip || (req.headers['x-forwarded-for'] as string) || undefined;
    return this.verificationService.requestBookingVerification({
      name: dto.name,
      phone: dto.phone,
      email: dto.email,
      ipAddress: ip,
    });
  }

  /**
   * Confirm OTP for web booking.
   * If correct: registers / creates the contact in CRM at that moment.
   * If incorrect: blocks the reservation ("no dejarle seguir").
   */
  @Post('booking-verification/confirm')
  async confirmBookingVerification(
    @Body() dto: ConfirmBookingVerificationDto,
    @Req() req: Request,
  ) {
    const ip = req.ip || (req.headers['x-forwarded-for'] as string) || undefined;
    return this.verificationService.confirmBookingVerification({
      name: dto.name,
      phone: dto.phone,
      email: dto.email,
      code: dto.code,
      ipAddress: ip,
    });
  }
}
