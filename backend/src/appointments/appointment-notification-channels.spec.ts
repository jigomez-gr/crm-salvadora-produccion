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

    const settingsRepoMock = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
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
      settingsRepoMock as any,
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

  it('includes meeting URL in email, WhatsApp and SMS when confirming an online appointment', async () => {
    servicesRepoMock.findOne.mockResolvedValue({
      id: 'svc-gestalt',
      name: 'Terapia Gestalt (Sesión Individual)',
      notifyByEmail: true,
      notifyByWhatsapp: true,
      notifyBySms: true,
    });

    const onlineAppt: any = {
      id: 'appt-gestalt-online',
      service: 'Terapia Gestalt (Sesión Individual)',
      serviceId: 'svc-gestalt',
      contactId: 'contact-test-1',
      startsAt: new Date('2026-09-25T10:00:00.000Z'),
      endsAt: new Date('2026-09-25T11:00:00.000Z'),
      status: AppointmentStatus.SCHEDULED,
      modality: 'virtual',
      calMeetingUrl: 'https://meet.jit.si/salvadora-terapia-gestalt-test1234',
      notes: 'Sesión online solicitada',
    };

    await (service as any).notifyStudentDecision(onlineAppt, 'accepted', 'Jose Ignacio Gomez Raya');

    expect(emailServiceMock.sendNotification).toHaveBeenCalledTimes(1);
    const [, , , emailHtml, chatText] = emailServiceMock.sendNotification.mock.calls[0];
    expect(emailHtml).toContain('https://meet.jit.si/salvadora-terapia-gestalt-test1234');
    expect(emailHtml).toContain('🎥 Acceder a la Videollamada');
    expect(chatText).toContain('https://meet.jit.si/salvadora-terapia-gestalt-test1234');

    expect(ycloudClientMock.sendTextMessage).toHaveBeenCalledTimes(1);
    const [, , whatsappBody] = ycloudClientMock.sendTextMessage.mock.calls[0];
    expect(whatsappBody).toContain('https://meet.jit.si/salvadora-terapia-gestalt-test1234');

    expect(zadarmaSmsMock.sendSms).toHaveBeenCalledTimes(1);
    const smsPayload = zadarmaSmsMock.sendSms.mock.calls[0][0];
    expect(smsPayload.message).toContain('https://meet.jit.si/salvadora-terapia-gestalt-test1234');
  });

  it('does NOT include meeting URL in email and SMS for pending_approval virtual appointment, but notifies therapist with details', async () => {
    servicesRepoMock.findOne.mockResolvedValue({
      id: 'svc-gestalt',
      name: 'Terapia Gestalt (Sesión Individual)',
      notifyByEmail: true,
      notifyByWhatsapp: true,
      notifyBySms: true,
      manager: {
        name: 'Salvadora Conesa Martinez',
        email: 'salvadoraconesa@gmail.com',
      },
    });

    const onlineApptPending: any = {
      id: 'appt-gestalt-pending',
      service: 'Terapia Gestalt (Sesión Individual)',
      serviceId: 'svc-gestalt',
      contactId: 'contact-test-1',
      startsAt: new Date('2026-09-21T10:00:00.000Z'),
      endsAt: new Date('2026-09-21T11:00:00.000Z'),
      status: AppointmentStatus.PENDING_APPROVAL,
      modality: 'virtual',
      calMeetingUrl: 'https://meet.jit.si/salvadora-terapia-gestalt-provisional',
      notes: 'Sesión online por videollamada',
    };

    await (service as any).notifyStudentDecision(onlineApptPending, 'pending_approval', 'Salvadora Conesa Martinez');

    expect(emailServiceMock.sendNotification).toHaveBeenCalledTimes(1);
    const [, , , emailHtml] = emailServiceMock.sendNotification.mock.calls[0];
    // Must NOT leak the provisional meeting link to the student
    expect(emailHtml).not.toContain('https://meet.jit.si/salvadora-terapia-gestalt-provisional');
    expect(emailHtml).toContain('Online (Videollamada)');
    expect(emailHtml).toContain('El enlace de acceso para unirte a la videollamada te será facilitado');

    expect(zadarmaSmsMock.sendSms).toHaveBeenCalledTimes(1);
    const smsPayload = zadarmaSmsMock.sendSms.mock.calls[0][0];
    expect(smsPayload.message).not.toContain('https://meet.jit.si/salvadora-terapia-gestalt-provisional');

    // Now test that therapist receives the notification with meeting link
    emailServiceMock.sendNotification.mockClear();
    await (service as any).notifyTherapistPendingApproval(onlineApptPending);

    expect(emailServiceMock.sendNotification).toHaveBeenCalledTimes(1);
    const [therapistEmail, therapistName, subject, therapistHtml] = emailServiceMock.sendNotification.mock.calls[0];
    expect(therapistEmail).toBe('salvadoraconesa@gmail.com');
    expect(therapistName).toBe('Salvadora Conesa Martinez');
    expect(subject).toContain('Nueva solicitud de cita pendiente de aprobación');
    expect(therapistHtml).toContain('https://meet.jit.si/salvadora-terapia-gestalt-provisional');
    expect(therapistHtml).toContain('Maria Garcia');
  });

  it('marks contact emailerroneo = S when emailService.sendNotification fails', async () => {
    servicesRepoMock.findOne.mockResolvedValue({
      id: 'svc-gestalt',
      name: 'Terapia Gestalt (Sesión Individual)',
      notifyByEmail: true,
      notifyByWhatsapp: false,
      notifyBySms: false,
    });

    emailServiceMock.sendNotification.mockResolvedValueOnce({
      ok: false,
      error: 'SMTP 550 Mailbox unavailable',
    });

    const contactToFail = {
      id: 'contact-err-1',
      name: 'Test Failure',
      email: 'bad-email@salvadora.com',
      emailerroneo: 'N',
    };
    contactsRepoMock.save = jest.fn().mockImplementation((c) => Promise.resolve(c));

    const testAppt: any = {
      id: 'appt-err-test',
      service: 'Terapia Gestalt (Sesión Individual)',
      serviceId: 'svc-gestalt',
      contactId: 'contact-err-1',
      startsAt: new Date('2026-09-25T10:00:00.000Z'),
      endsAt: new Date('2026-09-25T11:00:00.000Z'),
      status: AppointmentStatus.SCHEDULED,
      contact: contactToFail,
    };

    await (service as any).notifyStudentDecision(testAppt, 'accepted', 'Salvadora Conesa');

    expect(contactToFail.emailerroneo).toBe('S');
    expect(contactsRepoMock.save).toHaveBeenCalledWith(
      expect.objectContaining({ emailerroneo: 'S' }),
    );
  });

  it('blocks appointment creation with BadRequestException when contact has emailerroneo = S', async () => {
    contactsRepoMock.findOne.mockResolvedValueOnce({
      id: 'contact-blocked-email',
      name: 'Email Bloqueado',
      email: 'erroneo@test.com',
      bloqueado: 'N',
      emailerroneo: 'S',
    });

    await expect(
      service.create({
        contactId: 'contact-blocked-email',
        service: 'Hatha Yoga Terapéutico',
        startsAt: '2026-09-29T20:00:00.000Z',
        endsAt: '2026-09-29T21:30:00.000Z',
      }),
    ).rejects.toThrow('emailerroneo=S');
  });

  it('formats provisional/tentative service booking notifications with priority seat messaging and prominent specific info', async () => {
    servicesRepoMock.findOne.mockResolvedValue({
      id: 'svc-constelaciones',
      name: 'Constelaciones Familiares',
      textoespecifico: 'tentativamente el domingo 25 de octubre de 10 a 14:00',
      description: 'Taller vivencial de constelaciones familiares.',
      notifyByEmail: true,
      notifyByWhatsapp: true,
      notifyBySms: true,
    });

    const provisionalAppt: any = {
      id: 'appt-prov-1',
      service: 'Constelaciones Familiares (Participante / Representante)',
      serviceId: 'svc-constelaciones',
      contactId: 'contact-test-1',
      startsAt: new Date('2026-10-25T08:00:00.000Z'),
      endsAt: new Date('2026-10-25T12:00:00.000Z'),
      status: AppointmentStatus.SCHEDULED,
      price: 20,
    };

    await (service as any).notifyStudentDecision(provisionalAppt, 'accepted', 'Centro de Yoga Salvadora Conesa');

    // 1. Email verification
    expect(emailServiceMock.sendNotification).toHaveBeenCalledTimes(1);
    const emailArgs = emailServiceMock.sendNotification.mock.calls[0];
    const emailSubject = emailArgs[2];
    const emailHtml = emailArgs[3];

    expect(emailSubject).toContain('Reserva de plaza prioritaria');
    expect(emailSubject).toContain('fecha provisional');
    expect(emailHtml).toContain('¡Tu plaza prioritaria está reservada!');
    expect(emailHtml).toContain('Sin confirmar la fecha y hora definitiva: tentativamente el domingo 25 de octubre de 10 a 14:00');
    expect(emailHtml).toContain('Fecha provisional / tentativa');
    expect(emailHtml).toContain('Pendiente de confirmación definitiva');

    // 2. WhatsApp verification
    expect(ycloudClientMock.sendTextMessage).toHaveBeenCalledTimes(1);
    const whatsappText = ycloudClientMock.sendTextMessage.mock.calls[0][2];
    expect(whatsappText).toContain('*reserva de plaza prioritaria*');
    expect(whatsappText).toContain('Aviso importante:* Convocatoria con fecha tentativa/provisional');
    expect(whatsappText).toContain('Sin confirmar la fecha y hora definitiva: tentativamente el domingo 25 de octubre de 10 a 14:00');

    // 3. SMS verification
    expect(zadarmaSmsMock.sendSms).toHaveBeenCalledTimes(1);
    const smsMessage = zadarmaSmsMock.sendSms.mock.calls[0][0].message;
    expect(smsMessage).toContain('plaza prioritaria');
    expect(smsMessage).toContain('Fecha provisional');
  });
});

