import { Appointment, AppointmentStatus } from '../common/entities/appointment.entity';
import { AppointmentsService } from './appointments.service';

describe('Appointments Multi-Channel Notifications (Service Level)', () => {
  let service: AppointmentsService;
  let emailServiceMock: any;
  let ycloudClientMock: any;
  let zadarmaSmsMock: any;
  let servicesRepoMock: any;
  let contactsRepoMock: any;
  let appointmentsRepoMock: any;
  let agentConfigServiceMock: any;

  beforeEach(() => {
    emailServiceMock = {
      sendNotification: jest.fn().mockResolvedValue({ ok: true }),
    };

    ycloudClientMock = {
      sendTextMessage: jest.fn().mockResolvedValue({ id: 'msg-123' }),
    };

    zadarmaSmsMock = {
      sendSms: jest.fn().mockResolvedValue({ success: true }),
    };

    agentConfigServiceMock = {
      findByKey: jest.fn().mockResolvedValue({
        whatsappPhoneNumber: '+34695172625',
        ycloudApiKey: 'test-key',
      }),
    };

    const contactData = {
      id: 'contact-test-1',
      name: 'Maria Garcia',
      phone: '+34612345678',
      email: 'maria@example.com',
    };

    contactsRepoMock = {
      findOne: jest.fn().mockResolvedValue(contactData),
    };

    appointmentsRepoMock = {
      manager: {
        getRepository: jest.fn().mockReturnValue({
          findOne: jest.fn().mockResolvedValue({ zadarmaSmsEnabled: true, zadarmaSenderId: 'YOGA' }),
        }),
      },
    };

    servicesRepoMock = {
      findOne: jest.fn(),
    };

    const conversationsRepoMock = {
      findOne: jest.fn().mockResolvedValue(null),
    };

    const messagesServiceMock = {
      saveMessage: jest.fn().mockResolvedValue({ id: 'msg-saved' }),
    };

    const eventEmitterMock = {
      emit: jest.fn(),
    };

    service = new AppointmentsService(
      appointmentsRepoMock as any,
      servicesRepoMock as any,
      contactsRepoMock as any,
      conversationsRepoMock as any,
      null as any, // calcomService
      eventEmitterMock as any,
      null as any, // analizaIaService
      emailServiceMock as any,
      ycloudClientMock as any,
      agentConfigServiceMock as any,
      messagesServiceMock as any,
      zadarmaSmsMock,
    );
  });

  const baseAppt: any = {
    id: 'appt-101',
    service: 'Hatha Yoga Terapéutico',
    serviceId: 'svc-1',
    contactId: 'contact-test-1',
    startsAt: new Date('2026-09-16T18:15:00.000Z'),
    endsAt: new Date('2026-09-16T19:45:00.000Z'),
    status: AppointmentStatus.SCHEDULED,
  };

  it('dispatches both Email and WhatsApp when both channels are enabled (default)', async () => {
    servicesRepoMock.findOne.mockResolvedValue({
      id: 'svc-1',
      name: 'Hatha Yoga Terapéutico',
      notifyByEmail: true,
      notifyByWhatsapp: true,
      notifyBySms: false,
    });

    await (service as any).notifyStudentDecision(baseAppt, 'accepted', 'Centro de Yoga');

    expect(emailServiceMock.sendNotification).toHaveBeenCalledTimes(1);
    expect(ycloudClientMock.sendTextMessage).toHaveBeenCalledTimes(1);
    expect(zadarmaSmsMock.sendSms).not.toHaveBeenCalled();
  });

  it('skips Email and sends WhatsApp when notifyByEmail is false', async () => {
    servicesRepoMock.findOne.mockResolvedValue({
      id: 'svc-1',
      name: 'Hatha Yoga Terapéutico',
      notifyByEmail: false,
      notifyByWhatsapp: true,
      notifyBySms: false,
    });

    await (service as any).notifyStudentDecision(baseAppt, 'accepted', 'Centro de Yoga');

    expect(emailServiceMock.sendNotification).not.toHaveBeenCalled();
    expect(ycloudClientMock.sendTextMessage).toHaveBeenCalledTimes(1);
    expect(zadarmaSmsMock.sendSms).not.toHaveBeenCalled();
  });

  it('skips WhatsApp and sends Email when notifyByWhatsapp is false', async () => {
    servicesRepoMock.findOne.mockResolvedValue({
      id: 'svc-1',
      name: 'Hatha Yoga Terapéutico',
      notifyByEmail: true,
      notifyByWhatsapp: false,
      notifyBySms: false,
    });

    await (service as any).notifyStudentDecision(baseAppt, 'accepted', 'Centro de Yoga');

    expect(emailServiceMock.sendNotification).toHaveBeenCalledTimes(1);
    expect(ycloudClientMock.sendTextMessage).not.toHaveBeenCalled();
    expect(zadarmaSmsMock.sendSms).not.toHaveBeenCalled();
  });

  it('dispatches SMS when notifyBySms is true', async () => {
    servicesRepoMock.findOne.mockResolvedValue({
      id: 'svc-1',
      name: 'Hatha Yoga Terapéutico',
      notifyByEmail: true,
      notifyByWhatsapp: true,
      notifyBySms: true,
    });

    await (service as any).notifyStudentDecision(baseAppt, 'accepted', 'Centro de Yoga');

    expect(emailServiceMock.sendNotification).toHaveBeenCalledTimes(1);
    expect(ycloudClientMock.sendTextMessage).toHaveBeenCalledTimes(1);
    expect(zadarmaSmsMock.sendSms).toHaveBeenCalledTimes(1);
    expect(zadarmaSmsMock.sendSms).toHaveBeenCalledWith(
      expect.objectContaining({
        number: '+34612345678',
        sender: 'YOGA',
        appointmentId: 'appt-101',
      }),
    );
  });

  it('dispatches through enabled channels for pending_approval, cancelled, and reschedule_requested', async () => {
    servicesRepoMock.findOne.mockResolvedValue({
      id: 'svc-1',
      name: 'Terapia Gestalt',
      notifyByEmail: true,
      notifyByWhatsapp: true,
      notifyBySms: true,
    });

    // pending_approval
    await (service as any).notifyStudentDecision(baseAppt, 'pending_approval', 'Jose Ignacio Gomez Raya');
    expect(emailServiceMock.sendNotification).toHaveBeenCalledTimes(1);
    expect(ycloudClientMock.sendTextMessage).toHaveBeenCalledTimes(1);
    expect(zadarmaSmsMock.sendSms).toHaveBeenCalledTimes(1);

    // cancelled
    jest.clearAllMocks();
    await (service as any).notifyStudentDecision(baseAppt, 'cancelled', 'Jose Ignacio Gomez Raya');
    expect(emailServiceMock.sendNotification).toHaveBeenCalledTimes(1);
    expect(ycloudClientMock.sendTextMessage).toHaveBeenCalledTimes(1);
    expect(zadarmaSmsMock.sendSms).toHaveBeenCalledTimes(1);

    // reschedule_requested
    jest.clearAllMocks();
    await (service as any).notifyStudentDecision(baseAppt, 'reschedule_requested', 'Jose Ignacio Gomez Raya', 'Horario ocupado');
    expect(emailServiceMock.sendNotification).toHaveBeenCalledTimes(1);
    expect(ycloudClientMock.sendTextMessage).toHaveBeenCalledTimes(1);
    expect(zadarmaSmsMock.sendSms).toHaveBeenCalledTimes(1);
  });

  it('accept() triggers both Email and Zadarma SMS to student even if notifyBySms is false on the service', async () => {
    servicesRepoMock.findOne.mockResolvedValue({
      id: 'svc-gestalt',
      name: 'Terapia Gestalt',
      notifyByEmail: true,
      notifyByWhatsapp: true,
      notifyBySms: false, // Default false in DB
      manager: { name: 'Jose Ignacio Gomez Raya' },
    });

    const pendingAppt: any = {
      ...baseAppt,
      id: 'appt-gestalt-1',
      service: 'Terapia Gestalt (Sesión Individual)',
      status: AppointmentStatus.PENDING_APPROVAL,
      acceptedAt: null,
      contact: {
        id: 'contact-test-1',
        name: 'Jose Ignacio Gomez Raya',
        phone: '+34649453996',
        email: 'jigomez@hotmail.com',
      },
    };

    appointmentsRepoMock.findOne = jest.fn().mockResolvedValue(pendingAppt);
    appointmentsRepoMock.save = jest.fn().mockImplementation((a) => Promise.resolve({ ...a }));

    await service.accept('appt-gestalt-1', 'Jose Ignacio Gomez Raya');

    expect(emailServiceMock.sendNotification).toHaveBeenCalledTimes(1);
    expect(zadarmaSmsMock.sendSms).toHaveBeenCalledTimes(1);
    expect(zadarmaSmsMock.sendSms).toHaveBeenCalledWith(
      expect.objectContaining({
        number: '+34649453996',
        message: expect.stringContaining('ha sido confirmada'),
      }),
    );
  });

  it('auto-recovers email for contact when appointment contact email is missing but profile with same phone exists', async () => {
    servicesRepoMock.findOne.mockResolvedValue({
      id: 'svc-gestalt',
      name: 'Terapia Gestalt',
      notifyByEmail: true,
      notifyByWhatsapp: true,
      notifyBySms: true,
    });

    const contactWithoutEmail: any = {
      id: 'contact-vapi-dup',
      name: 'Cliente Telefónico',
      phone: '+34649453996',
      email: null,
    };

    contactsRepoMock.findOne = jest.fn().mockResolvedValue(contactWithoutEmail);
    contactsRepoMock.save = jest.fn().mockResolvedValue(contactWithoutEmail);
    contactsRepoMock.createQueryBuilder = jest.fn().mockReturnValue({
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue({
        id: 'contact-original',
        name: 'Jose Ignacio Gomez',
        phone: '649453996',
        email: 'jigomez@hotmail.com',
      }),
    });

    const appt: any = {
      ...baseAppt,
      contactId: 'contact-vapi-dup',
      contact: contactWithoutEmail,
    };

    await (service as any).notifyStudentDecision(appt, 'accepted', 'Jose Ignacio Gomez Raya');

    // Email should have been recovered and sent!
    expect(emailServiceMock.sendNotification).toHaveBeenCalledTimes(1);
    expect(emailServiceMock.sendNotification).toHaveBeenCalledWith(
      'jigomez@hotmail.com',
      expect.any(String),
      expect.any(String),
      expect.any(String),
      expect.any(String),
      undefined,
      'contact-vapi-dup',
    );
    expect(zadarmaSmsMock.sendSms).toHaveBeenCalledTimes(1);
  });
});
