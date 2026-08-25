import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import Stripe from 'stripe';
import { PaymentAccount } from '../common/entities/payment-account.entity';
import {
  Appointment,
  AppointmentStatus,
  PaymentStatus,
} from '../common/entities/appointment.entity';
import { Contact } from '../common/entities/contact.entity';
import { PipelineStage } from '../contacts/pipeline';
import {
  SanitizedPaymentConfig,
  UpdatePaymentConfigDto,
} from './dto/payment-config.dto';
import { CreatePaymentLinkDto } from './dto/create-payment-link.dto';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    @InjectRepository(PaymentAccount)
    private readonly paymentAccountRepo: Repository<PaymentAccount>,
    @InjectRepository(Appointment)
    private readonly appointmentsRepo: Repository<Appointment>,
    @InjectRepository(Contact)
    private readonly contactsRepo: Repository<Contact>,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Return the single PaymentAccount row, creating it with fallback values from
   * process.env if it doesn't exist yet.
   */
  async getOrCreateAccount(): Promise<PaymentAccount> {
    let account = await this.paymentAccountRepo.findOne({ where: {} });
    if (!account) {
      account = this.paymentAccountRepo.create({
        publishableKey: process.env.STRIPE_PUBLIC_KEY || null,
        secretKey: process.env.STRIPE_SECRET_KEY || null,
        webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || null,
        currency: 'eur',
        enableBizum: true,
        enableCard: true,
      });
      await this.paymentAccountRepo.save(account);
    }
    return account;
  }

  /**
   * Return sanitized config safe to send to the UI (secrets masked as booleans).
   */
  async getSanitizedConfig(hostHeader?: string): Promise<SanitizedPaymentConfig> {
    const account = await this.getOrCreateAccount();
    const effectiveSecret = account.secretKey || process.env.STRIPE_SECRET_KEY;
    const effectiveWebhook =
      account.webhookSecret || process.env.STRIPE_WEBHOOK_SECRET;
    const effectivePub =
      account.publishableKey || process.env.STRIPE_PUBLIC_KEY || null;

    const host = hostHeader || 'localhost:3001';
    const protocol = host.includes('localhost') ? 'http' : 'https';
    const webhookUrl = `${protocol}://${host}/api/webhooks/stripe`;

    return {
      hasPublishableKey: !!effectivePub,
      publishableKey: effectivePub,
      hasSecretKey: !!effectiveSecret,
      hasWebhookSecret: !!effectiveWebhook,
      currency: account.currency || 'eur',
      enableBizum: account.enableBizum ?? true,
      enableCard: account.enableCard ?? true,
      webhookUrl,
    };
  }

  /**
   * Update payment config settings. Secret keys are only updated if non-empty strings are passed.
   */
  async updateConfig(dto: UpdatePaymentConfigDto): Promise<SanitizedPaymentConfig> {
    const account = await this.getOrCreateAccount();

    if (dto.publishableKey !== undefined) {
      account.publishableKey = dto.publishableKey.trim() || null;
    }
    if (dto.secretKey !== undefined && dto.secretKey.trim() !== '') {
      account.secretKey = dto.secretKey.trim();
    }
    if (dto.webhookSecret !== undefined && dto.webhookSecret.trim() !== '') {
      account.webhookSecret = dto.webhookSecret.trim();
    }
    if (dto.currency !== undefined) {
      account.currency = dto.currency.toLowerCase().trim() || 'eur';
    }
    if (dto.enableBizum !== undefined) {
      account.enableBizum = dto.enableBizum;
    }
    if (dto.enableCard !== undefined) {
      account.enableCard = dto.enableCard;
    }

    await this.paymentAccountRepo.save(account);
    return this.getSanitizedConfig();
  }

  /**
   * Returns a configured Stripe instance using the DB secretKey or ENV fallback.
   */
  async getStripeClient(): Promise<{ stripe: Stripe; account: PaymentAccount }> {
    const account = await this.getOrCreateAccount();
    const secretKey = account.secretKey || process.env.STRIPE_SECRET_KEY;

    if (!secretKey) {
      throw new BadRequestException(
        'Stripe no está configurado. Añade la Clave Secreta de Stripe en Ajustes → Pasarela de Pago.',
      );
    }

    const stripe = new Stripe(secretKey, {
      apiVersion: '2025-02-24.acacia' as any,
    });

    return { stripe, account };
  }

  /**
   * Generate a Stripe Checkout Session URL for a reservation or service payment.
   */
  async createCheckoutSession(
    dto: CreatePaymentLinkDto,
    originUrl?: string,
  ): Promise<{ url: string; sessionId: string }> {
    const { stripe, account } = await this.getStripeClient();

    let contact: Contact | null = null;
    let appointment: Appointment | null = null;

    if (dto.appointmentId) {
      appointment = await this.appointmentsRepo.findOne({
        where: { id: dto.appointmentId },
        relations: ['contact'],
      });
      if (!appointment) {
        throw new NotFoundException('Cita no encontrada');
      }
      contact = appointment.contact;
    } else if (dto.contactId) {
      contact = await this.contactsRepo.findOne({
        where: { id: dto.contactId },
      });
    }

    const customerEmail =
      dto.customerEmail || contact?.email || undefined;
    const customerName =
      dto.customerName || contact?.name || undefined;

    // Payment methods
    const paymentMethodTypes: Stripe.Checkout.SessionCreateParams.PaymentMethodType[] = [];
    if (account.enableCard !== false) {
      paymentMethodTypes.push('card', 'link');
    }
    if (account.enableBizum !== false && account.currency.toLowerCase() === 'eur') {
      paymentMethodTypes.push('bizum' as any);
    }

    const fallbackSuccessUrl =
      originUrl || process.env.CORS_ORIGIN || 'http://localhost:3000';
    const amountInCents = Math.round(dto.amount * 100);

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      payment_method_types: paymentMethodTypes.length > 0 ? paymentMethodTypes : ['card'],
      mode: 'payment',
      customer_email: customerEmail,
      client_reference_id: dto.appointmentId || dto.contactId || undefined,
      metadata: {
        appointmentId: dto.appointmentId || '',
        contactId: contact?.id || dto.contactId || '',
        serviceTitle: dto.title,
      },
      line_items: [
        {
          price_data: {
            currency: account.currency || 'eur',
            product_data: {
              name: dto.title,
              description:
                dto.description ||
                (customerName ? `Reserva para ${customerName}` : 'Reserva de servicio'),
            },
            unit_amount: amountInCents,
          },
          quantity: 1,
        },
      ],
      success_url: `${fallbackSuccessUrl}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${fallbackSuccessUrl}/payment-cancelled`,
    };

    const session = await stripe.checkout.sessions.create(sessionParams);

    if (!session.url) {
      throw new BadRequestException('No se pudo generar la URL de pago de Stripe');
    }

    // If linked to an appointment, save session details
    if (appointment) {
      appointment.stripeSessionId = session.id;
      appointment.paymentUrl = session.url;
      appointment.paymentStatus = PaymentStatus.PENDING;
      appointment.price = dto.amount.toString();
      await this.appointmentsRepo.save(appointment);

      this.eventEmitter.emit('appointment.updated', {
        appointmentId: appointment.id,
        paymentStatus: appointment.paymentStatus,
        paymentUrl: appointment.paymentUrl,
      });
    }

    this.logger.log(
      `Stripe Checkout Session creada: ${session.id} por importe ${dto.amount} ${account.currency}`,
    );

    return {
      url: session.url,
      sessionId: session.id,
    };
  }

  /**
   * Process incoming Stripe Webhook events.
   */
  async handleWebhook(rawBody: Buffer | string, signature: string): Promise<{ received: boolean }> {
    const account = await this.getOrCreateAccount();
    const webhookSecret =
      account.webhookSecret || process.env.STRIPE_WEBHOOK_SECRET;

    if (!webhookSecret) {
      this.logger.warn('Webhook de Stripe recibido pero STRIPE_WEBHOOK_SECRET no está configurado');
      throw new BadRequestException('STRIPE_WEBHOOK_SECRET no configurado');
    }

    const { stripe } = await this.getStripeClient();

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } catch (err: any) {
      this.logger.error(`Firma de Stripe Webhook inválida: ${err.message}`);
      throw new BadRequestException(`Webhook signature verification failed: ${err.message}`);
    }

    this.logger.log(`Stripe Webhook recibido: ${event.type} (ID: ${event.id})`);

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        await this.handleCheckoutSessionCompleted(session);
        break;
      }
      case 'payment_intent.succeeded': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        this.logger.log(`PaymentIntent exitoso: ${paymentIntent.id}`);
        break;
      }
      case 'payment_intent.payment_failed': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        this.logger.warn(`Pago fallido en PaymentIntent: ${paymentIntent.id}`);
        break;
      }
      default:
        this.logger.debug(`Evento de Stripe no procesado: ${event.type}`);
    }

    return { received: true };
  }

  private async handleCheckoutSessionCompleted(session: Stripe.Checkout.Session): Promise<void> {
    const appointmentId = session.metadata?.appointmentId || session.client_reference_id;
    const contactId = session.metadata?.contactId;

    if (appointmentId) {
      const appointment = await this.appointmentsRepo.findOne({
        where: { id: appointmentId },
        relations: ['contact'],
      });

      if (appointment) {
        appointment.paymentStatus = PaymentStatus.PAID;
        appointment.paidAt = new Date();
        if (typeof session.payment_intent === 'string') {
          appointment.stripePaymentIntentId = session.payment_intent;
        }

        // If appointment was pending approval/payment, advance to scheduled
        if (appointment.status === AppointmentStatus.PENDING_APPROVAL) {
          appointment.status = AppointmentStatus.SCHEDULED;
          appointment.acceptedAt = new Date();
          appointment.acceptedBy = 'stripe_payment';
        }

        await this.appointmentsRepo.save(appointment);

        // Advance contact pipeline stage if needed
        if (appointment.contact && appointment.contact.pipelineStage === PipelineStage.NEW) {
          appointment.contact.pipelineStage = PipelineStage.BOOKED;
          await this.contactsRepo.save(appointment.contact);
          this.eventEmitter.emit('contact.updated', appointment.contact);
        }

        this.eventEmitter.emit('appointment.updated', appointment);
        this.eventEmitter.emit('payment.received', {
          appointmentId: appointment.id,
          contactId: appointment.contactId,
          amountTotal: session.amount_total ? session.amount_total / 100 : appointment.price,
          currency: session.currency,
          sessionId: session.id,
        });

        this.logger.log(
          `Cita ${appointment.id} marcada como PAGADA (Stripe Session: ${session.id})`,
        );
      }
    } else if (contactId) {
      const contact = await this.contactsRepo.findOne({ where: { id: contactId } });
      if (contact) {
        this.eventEmitter.emit('payment.received', {
          contactId: contact.id,
          amountTotal: session.amount_total ? session.amount_total / 100 : 0,
          currency: session.currency,
          sessionId: session.id,
        });
      }
    }
  }
}
