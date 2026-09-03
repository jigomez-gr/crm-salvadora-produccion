import { VapiWebhookService } from './vapi-webhook.service';
import { AppointmentStatus } from '../common/entities/appointment.entity';
import { TZDate } from '@date-fns/tz';

describe('Batería de Pruebas de Regresión y Casos Rebuscados (Zero-Footprint)', () => {
  let service: VapiWebhookService;

  // In-memory isolated storage for testing with ZERO footprint on real database
  let inMemoryContacts: any[] = [];
  let inMemoryAppointments: any[] = [];
  let inMemoryCalls: any[] = [];

  const TEST_CALLER_PHONE = '+34699000999';
  const TEST_CALLER_NAME = 'Usuario Regresion Test';
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

  // ─── SETUP: Creamos el usuario y entorno de prueba ───
  beforeEach(() => {
    inMemoryContacts = [
      {
        id: 'contact-regresion-id-999',
        name: TEST_CALLER_NAME,
        phone: TEST_CALLER_PHONE,
        email: 'regresion@test.com',
      },
    ];
    inMemoryAppointments = [];
    inMemoryCalls = [];

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
        inMemoryAppointments.push(entity);
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
      findOne: jest.fn().mockResolvedValue(null),
    };

    appointmentsService = {
      getAvailableSlots: jest.fn().mockImplementation(async (targetDate, duration, wh, tz, now, calId, svcId, svcName) => {
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
        const appt = {
          id: `appt-created-${Date.now()}`,
          contactId: dto.contactId,
          service: dto.service,
          startsAt: new Date(dto.startsAt),
          endsAt: new Date(dto.endsAt || dto.startsAt),
          status: /gestalt|bienestar/i.test(dto.service) ? AppointmentStatus.PENDING_APPROVAL : AppointmentStatus.SCHEDULED,
        };
        inMemoryAppointments.push(appt);
        return appt;
      }),
      cancel: jest.fn().mockResolvedValue({ id: 'appt-cancelled' }),
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
  });

  // ─── TEARDOWN: Borrado total y seguro de huellas (Zero-Footprint) ───
  afterEach(() => {
    inMemoryContacts = [];
    inMemoryAppointments = [];
    inMemoryCalls = [];
  });

  afterAll(() => {
    inMemoryContacts = [];
    inMemoryAppointments = [];
    inMemoryCalls = [];
  });

  // ─── CASOS DE PRUEBA REBUSCADOS ───

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

  it('[T3] Permite y agenda con éxito un turno oficial de Hatha Yoga (Martes 17:00)', async () => {
    // 2026-09-08 es Martes. 15:00 UTC = 17:00 Europe/Madrid
    const payload: any = {
      message: {
        type: 'tool-calls',
        call: { id: TEST_VAPI_CALL_ID, customer: { number: TEST_CALLER_PHONE } },
        toolCallList: [
          {
            id: 'call-t3',
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
    const resultText = res.results![0].result;

    expect(resultText).toContain('¡Cita confirmada con éxito!');
    expect(resultText).toContain('martes 8 de septiembre a las 17:00');
    expect(inMemoryAppointments.length).toBe(1);
  });

  it('[T4] Bloquea una 2ª clase en la misma semana para modalidad de 1 clase semanal (control de cupo)', async () => {
    // Sembrando la 1ª cita ya existente (Martes 8 Sep a las 17:00)
    inMemoryAppointments.push({
      id: 'appt-existente-semana',
      contactId: inMemoryContacts[0].id,
      service: 'Hatha Yoga Terapéutico (1 clase semanal)',
      startsAt: new Date('2026-09-08T15:00:00.000Z'),
      status: AppointmentStatus.SCHEDULED,
    });

    // Intento de reservar una 2ª clase el Jueves 10 Sep a las 17:30
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

  it('[T5] Permite agendar 2 clases en la misma semana si la modalidad es de 2 clases semanales', async () => {
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

  it('[T6] Bloquea una 3ª clase si ya tiene el cupo de 2 clases semanales completo', async () => {
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

  it('[T7] Rechaza tajantemente Constelaciones Familiares para fechas fuera del domingo 27 de septiembre', async () => {
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

  it('[T8] Permite reservar Constelaciones Familiares en su fecha oficial (27 Sep a las 10:00)', async () => {
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

  it('[T9] Guarda Terapia Gestalt como PENDING_APPROVAL y avisa de la aprobación por Jose Ignacio', async () => {
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

  it('[T10] Formatea las horas habladas estrictamente en zona horaria Europe/Madrid (sin desfase UTC)', () => {
    const testUtcDate = new Date('2026-09-08T07:45:00.000Z');
    const spoken = (service as any).formatSpokenDate(testUtcDate, 'Europe/Madrid');

    expect(spoken).toContain('09:45');
    expect(spoken).not.toContain('07:45');
  });

  it('[T11] No anuncia citas fantasmas al identificar al llamante si son de prueba fuera de horario', async () => {
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

  it('[T12] No cuelga ni invoca registrar_handoff por dudas o reprogramaciones', async () => {
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
});
