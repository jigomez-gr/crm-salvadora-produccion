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

  it('notifies multiple email addresses and multiple phone numbers when configured with semicolon', async () => {
    // Reconfigure settings mock with multiple emails and phones
    const settingsRepo = (service as any).settingsRepo;
    settingsRepo.find.mockResolvedValueOnce([
      {
        id: 'settings-1',
        humanNoticeEmailEnabled: true,
        humanNoticeEmail: 'primero@salvadora.com; segundo@salvadora.com ; tercero@salvadora.com',
        humanNoticeSmsEnabled: true,
        humanNoticePhone: '+34600112233; +34600445566',
        humanNoticeVapiEnabled: true,
      },
    ]);

    const result = await service.notifyHumanRequest({
      channel: 'whatsapp',
      customerName: 'Maria Garcia',
      customerPhone: '+34611223344',
      reason: 'Asunto urgente de salud en clase de yoga',
      isUrgent: true,
    });

    expect(result.emailSent).toBe(true);
    expect(result.smsSent).toBe(true);
    expect(result.vapiSent).toBe(true);

    // 3 separate emails sent
    expect(emailService.sendNotification).toHaveBeenCalledTimes(3);
    expect(emailService.sendNotification).toHaveBeenNthCalledWith(
      1,
      'primero@salvadora.com',
      'Equipo Salvadora Conesa',
      expect.stringContaining('URGENTE'),
      expect.any(String),
    );
    expect(emailService.sendNotification).toHaveBeenNthCalledWith(
      2,
      'segundo@salvadora.com',
      'Equipo Salvadora Conesa',
      expect.stringContaining('URGENTE'),
      expect.any(String),
    );
    expect(emailService.sendNotification).toHaveBeenNthCalledWith(
      3,
      'tercero@salvadora.com',
      'Equipo Salvadora Conesa',
      expect.stringContaining('URGENTE'),
      expect.any(String),
    );

    // 2 separate SMS sent
    expect(smsService.sendSms).toHaveBeenCalledTimes(2);
    expect(smsService.sendSms).toHaveBeenNthCalledWith(1, {
      number: '+34600112233',
      message: expect.stringContaining('AVISO URGENTE'),
    });
    expect(smsService.sendSms).toHaveBeenNthCalledWith(2, {
      number: '+34600445566',
      message: expect.stringContaining('AVISO URGENTE'),
    });

    // 2 separate VAPI calls initiated
    expect(vapiService.startOutboundCall).toHaveBeenCalledTimes(2);
    expect(vapiService.startOutboundCall).toHaveBeenNthCalledWith(
      1,
      '+34600112233',
      undefined,
      expect.stringContaining('URGENTE'),
    );
    expect(vapiService.startOutboundCall).toHaveBeenNthCalledWith(
      2,
      '+34600445566',
      undefined,
      expect.stringContaining('URGENTE'),
    );

    // Details check
    expect(result.results?.email.sentCount).toBe(3);
    expect(result.results?.sms.sentCount).toBe(2);
    expect(result.results?.vapi.sentCount).toBe(2);
  });
});
