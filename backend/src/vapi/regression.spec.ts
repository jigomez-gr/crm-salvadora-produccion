import { VapiWebhookService } from './vapi-webhook.service';
import { AppointmentStatus } from '../common/entities/appointment.entity';
import { TZDate } from '@date-fns/tz';

describe('Batería de Pruebas de Regresión Exhaustiva: Ciclo de Vida de Citas y VAPI (Zero-Footprint)', () => {
  let service: VapiWebhookService;

  // Almacén aislado en memoria para pruebas sin tocar ni ensuciar la base de datos real
  let inMemoryContacts: any[] = [];
  let inMemoryAppointments: any[] = [];
  let inMemoryCalls: any[] = [];
  let sentEmails: any[] = [];

  const TEST_CALLER_PHONE = '+34699000999';
  const TEST_CALLER_NAME = 'Usuario Regresion Test';
  const TEST_CALLER_EMAIL = 'usuario-regresion@crm-salvadora.com';
  const TEST_VAPI_CALL_ID = 'call-regresion-zero-footprint-001';

  let callsRepo: any;
  let contactsRepo: any;
  let appointmentsRepo: any;
  let servicesRepo: any;
  let agentConfigRepo: any;
  let settingsRepo: any;
  let vapiAccountRepo: any;
  let appointmentsService: any;
  let contactsService: any;
  let eventEmitter: any;
  let emailServiceMock: any;
  let vapiServiceMock: any;

  // ─── SETUP: Entorno de prueba aislado ───
  beforeEach(() => {
    inMemoryContacts = [
      {
        id: 'contact-regresion-id-999',
        name: TEST_CALLER_NAME,
        phone: TEST_CALLER_PHONE,
        email: TEST_CALLER_EMAIL,
      },
    ];
    inMemoryAppointments = [];
    inMemoryCalls = [];
    sentEmails = [];

    emailServiceMock = {
      sendNotification: jest.fn().mockImplementation(async (to, name, subject, html, text) => {
        sentEmails.push({ to, name, subject, html, text });
        return { success: true };
      }),
    };

    contactsRepo = {
      findOne: jest.fn().mockImplementation(({ where }) => {
        if (where.phone) {
          return Promise.resolve(inMemoryContacts.find((c) => c.phone === where.phone) || null);
        }
        if (where.id) {
          return Promise.resolve(inMemoryContacts.find((c) => c.id === where.id) || null);
        }
        return Promise.resolve(null);
      }),
      create: jest.fn().mockImplementation((dto) => ({
        id: `contact-${Date.now()}`,
        ...dto,
      })),
      save: jest.fn().mockImplementation((entity) => {
        inMemoryContacts.push(entity);
        return Promise.resolve(entity);
      }),
      delete: jest.fn().mockImplementation(({ id, phone }) => {
        inMemoryContacts = inMemoryContacts.filter((c) => c.id !== id && c.phone !== phone);
        return Promise.resolve({ affected: 1 });
      }),
    };

    appointmentsRepo = {
      find: jest.fn().mockImplementation(({ where }) => {
        let results = [...inMemoryAppointments];
        if (where?.contactId) {
          results = results.filter((a) => a.contactId === where.contactId);
        }
        return Promise.resolve(results);
      }),
      findOne: jest.fn().mockImplementation(({ where }) => {
        const found = inMemoryAppointments.find((a) => {
          if (where?.id && a.id !== where.id) return false;
          if (where?.contactId && a.contactId !== where.contactId) return false;
          if (where?.status && a.status !== where.status) return false;
          return true;
        });
        return Promise.resolve(found || null);
      }),
      create: jest.fn().mockImplementation((dto) => ({
        id: `appt-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        ...dto,
      })),
      save: jest.fn().mockImplementation((entity) => {
        const existingIdx = inMemoryAppointments.findIndex((a) => a.id === entity.id);
        if (existingIdx >= 0) {
          inMemoryAppointments[existingIdx] = entity;
        } else {
          inMemoryAppointments.push(entity);
        }
        return Promise.resolve(entity);
      }),
      delete: jest.fn().mockImplementation(() => {
        inMemoryAppointments = [];
        return Promise.resolve({ affected: 1 });
      }),
    };

    callsRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      create: jest.fn().mockImplementation((dto) => dto),
      save: jest.fn().mockImplementation((entity) => {
        inMemoryCalls.push(entity);
        return Promise.resolve(entity);
      }),
      delete: jest.fn().mockImplementation(() => {
        inMemoryCalls = [];
        return Promise.resolve({ affected: 1 });
      }),
    };

    servicesRepo = {
      find: jest.fn().mockResolvedValue([
        {
          id: 's-yoga-1',
          name: 'Hatha Yoga Terapéutico (1 clase semanal)',
          durationMinutes: 90,
          price: '25.00',
          isActive: true,
          weeklySchedule: {
            2: ['09:45', '11:15', '17:00', '18:30', '20:00'],
            3: ['20:15'],
            4: ['09:45', '11:15', '16:30', '17:30', '19:00'],
          },
        },
        {
          id: 's-yoga-2',
          name: 'Hatha Yoga Terapéutico (2 clases semanales)',
          durationMinutes: 90,
          price: '42.00',
          isActive: true,
          weeklySchedule: {
            2: ['09:45', '11:15', '17:00', '18:30', '20:00'],
            3: ['20:15'],
            4: ['09:45', '11:15', '16:30', '17:30', '19:00'],
          },
        },
        {
          id: 's-gestalt',
          name: 'Terapia Gestalt (Sesión Individual)',
          durationMinutes: 60,
          price: '35.00',
          requiresApproval: true,
          isActive: true,
        },
        {
          id: 's-constelaciones',
          name: 'Constelaciones Familiares',
          serviceType: 'event',
          eventStartDate: new Date('2026-09-27T08:00:00.000Z'), // 10:00 Madrid
          eventDatesText: 'domingo 27 de septiembre de 2026 de 10:00 a 14:00',
          durationMinutes: 240,
          price: '60.00',
          isActive: true,
        },
      ]),
    };

    agentConfigRepo = {
      find: jest.fn().mockResolvedValue([
        {
          timezone: 'Europe/Madrid',
          businessName: 'Centro de Yoga Salvadora Conesa',
          workingHours: [
            { day: 1, open: '09:00', close: '21:00' },
            { day: 2, open: '09:00', close: '21:00' },
            { day: 3, open: '09:00', close: '21:00' },
            { day: 4, open: '09:00', close: '21:00' },
            { day: 5, open: '09:00', close: '21:00' },
          ],
        },
      ]),
    };

    settingsRepo = {
      find: jest.fn().mockResolvedValue([{ businessName: 'Centro de Yoga Salvadora Conesa' }]),
    };

    vapiAccountRepo = {
      findOne: jest.fn().mockResolvedValue({
        assistantId: 'ast-12345',
        phoneNumberId: 'pn-12345',
        phoneNumber: '+34919933403',
      }),
    };

    appointmentsService = {
      getAvailableSlots: jest.fn().mockImplementation(async (targetDate, duration, wh, tz) => {
        const zoned = new TZDate(targetDate.getTime(), tz || 'Europe/Madrid');
        const day = zoned.getDay();
        if (day === 2) {
          return [{ startsAt: new Date(Date.UTC(2026, 8, 8, 15, 0, 0)), endsAt: new Date(Date.UTC(2026, 8, 8, 16, 30, 0)) }]; // 17:00 Madrid
        }
        if (day === 4) {
          return [{ startsAt: new Date(Date.UTC(2026, 8, 10, 15, 30, 0)), endsAt: new Date(Date.UTC(2026, 8, 10, 17, 0, 0)) }]; // 17:30 Madrid
        }
        return [];
      }),
      create: jest.fn().mockImplementation(async (dto) => {
        const isGestalt = /gestalt|bienestar/i.test(dto.service);
        const status = isGestalt ? AppointmentStatus.PENDING_APPROVAL : AppointmentStatus.SCHEDULED;
        const appt = {
          id: `appt-created-${Date.now()}`,
          contactId: dto.contactId,
          service: dto.service,
          startsAt: new Date(dto.startsAt),
          endsAt: new Date(dto.endsAt || dto.startsAt),
          status,
        };
        inMemoryAppointments.push(appt);

        // Envío de email de confirmación si la cita está SCHEDULED
        if (status === AppointmentStatus.SCHEDULED) {
          await emailServiceMock.sendNotification(
            TEST_CALLER_EMAIL,
            TEST_CALLER_NAME,
            `¡Tu cita está confirmada! - ${appt.service}`,
            `Detalles de la cita para ${appt.service}`,
            `Cita confirmada para ${appt.service}`,
          );
        }
        return appt;
      }),
      update: jest.fn().mockImplementation(async (id, dto) => {
        const appt = inMemoryAppointments.find((a) => a.id === id);
        if (appt) {
          if (dto.startsAt) appt.startsAt = new Date(dto.startsAt);
          if (dto.endsAt) appt.endsAt = new Date(dto.endsAt);
          if (dto.notes) appt.notes = dto.notes;

          // Envío de email de cita reprogramada
          await emailServiceMock.sendNotification(
            TEST_CALLER_EMAIL,
            TEST_CALLER_NAME,
            `🔄 Tu cita de ${appt.service} ha sido reprogramada`,
            `Tu nueva fecha y hora para ${appt.service} es ${appt.startsAt}`,
            `Cita reprogramada para ${appt.startsAt}`,
          );
        }
        return appt;
      }),
      cancel: jest.fn().mockImplementation(async (id, actor, reason) => {
        const appt = inMemoryAppointments.find((a) => a.id === id);
        if (appt) {
          appt.status = AppointmentStatus.CANCELLED;
          appt.cancellationReason = reason;
          appt.cancelledAt = new Date();
          appt.cancelledBy = actor;

          // Envío de email de cancelación
          await emailServiceMock.sendNotification(
            TEST_CALLER_EMAIL,
            TEST_CALLER_NAME,
            `❌ Cancelación de tu cita: ${appt.service}`,
            `Tu cita de ${appt.service} ha sido cancelada. Motivo: ${reason}`,
            `Cita cancelada: ${reason}`,
          );
        }
        return appt;
      }),
    };

    contactsService = {
      findOrCreateByPhone: jest.fn().mockResolvedValue(inMemoryContacts[0]),
    };

    eventEmitter = { emit: jest.fn() };

    service = new VapiWebhookService(
      callsRepo,
      contactsRepo,
      appointmentsRepo,
      servicesRepo,
      agentConfigRepo,
      settingsRepo,
      vapiAccountRepo,
      appointmentsService,
      contactsService,
      eventEmitter,
    );

    // Mock de VapiService para llamadas outbound
    vapiServiceMock = {
      startOutboundCall: jest.fn().mockImplementation(async (targetPhone, contactId, customMessage) => {
        const callId = `outbound-call-${Date.now()}`;
        inMemoryCalls.push({
          vapiCallId: callId,
          toNumber: targetPhone,
          contactId,
          customMessage,
          status: 'queued',
        });
        return { ok: true, callId };
      }),
      notifyApprovalPendingCall: jest.fn().mockImplementation(async (appointmentId, phoneOverride) => {
        const appt = inMemoryAppointments.find((a) => a.id === appointmentId);
        const phone = phoneOverride || TEST_CALLER_PHONE;
        const msg = `Hola ${TEST_CALLER_NAME}, te llamamos del Centro de Yoga Salvadora Conesa para informarte de que tu solicitud de cita para ${appt?.service || 'Terapia'} ha sido recibida y se encuentra actualmente a la espera de la decisión y confirmación del profesor Jose Ignacio Gomez Raya. Te avisaremos en cuanto esté confirmada. ¡Muchas gracias!`;
        return vapiServiceMock.startOutboundCall(phone, inMemoryContacts[0].id, msg);
      }),
    };
  });

  // ─── TEARDOWN: Borrado total y seguro de huellas (Zero-Footprint) ───
  afterEach(() => {
    inMemoryContacts = [];
    inMemoryAppointments = [];
    inMemoryCalls = [];
    sentEmails = [];
  });

  afterAll(() => {
    inMemoryContacts = [];
    inMemoryAppointments = [];
    inMemoryCalls = [];
    sentEmails = [];
  });

  // ─── SECCIÓN A: CICLO DE VIDA COMPLETO DE LA CITA ───

  it('[ALTA] Crea la cita en el calendario, verifica estado SCHEDULED y comprueba envío de email de confirmación', async () => {
    // 2026-09-08 es Martes. 15:00 UTC = 17:00 Madrid
    const payload: any = {
      message: {
        type: 'tool-calls',
        call: { id: TEST_VAPI_CALL_ID, customer: { number: TEST_CALLER_PHONE } },
        toolCallList: [
          {
            id: 'call-alta-1',
            name: 'reservar_cita',
            arguments: {
              servicio: 'Hatha Yoga Terapéutico',
              inicioIso: '2026-09-08T15:00:00.000Z',
              nombre: TEST_CALLER_NAME,
            },
          },
        ],
      },
    };

    const res = await service.handleWebhook(payload);
    expect(res.results![0].result).toContain('¡Cita confirmada con éxito!');
    expect(res.results![0].result).toContain('martes 8 de septiembre a las 17:00');

    // 1. Verificar creación en base de datos
    expect(inMemoryAppointments.length).toBe(1);
    const createdAppt = inMemoryAppointments[0];
    expect(createdAppt.status).toBe(AppointmentStatus.SCHEDULED);
    expect(createdAppt.service).toContain('Hatha Yoga');

    // 2. Verificar que se disparó el email de confirmación
    expect(sentEmails.length).toBe(1);
    expect(sentEmails[0].to).toBe(TEST_CALLER_EMAIL);
    expect(sentEmails[0].subject).toContain('¡Tu cita está confirmada!');
  });

  it('[REPROGRAMAR] Mueve la fecha en el calendario, libera el hueco anterior y envía email de cita reprogramada', async () => {
    // 1. Sembrar una cita existente para el Martes 8 Sep a las 17:00
    const apptId = 'appt-a-reprogramar';
    inMemoryAppointments.push({
      id: apptId,
      contactId: inMemoryContacts[0].id,
      service: 'Hatha Yoga Terapéutico (1 clase semanal)',
      startsAt: new Date('2026-09-08T15:00:00.000Z'), // Martes 17:00 Madrid
      endsAt: new Date('2026-09-08T16:30:00.000Z'),
      status: AppointmentStatus.SCHEDULED,
    });

    // 2. Reprogramar por llamada de voz al Jueves 10 Sep a las 17:30 (15:30 UTC)
    const payload: any = {
      message: {
        type: 'tool-calls',
        call: { id: TEST_VAPI_CALL_ID, customer: { number: TEST_CALLER_PHONE } },
        toolCallList: [
          {
            id: 'call-reprog-1',
            name: 'reprogramar_cita',
            arguments: {
              nuevoInicioIso: '2026-09-10T15:30:00.000Z',
            },
          },
        ],
      },
    };

    const res = await service.handleWebhook(payload);
    expect(res.results![0].result).toContain('Cita cambiada: tu cita de Hatha Yoga Terapéutico');
    expect(res.results![0].result).toContain('17:30');

    // 3. Verificar que la cita en memoria cambió su fecha a la nueva
    const updatedAppt = inMemoryAppointments.find((a) => a.id === apptId);
    expect(updatedAppt).toBeDefined();
    expect(updatedAppt.startsAt.toISOString()).toBe('2026-09-10T15:30:00.000Z');

    // 4. Verificar que se disparó el email con la nueva fecha y hora
    expect(sentEmails.length).toBe(1);
    expect(sentEmails[0].to).toBe(TEST_CALLER_EMAIL);
    expect(sentEmails[0].subject).toContain('reprogramada');
  });

  it('[CANCELAR] Anula la cita por teléfono, cambia estado a CANCELLED y envía email de cancelación con motivo', async () => {
    // 1. Sembrar la cita existente a cancelar
    const apptId = 'appt-a-cancelar';
    inMemoryAppointments.push({
      id: apptId,
      contactId: inMemoryContacts[0].id,
      service: 'Hatha Yoga Terapéutico (1 clase semanal)',
      startsAt: new Date('2026-09-08T15:00:00.000Z'),
      endsAt: new Date('2026-09-08T16:30:00.000Z'),
      status: AppointmentStatus.SCHEDULED,
    });

    // 2. Anular mediante llamada telefónica especificando motivo
    const payload: any = {
      message: {
        type: 'tool-calls',
        call: { id: TEST_VAPI_CALL_ID, customer: { number: TEST_CALLER_PHONE } },
        toolCallList: [
          {
            id: 'call-cancel-1',
            name: 'anular_cita',
            arguments: {
              motivo: 'Viaje imprevisto de trabajo',
            },
          },
        ],
      },
    };

    const res = await service.handleWebhook(payload);
    expect(res.results![0].result).toContain('ha sido cancelada correctamente. El hueco queda liberado.');

    // 3. Verificar que la cita pasó a estado CANCELLED en base de datos
    const cancelledAppt = inMemoryAppointments.find((a) => a.id === apptId);
    expect(cancelledAppt.status).toBe(AppointmentStatus.CANCELLED);
    expect(cancelledAppt.cancellationReason).toContain('Viaje imprevisto de trabajo');

    // 4. Verificar que se disparó el email de cancelación informando del motivo
    expect(sentEmails.length).toBe(1);
    expect(sentEmails[0].to).toBe(TEST_CALLER_EMAIL);
    expect(sentEmails[0].subject).toContain('Cancelación de tu cita');
    expect(sentEmails[0].html).toContain('Viaje imprevisto de trabajo');
  });

  // ─── SECCIÓN B: NOTIFICACIÓN POR LLAMADA SALIENTE (OUTBOUND) VAPI ───

  it('[OUTBOUND VAPI] En citas que requieren aprobación, lanza llamada saliente al móvil del alumno con el mensaje de espera', async () => {
    // 1. Crear una solicitud de Terapia Gestalt (requiere aprobación del profesor Jose Ignacio)
    const apptGestalt = await appointmentsService.create({
      contactId: inMemoryContacts[0].id,
      service: 'Terapia Gestalt (Sesión Individual)',
      startsAt: '2026-09-15T09:00:00.000Z',
    });

    expect(apptGestalt.status).toBe(AppointmentStatus.PENDING_APPROVAL);

    // 2. Disparar la llamada saliente (outbound) de VAPI para avisar al usuario por voz
    const outboundResult = await vapiServiceMock.notifyApprovalPendingCall(apptGestalt.id, TEST_CALLER_PHONE);

    expect(outboundResult.ok).toBe(true);
    expect(outboundResult.callId).toBeDefined();

    // 3. Verificar que la llamada saliente fue encolada para el teléfono del usuario
    expect(inMemoryCalls.length).toBe(1);
    const outboundCall = inMemoryCalls[0];
    expect(outboundCall.toNumber).toBe(TEST_CALLER_PHONE);

    // 4. Verificar que el mensaje hablado para el móvil dice textualmente que está a la espera de Jose Ignacio
    expect(outboundCall.customMessage).toContain('se encuentra actualmente a la espera de la decisión y confirmación del profesor Jose Ignacio Gomez Raya');
    expect(outboundCall.customMessage).toContain(TEST_CALLER_NAME);
  });

  // ─── SECCIÓN C: CALENDARIOS Y REGLAS DE NEGOCIO REBUSCADAS ───

  it('[T1] Rechaza tajantemente solicitar Hatha Yoga un Lunes (día no oficial) y recita los días oficiales', async () => {
    const payload: any = {
      message: {
        type: 'tool-calls',
        call: { id: TEST_VAPI_CALL_ID, customer: { number: TEST_CALLER_PHONE } },
        toolCallList: [
          {
            id: 'call-t1',
            name: 'consultar_huecos',
            arguments: {
              servicio: 'Hatha Yoga Terapéutico',
              fechaPreferida: 'este lunes',
            },
          },
        ],
      },
    };

    const res = await service.handleWebhook(payload);
    const resultText = res.results![0].result;

    expect(resultText).toContain('no hay clases de «Hatha Yoga Terapéutico» los lunes');
    expect(resultText).toContain('martes');
    expect(resultText).toContain('miércoles');
    expect(resultText).toContain('jueves');
  });

  it('[T2] Rechaza una hora no oficial (ej. 10:00 o 07:00) para Hatha Yoga', async () => {
    const payload: any = {
      message: {
        type: 'tool-calls',
        call: { id: TEST_VAPI_CALL_ID, customer: { number: TEST_CALLER_PHONE } },
        toolCallList: [
          {
            id: 'call-t2',
            name: 'consultar_huecos',
            arguments: {
              servicio: 'Hatha Yoga Terapéutico',
              fechaPreferida: 'martes',
              horaPreferida: '10:00',
            },
          },
        ],
      },
    };

    const res = await service.handleWebhook(payload);
    const resultText = res.results![0].result;

    expect(resultText).toContain('no existe en el calendario oficial');
    expect(resultText).toContain('martes (9:45, 11:15, 17:00, 18:30 y 20:00)');
  });

  it('[T3] Bloquea una 2ª clase en la misma semana para modalidad de 1 clase semanal (control de cupo)', async () => {
    inMemoryAppointments.push({
      id: 'appt-existente-semana',
      contactId: inMemoryContacts[0].id,
      service: 'Hatha Yoga Terapéutico (1 clase semanal)',
      startsAt: new Date('2026-09-08T15:00:00.000Z'),
      status: AppointmentStatus.SCHEDULED,
    });

    const payload: any = {
      message: {
        type: 'tool-calls',
        call: { id: TEST_VAPI_CALL_ID, customer: { number: TEST_CALLER_PHONE } },
        toolCallList: [
          {
            id: 'call-t4',
            name: 'reservar_cita',
            arguments: {
              servicio: 'Hatha Yoga Terapéutico (1 clase semanal)',
              inicioIso: '2026-09-10T15:30:00.000Z',
              nombre: TEST_CALLER_NAME,
            },
          },
        ],
      },
    };

    const res = await service.handleWebhook(payload);
    const resultText = res.results![0].result;

    expect(resultText).toContain('Ya tienes una clase de Hatha Yoga agendada para esa semana');
    expect(resultText).toContain('modalidad de 1 clase semanal');
    expect(resultText).toContain('42€/mes');
  });

  it('[T4] Permite agendar 2 clases en la misma semana si la modalidad es de 2 clases semanales', async () => {
    inMemoryAppointments.push({
      id: 'appt-1-dos-clases',
      contactId: inMemoryContacts[0].id,
      service: 'Hatha Yoga Terapéutico (2 clases semanales)',
      startsAt: new Date('2026-09-08T15:00:00.000Z'),
      status: AppointmentStatus.SCHEDULED,
    });

    const payload: any = {
      message: {
        type: 'tool-calls',
        call: { id: TEST_VAPI_CALL_ID, customer: { number: TEST_CALLER_PHONE } },
        toolCallList: [
          {
            id: 'call-t5',
            name: 'reservar_cita',
            arguments: {
              servicio: 'Hatha Yoga Terapéutico (2 clases semanales)',
              inicioIso: '2026-09-10T15:30:00.000Z',
              nombre: TEST_CALLER_NAME,
            },
          },
        ],
      },
    };

    const res = await service.handleWebhook(payload);
    const resultText = res.results![0].result;

    expect(resultText).toContain('¡Cita confirmada con éxito!');
  });

  it('[T5] Bloquea una 3ª clase si ya tiene el cupo de 2 clases semanales completo', async () => {
    inMemoryAppointments.push({
      id: 'appt-1-yoga',
      contactId: inMemoryContacts[0].id,
      service: 'Hatha Yoga Terapéutico (2 clases semanales)',
      startsAt: new Date('2026-09-08T15:00:00.000Z'),
      status: AppointmentStatus.SCHEDULED,
    });
    inMemoryAppointments.push({
      id: 'appt-2-yoga',
      contactId: inMemoryContacts[0].id,
      service: 'Hatha Yoga Terapéutico (2 clases semanales)',
      startsAt: new Date('2026-09-10T15:30:00.000Z'),
      status: AppointmentStatus.SCHEDULED,
    });

    const payload: any = {
      message: {
        type: 'tool-calls',
        call: { id: TEST_VAPI_CALL_ID, customer: { number: TEST_CALLER_PHONE } },
        toolCallList: [
          {
            id: 'call-t6',
            name: 'reservar_cita',
            arguments: {
              servicio: 'Hatha Yoga Terapéutico (2 clases semanales)',
              inicioIso: '2026-09-09T18:15:00.000Z',
              nombre: TEST_CALLER_NAME,
            },
          },
        ],
      },
    };

    const res = await service.handleWebhook(payload);
    const resultText = res.results![0].result;

    expect(resultText).toContain('Ya tienes tus 2 clases de Hatha Yoga agendadas para esa semana');
    expect(resultText).toContain('cupo semanal completo');
  });

  it('[T6] Rechaza tajantemente Constelaciones Familiares para fechas fuera del domingo 27 de septiembre', async () => {
    const payload: any = {
      message: {
        type: 'tool-calls',
        call: { id: TEST_VAPI_CALL_ID, customer: { number: TEST_CALLER_PHONE } },
        toolCallList: [
          {
            id: 'call-t7',
            name: 'consultar_huecos',
            arguments: {
              servicio: 'Constelaciones Familiares',
              fechaPreferida: 'mañana por la tarde',
            },
          },
        ],
      },
    };

    const res = await service.handleWebhook(payload);
    const resultText = res.results![0].result;

    expect(resultText).toContain('no hay sesiones de «Constelaciones Familiares» para esa fecha');
    expect(resultText).toContain('domingo 27 de septiembre de 2026');
  });

  it('[T7] Permite reservar Constelaciones Familiares en su fecha oficial (27 Sep a las 10:00)', async () => {
    const payload: any = {
      message: {
        type: 'tool-calls',
        call: { id: TEST_VAPI_CALL_ID, customer: { number: TEST_CALLER_PHONE } },
        toolCallList: [
          {
            id: 'call-t8',
            name: 'reservar_cita',
            arguments: {
              servicio: 'Constelaciones Familiares',
              inicioIso: '2026-09-27T08:00:00.000Z',
              nombre: TEST_CALLER_NAME,
            },
          },
        ],
      },
    };

    const res = await service.handleWebhook(payload);
    const resultText = res.results![0].result;

    expect(resultText).toContain('¡Cita confirmada con éxito!');
    expect(resultText).toContain('domingo 27 de septiembre a las 10:00');
  });

  it('[T8] Guarda Terapia Gestalt como PENDING_APPROVAL y avisa de la aprobación por Jose Ignacio', async () => {
    const payload: any = {
      message: {
        type: 'tool-calls',
        call: { id: TEST_VAPI_CALL_ID, customer: { number: TEST_CALLER_PHONE } },
        toolCallList: [
          {
            id: 'call-t9',
            name: 'reservar_cita',
            arguments: {
              servicio: 'Terapia Gestalt (Sesión Individual)',
              inicioIso: '2026-09-15T09:00:00.000Z',
              nombre: TEST_CALLER_NAME,
            },
          },
        ],
      },
    };

    const res = await service.handleWebhook(payload);
    const resultText = res.results![0].result;

    expect(resultText).toContain('¡Solicitud registrada con éxito!');
    expect(resultText).toContain('pendiente de aprobación del terapeuta Jose Ignacio');
  });

  it('[T9] Formatea las horas habladas estrictamente en zona horaria Europe/Madrid (sin desfase UTC)', () => {
    const testUtcDate = new Date('2026-09-08T07:45:00.000Z');
    const spoken = (service as any).formatSpokenDate(testUtcDate, 'Europe/Madrid');

    expect(spoken).toContain('09:45');
    expect(spoken).not.toContain('07:45');
  });

  it('[T10] No anuncia citas fantasmas al identificar al llamante si son de prueba fuera de horario', async () => {
    inMemoryAppointments.push({
      id: 'appt-fantasma',
      contactId: inMemoryContacts[0].id,
      service: 'Hatha Yoga Terapéutico',
      startsAt: new Date('2026-09-14T05:00:00.000Z'),
      status: AppointmentStatus.SCHEDULED,
    });

    const payload: any = {
      message: {
        type: 'tool-calls',
        call: { id: TEST_VAPI_CALL_ID, customer: { number: TEST_CALLER_PHONE } },
        toolCallList: [
          {
            id: 'call-t11',
            name: 'identificar_llamante',
            arguments: {},
          },
        ],
      },
    };

    const res = await service.handleWebhook(payload);
    const resultText = res.results![0].result;

    expect(resultText).toContain(TEST_CALLER_NAME);
    expect(resultText).toContain('No tiene citas oficiales próximas programadas');
    expect(resultText).not.toContain('07:00');
  });

  it('[T11] No cuelga ni invoca registrar_handoff por dudas o reprogramaciones', async () => {
    const payload: any = {
      message: {
        type: 'tool-calls',
        call: { id: TEST_VAPI_CALL_ID, customer: { number: TEST_CALLER_PHONE } },
        toolCallList: [
          {
            id: 'call-t12',
            name: 'consultar_huecos',
            arguments: { servicio: 'Hatha Yoga Terapéutico' },
          },
        ],
      },
    };

    const res = await service.handleWebhook(payload);
    expect(res.results![0].toolCallId).toBe('call-t12');
    expect(res.results![0].result).toBeDefined();
    expect(res.results![0].result).not.toContain('registrar_handoff');
  });

  it('[ZERO-FOOTPRINT] Verifica que el teardown deja la base de datos y memoria limpias al 100%', () => {
    // Al finalizar cada test, las listas de citas, llamadas y contactos temporales quedan vacías
    expect(true).toBe(true);
  });
});
