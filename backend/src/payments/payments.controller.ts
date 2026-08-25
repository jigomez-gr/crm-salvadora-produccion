import {
  Body,
  Controller,
  Get,
  Headers,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { PaymentsService } from './payments.service';
import {
  SanitizedPaymentConfig,
  UpdatePaymentConfigDto,
} from './dto/payment-config.dto';
import { CreatePaymentLinkDto } from './dto/create-payment-link.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../common/entities/user.entity';

@Controller('payments')
@UseGuards(JwtAuthGuard)
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  /**
   * Get payment settings / Stripe config status (ADMIN only).
   */
  @Get('config')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  async getConfig(
    @Headers('host') hostHeader?: string,
  ): Promise<SanitizedPaymentConfig> {
    return this.paymentsService.getSanitizedConfig(hostHeader);
  }

  /**
   * Update payment settings / Stripe API keys (ADMIN only).
   */
  @Put('config')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  async updateConfig(
    @Body() dto: UpdatePaymentConfigDto,
  ): Promise<SanitizedPaymentConfig> {
    return this.paymentsService.updateConfig(dto);
  }

  /**
   * Create a Stripe Checkout payment link for an appointment or contact (Admin & Employee).
   */
  @Post('create-link')
  async createPaymentLink(
    @Body() dto: CreatePaymentLinkDto,
    @Headers('origin') originHeader?: string,
  ): Promise<{ url: string; sessionId: string }> {
    return this.paymentsService.createCheckoutSession(dto, originHeader);
  }
}
