import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  RawBodyRequest,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { SkipThrottle } from '@nestjs/throttler';
import { PaymentsService } from './payments.service';

@Controller('webhooks/stripe')
@SkipThrottle()
export class StripeWebhookController {
  private readonly logger = new Logger(StripeWebhookController.name);

  constructor(private readonly paymentsService: PaymentsService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async handleWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature?: string,
  ): Promise<{ received: boolean }> {
    if (!signature) {
      this.logger.warn('Petición de Stripe Webhook rechazada: falta la cabecera stripe-signature');
      throw new BadRequestException('Cabecera stripe-signature requerida');
    }

    if (!req.rawBody) {
      this.logger.error('No se pudo acceder a rawBody en Stripe Webhook');
      throw new BadRequestException('Raw body no disponible para verificar la firma');
    }

    return this.paymentsService.handleWebhook(req.rawBody, signature);
  }
}
