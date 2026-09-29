import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { HumanHandoffNotificationService } from './human-handoff-notification.service';
import { AppSettings } from '../common/entities/app-settings.entity';
import { EmailService } from '../email/email.service';
import { ZadarmaSmsService } from '../sms/zadarma-sms.service';
import { VapiService } from '../vapi/vapi.service';

describe('HumanHandoffNotificationService', () => {
  let service: HumanHandoffNotificationService;
  let emailService: jest.Mocked<EmailService>;
  let smsService: jest.Mocked<ZadarmaSmsService>;
  let vapiService: jest.Mocked<VapiService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HumanHandoffNotificationService,
        {
          provide: getRepositoryToken(AppSettings),
          useValue: {
            find: jest.fn().mockResolvedValue([
              {
                id: 'settings-1',
                humanNoticeEmailEnabled: true,
                humanNoticeEmail: 'admin@salvadora.com',
                humanNoticeSmsEnabled: true,
                humanNoticePhone: '+34600112233',
                humanNoticeVapiEnabled: true,
              },
            ]),
          },
        },
        {
          provide: EmailService,
          useValue: {
            sendNotification: jest.fn().mockResolvedValue({ ok: true }),
          },
        },
        {
          provide: ZadarmaSmsService,
          useValue: {
            sendSms: jest.fn().mockResolvedValue({ success: true }),
          },
        },
        {
          provide: VapiService,
          useValue: {
            startOutboundCall: jest.fn().mockResolvedValue({ ok: true, callId: 'vapi-123' }),
          },
        },
      ],
    }).compile();

    service = module.get<HumanHandoffNotificationService>(HumanHandoffNotificationService);
    emailService = module.get(EmailService);
    smsService = module.get(ZadarmaSmsService);
    vapiService = module.get(VapiService);
  });

  it('skips SMS and VAPI calls for non-urgent email handoffs', async () => {
    const result = await service.notifyHumanRequest({
      channel: 'email',
      customerName: 'Juan Perez',
      customerEmail: 'juan@example.com',
      customerPhone: '+34612345678',
      reason: 'Quiere hablar con Salvadora para preguntar sobre la clase de yoga',
      isUrgent: false,
    });

    expect(result.emailSent).toBe(true);
    expect(result.smsSent).toBe(false);
    expect(result.vapiSent).toBe(false);
    expect(smsService.sendSms).not.toHaveBeenCalled();
    expect(vapiService.startOutboundCall).not.toHaveBeenCalled();
    expect(emailService.sendNotification).toHaveBeenCalledTimes(1);
    expect(emailService.sendNotification.mock.calls[0][2]).toContain('Solicitud de atención humana');
    expect(emailService.sendNotification.mock.calls[0][2]).not.toContain('URGENTE');
  });

  it('triggers SMS and VAPI calls for URGENT email handoffs', async () => {
    const result = await service.notifyHumanRequest({
      channel: 'email',
      customerName: 'Laura Lopez',
      customerEmail: 'laura@example.com',
      customerPhone: '+34612345678',
      reason: 'Dolor agudo incapacitante tras accidente, requiere valoración urgente',
      isUrgent: true,
    });

    expect(result.emailSent).toBe(true);
    expect(result.smsSent).toBe(true);
    expect(result.vapiSent).toBe(true);
    expect(smsService.sendSms).toHaveBeenCalledTimes(1);
    expect(vapiService.startOutboundCall).toHaveBeenCalledTimes(1);
    expect(emailService.sendNotification.mock.calls[0][2]).toContain('URGENTE');
  });

  it('omits SMS and VAPI calls for non-urgent requests on any channel to prevent interruptions', async () => {
    const result = await service.notifyHumanRequest({
      channel: 'whatsapp',
      customerName: 'Pedro Sanchez',
      customerPhone: '+34699887766',
      reason: 'Solicita hablar por teléfono con el equipo',
      isUrgent: false,
    });

    expect(result.emailSent).toBe(true);
    expect(result.smsSent).toBe(false);
    expect(result.vapiSent).toBe(false);
    expect(smsService.sendSms).not.toHaveBeenCalled();
    expect(vapiService.startOutboundCall).not.toHaveBeenCalled();
  });
});
