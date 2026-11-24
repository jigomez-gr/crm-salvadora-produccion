import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PaymentsService } from './payments.service';
import { PaymentAccount } from '../common/entities/payment-account.entity';
import {
  Appointment,
  AppointmentStatus,
  PaymentStatus,
} from '../common/entities/appointment.entity';
import { Contact } from '../common/entities/contact.entity';

describe('PaymentsService', () => {
  let service: PaymentsService;
  let paymentAccountRepo: any;
  let appointmentsRepo: any;
  let contactsRepo: any;
  let eventEmitter: any;

  const mockAccount: Partial<PaymentAccount> = {
    id: 'test-account-id',
    publishableKey: 'pk_test_123',
    secretKey: 'sk_test_123',
    webhookSecret: 'whsec_123',
    currency: 'eur',
    enabled: true,
    enableBizum: true,
    enableCard: true,
  };

  beforeEach(async () => {
    paymentAccountRepo = {
      findOne: jest.fn().mockResolvedValue({ ...mockAccount }),
      create: jest.fn().mockImplementation((data) => ({ ...data, id: 'new-id' })),
      save: jest.fn().mockImplementation((account) => Promise.resolve(account)),
    };

    appointmentsRepo = {
      findOne: jest.fn(),
      save: jest.fn().mockImplementation((app) => Promise.resolve(app)),
    };

    contactsRepo = {
      findOne: jest.fn(),
      save: jest.fn().mockImplementation((c) => Promise.resolve(c)),
    };

    eventEmitter = {
      emit: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        {
          provide: getRepositoryToken(PaymentAccount),
          useValue: paymentAccountRepo,
        },
        {
          provide: getRepositoryToken(Appointment),
          useValue: appointmentsRepo,
        },
        {
          provide: getRepositoryToken(Contact),
          useValue: contactsRepo,
        },
        {
          provide: EventEmitter2,
          useValue: eventEmitter,
        },
      ],
    }).compile();

    service = module.get<PaymentsService>(PaymentsService);
  });

  it('should return sanitized config with secret masks', async () => {
    const config = await service.getSanitizedConfig('api.test.com');
    expect(config.hasPublishableKey).toBe(true);
    expect(config.publishableKey).toBe('pk_test_123');
    expect(config.hasSecretKey).toBe(true);
    expect(config.hasWebhookSecret).toBe(true);
    expect(config.enabled).toBe(true);
    expect(config.enableBizum).toBe(true);
    expect((config as any).secretKey).toBeUndefined();
    expect(config.webhookUrl).toBe('https://api.test.com/api/webhooks/stripe');
  });

  it('should update config without overwriting secrets if empty and emit audit events', async () => {
    await service.updateConfig(
      {
        publishableKey: 'pk_test_updated',
        secretKey: '',
        currency: 'EUR',
        enabled: false,
        enableBizum: false,
      },
      { id: 'admin-id', email: 'admin@salvadora.es' },
      '127.0.0.1',
    );

    expect(paymentAccountRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        publishableKey: 'pk_test_updated',
        secretKey: 'sk_test_123',
        currency: 'eur',
        enabled: false,
        enableBizum: false,
      }),
    );

    // Verify gateway disabled audit event
    expect(eventEmitter.emit).toHaveBeenCalledWith(
      'audit.record',
      expect.objectContaining({
        action: 'payment.gateway_disabled',
        summary: 'Deshabilitó la pasarela de pago (Stripe / Bizum)',
        actor: { id: 'admin-id', email: 'admin@salvadora.es' },
        ip: '127.0.0.1',
      }),
    );

    // Verify bizum disabled audit event
    expect(eventEmitter.emit).toHaveBeenCalledWith(
      'audit.record',
      expect.objectContaining({
        action: 'payment.bizum_disabled',
        summary: 'Deshabilitó Bizum en la pasarela de pago',
        actor: { id: 'admin-id', email: 'admin@salvadora.es' },
        ip: '127.0.0.1',
      }),
    );
  });

  it('should reject createCheckoutSession when payment gateway is disabled', async () => {
    paymentAccountRepo.findOne.mockResolvedValueOnce({
      ...mockAccount,
      enabled: false,
    });

    await expect(
      service.createCheckoutSession({
        amount: 50,
        title: 'Clase de Yoga',
      }),
    ).rejects.toThrow('deshabilitada');
  });
});
