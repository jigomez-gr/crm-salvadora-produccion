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
});
