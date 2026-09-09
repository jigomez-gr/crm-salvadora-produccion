import { AppointmentsService } from './appointments.service';
import { Appointment, AppointmentStatus } from '../common/entities/appointment.entity';
import { Service } from '../common/entities/service.entity';
import { Contact } from '../common/entities/contact.entity';
import { ConflictException } from '@nestjs/common';

describe('Yoga & Meditacion Group Availability (Aforo vs Agenda Profesor)', () => {
  let appointmentsService: AppointmentsService;
  let inMemoryAppointments: any[] = [];
  let inMemoryServices: any[] = [];
  let inMemoryContacts: any[] = [];

  const appointmentsRepoMock: any = {
    find: jest.fn().mockImplementation(() => Promise.resolve(inMemoryAppointments)),
    findOne: jest.fn().mockImplementation(() => Promise.resolve(null)),
    create: jest.fn().mockImplementation((dto) => ({
      id: 'appt-' + Math.random().toString(36).substring(2, 9),
      ...dto,
    })),
    save: jest.fn().mockImplementation((appt) => {
      inMemoryAppointments.push(appt);
      return Promise.resolve(appt);
    }),
    manager: {
      transaction: jest.fn().mockImplementation(async (cb) => cb(appointmentsRepoMock.manager)),
      getRepository: jest.fn().mockImplementation(() => appointmentsRepoMock),
    },
    createQueryBuilder: jest.fn().mockImplementation(() => {
      let isYogaFilter = false;
      let isMedFilter = false;
      let filterStart: Date | null = null;
      let filterEnd: Date | null = null;

      const builder: any = {
        where: jest.fn().mockImplementation((sql, params) => {
          if (params?.start) filterStart = new Date(params.start);
          if (params?.end) filterEnd = new Date(params.end);
          return builder;
        }),
        andWhere: jest.fn().mockImplementation((sql, params) => {
          if (params?.yogaPattern) isYogaFilter = true;
          if (params?.medPattern) isMedFilter = true;
          if (params?.startsAt) filterStart = new Date(params.startsAt);
          if (params?.endsAt) filterEnd = new Date(params.endsAt);
          return builder;
        }),
        getMany: jest.fn().mockImplementation(async () => {
          return inMemoryAppointments.filter((a) => {
            if (a.status === AppointmentStatus.CANCELLED) return false;
            if (isYogaFilter && !/yoga/i.test(a.service)) return false;
            if (isMedFilter && !/meditaci/i.test(a.service)) return false;
            if (filterStart && filterEnd) {
              const aStart = new Date(a.startsAt).getTime();
              const aEnd = new Date(a.endsAt).getTime();
              return aStart < filterEnd.getTime() && aEnd > filterStart.getTime();
            }
            return true;
          });
        }),
        getCount: jest.fn().mockImplementation(async () => {
          const matched = inMemoryAppointments.filter((a) => {
            if (a.status === AppointmentStatus.CANCELLED) return false;
            if (isYogaFilter && !/yoga/i.test(a.service)) return false;
            if (isMedFilter && !/meditaci/i.test(a.service)) return false;
            if (filterStart && filterEnd) {
              const aStart = new Date(a.startsAt).getTime();
              const aEnd = new Date(a.endsAt).getTime();
              return aStart < filterEnd.getTime() && aEnd > filterStart.getTime();
            }
            return true;
          });
          return matched.length;
        }),
      };
      return builder;
    }),
  };

  const servicesRepoMock: any = {
    findOne: jest.fn().mockImplementation(({ where }) => {
      return Promise.resolve(
        inMemoryServices.find((s) => {
          if (where?.id && s.id === where.id) return true;
          if (where?.name) {
            if (typeof where.name === 'string' && s.name.toLowerCase() === where.name.toLowerCase()) return true;
            if (where.name._type === 'ilike') {
              const val = where.name._value.replace(/%/g, '').toLowerCase();
              return s.name.toLowerCase().includes(val);
            }
          }
          return false;
        }) || null,
      );
    }),
    find: jest.fn().mockImplementation(() => Promise.resolve(inMemoryServices)),
  };

  const contactsRepoMock: any = {
    findOne: jest.fn().mockImplementation(({ where }) => {
      return Promise.resolve(inMemoryContacts.find((c) => c.id === where?.id) || null);
    }),
    find: jest.fn().mockImplementation(() => Promise.resolve(inMemoryContacts)),
  };

  beforeEach(() => {
    inMemoryAppointments = [];
    inMemoryContacts = [
      { id: 'c1', name: 'Alumno 1', isStudent: false },
      { id: 'c2', name: 'Alumno 2', isStudent: true, studentModality: '1_clase_semanal' },
    ];
    inMemoryServices = [
      {
        id: 'svc-yoga-1',
        name: 'Hatha Yoga Terapéutico (1 clase semanal)',
        durationMinutes: 90,
        calendarId: 'cal-hatha-yoga',
        maxCapacity: 20,
        weeklySchedule: {
          2: ['09:45', '11:15', '17:00', '18:30', '20:00'],
          3: ['20:15'],
          4: ['09:45', '11:15', '16:00', '17:30', '19:00'],
        },
      },
      {
        id: 'svc-yoga-2',
        name: 'Hatha Yoga Terapéutico (2 clases semanales)',
        durationMinutes: 90,
        calendarId: 'cal-hatha-yoga',
        maxCapacity: 20,
        weeklySchedule: {
          2: ['09:45', '11:15', '17:00', '18:30', '20:00'],
          3: ['20:15'],
          4: ['09:45', '11:15', '16:00', '17:30', '19:00'],
        },
      },
      {
        id: 'svc-meditacion',
        name: 'Meditaciones Guiadas',
        durationMinutes: 30,
        calendarId: 'cal-meditacion',
        maxCapacity: 28,
        weeklySchedule: {
          2: ['09:15'],
          4: ['09:15'],
        },
      },
      {
        id: 'svc-gestalt',
        name: 'Terapia Gestalt (Sesión Individual)',
        durationMinutes: 60,
        calendarId: 'cal-gestalt',
        managerId: 'profesor-1',
        maxCapacity: 1,
      },
    ];

    appointmentsService = new AppointmentsService(
      appointmentsRepoMock,
      servicesRepoMock,
      contactsRepoMock,
      null as any,
      { createBooking: jest.fn() } as any,
      { emit: jest.fn() } as any,
      null as any,
      null as any,
      null as any,
      null as any,
      null as any,
    );
  });

  const workingHours = [
    { day: 4, open: '07:00', close: '22:00' }, // Jueves
  ];

  it('El jueves 10 de septiembre a las 09:45 SÍ está disponible aunque ya haya 1 alumno con cita previa', async () => {
    // Jueves 10 de septiembre de 2026 a las 09:45 (07:45 UTC)
    inMemoryAppointments.push({
      id: 'appt-existente-1',
      contactId: 'c1',
      service: 'Hatha Yoga Terapéutico (2 clases semanales)',
      startsAt: new Date('2026-09-10T07:45:00.000Z'),
      endsAt: new Date('2026-09-10T09:15:00.000Z'),
      status: AppointmentStatus.SCHEDULED,
      calendarId: 'cal-hatha-yoga',
    });

    const targetDate = new Date('2026-09-10T00:00:00.000Z');
    const slots = await appointmentsService.getAvailableSlots(
      targetDate,
      90,
      workingHours,
      'Europe/Madrid',
      new Date('2026-09-08T00:00:00.000Z'), // now
      'cal-hatha-yoga',
      'svc-yoga-1',
      'Hatha Yoga Terapéutico (1 clase semanal)',
    );

    const starts = slots.map((s) => s.startsAt.toISOString());
    // El turno de 09:45 (07:45 UTC) DEBE estar disponible porque solo hay 1 alumno de 20 plazas
    expect(starts).toContain('2026-09-10T07:45:00.000Z');
    expect(starts).toContain('2026-09-10T09:15:00.000Z'); // 11:15 local
    expect(starts).toContain('2026-09-10T14:00:00.000Z'); // 16:00 local
    expect(starts).toContain('2026-09-10T15:30:00.000Z'); // 17:30 local
    expect(starts).toContain('2026-09-10T17:00:00.000Z'); // 19:00 local
  });

  it('El turno de Yoga a las 09:45 NUNCA se ve bloqueado porque el profesor tenga otra cita a esa hora', async () => {
    // Cita individual del profesor (Gestalt o privada) el jueves a las 09:45
    inMemoryAppointments.push({
      id: 'appt-profesor-gestalt',
      contactId: 'c1',
      service: 'Terapia Gestalt (Sesión Individual)',
      serviceId: 'svc-gestalt',
      calendarId: 'cal-gestalt',
      startsAt: new Date('2026-09-10T07:45:00.000Z'),
      endsAt: new Date('2026-09-10T08:45:00.000Z'),
      status: AppointmentStatus.SCHEDULED,
    });

    const targetDate = new Date('2026-09-10T00:00:00.000Z');
    const slots = await appointmentsService.getAvailableSlots(
      targetDate,
      90,
      workingHours,
      'Europe/Madrid',
      new Date('2026-09-08T00:00:00.000Z'),
      'cal-hatha-yoga',
      'svc-yoga-1',
      'Hatha Yoga Terapéutico (1 clase semanal)',
    );

    const starts = slots.map((s) => s.startsAt.toISOString());
    // 09:45 NO se ve afectada por citas del profesor ni por otros servicios
    expect(starts).toContain('2026-09-10T07:45:00.000Z');
  });

  it('Contabiliza conjuntamente todas las modalidades de Yoga y solo bloquea al llegar a 20 alumnos', async () => {
    // 19 alumnos de distintas modalidades ya apuntados a las 09:45
    for (let i = 0; i < 19; i++) {
      inMemoryAppointments.push({
        id: `appt-yoga-${i}`,
        contactId: `c-${i}`,
        service: i % 2 === 0 ? 'Hatha Yoga Terapéutico (1 clase semanal)' : 'Hatha Yoga Terapéutico (2 clases semanales)',
        startsAt: new Date('2026-09-10T07:45:00.000Z'),
        endsAt: new Date('2026-09-10T09:15:00.000Z'),
        status: AppointmentStatus.SCHEDULED,
        calendarId: 'cal-hatha-yoga',
      });
    }

    const targetDate = new Date('2026-09-10T00:00:00.000Z');

    // Con 19 alumnos, aún queda 1 plaza libre: 09:45 DEBE aparecer
    let slots = await appointmentsService.getAvailableSlots(
      targetDate,
      90,
      workingHours,
      'Europe/Madrid',
      new Date('2026-09-08T00:00:00.000Z'),
      'cal-hatha-yoga',
      'svc-yoga-1',
      'Hatha Yoga Terapéutico (1 clase semanal)',
    );
    expect(slots.map((s) => s.startsAt.toISOString())).toContain('2026-09-10T07:45:00.000Z');

    // Añadir el alumno número 20 (aforo completo)
    inMemoryAppointments.push({
      id: 'appt-yoga-20',
      contactId: 'c-20',
      service: 'Hatha Yoga Terapéutico',
      startsAt: new Date('2026-09-10T07:45:00.000Z'),
      endsAt: new Date('2026-09-10T09:15:00.000Z'),
      status: AppointmentStatus.SCHEDULED,
      calendarId: 'cal-hatha-yoga',
    });

    // Con 20 alumnos, el aforo se ha completado: 09:45 ya NO debe aparecer
    slots = await appointmentsService.getAvailableSlots(
      targetDate,
      90,
      workingHours,
      'Europe/Madrid',
      new Date('2026-09-08T00:00:00.000Z'),
      'cal-hatha-yoga',
      'svc-yoga-1',
      'Hatha Yoga Terapéutico (1 clase semanal)',
    );
    expect(slots.map((s) => s.startsAt.toISOString())).not.toContain('2026-09-10T07:45:00.000Z');
    // Otros turnos del día como las 11:15 siguen libres
    expect(slots.map((s) => s.startsAt.toISOString())).toContain('2026-09-10T09:15:00.000Z');
  });

  it('Meditaciones Guiadas permite hasta 28 asistentes y NO se ve bloqueada por citas del profesor', async () => {
    // 5 personas apuntadas a Meditación a las 09:15 y una cita del profesor a esa misma hora
    for (let i = 0; i < 5; i++) {
      inMemoryAppointments.push({
        id: `appt-med-${i}`,
        contactId: `c-${i}`,
        service: 'Meditaciones Guiadas',
        startsAt: new Date('2026-09-10T07:15:00.000Z'), // 09:15 local
        endsAt: new Date('2026-09-10T07:45:00.000Z'),
        status: AppointmentStatus.SCHEDULED,
        calendarId: 'cal-meditacion',
      });
    }
    // Cita ajena del profesor
    inMemoryAppointments.push({
      id: 'appt-prof-sesion',
      contactId: 'c1',
      service: 'Terapia Gestalt (Sesión Individual)',
      startsAt: new Date('2026-09-10T07:15:00.000Z'),
      endsAt: new Date('2026-09-10T08:15:00.000Z'),
      status: AppointmentStatus.SCHEDULED,
    });

    const targetDate = new Date('2026-09-10T00:00:00.000Z');
    const slots = await appointmentsService.getAvailableSlots(
      targetDate,
      30,
      workingHours,
      'Europe/Madrid',
      new Date('2026-09-08T00:00:00.000Z'),
      'cal-meditacion',
      'svc-meditacion',
      'Meditaciones Guiadas',
    );

    const starts = slots.map((s) => s.startsAt.toISOString());
    // 09:15 (07:15 UTC) debe estar disponible
    expect(starts).toContain('2026-09-10T07:15:00.000Z');
  });

  it('El miércoles a las 20:15 SÍ está disponible para Hatha Yoga aunque workingHours cierre antes de las 21:45', async () => {
    // Miércoles 9 de septiembre de 2026
    const targetDate = new Date('2026-09-09T00:00:00.000Z');
    const restrictiveWorkingHours = [
      { day: 3, open: '09:00', close: '20:00' }, // horario restrictivo
    ];

    // Consulta realizada a las 07:50 de la mañana del mismo miércoles (día de hoy)
    const now = new Date('2026-09-09T05:50:00.000Z'); // 07:50 local (UTC+2)

    const slots = await appointmentsService.getAvailableSlots(
      targetDate,
      90,
      restrictiveWorkingHours,
      'Europe/Madrid',
      now,
      'cal-hatha-yoga',
      'svc-yoga-1',
      'Hatha Yoga Terapéutico (1 clase semanal)',
    );

    const starts = slots.map((s) => s.startsAt.toISOString());
    // 20:15 local en verano es 18:15 UTC
    expect(starts).toContain('2026-09-09T18:15:00.000Z');
  });

  it('El miércoles a las 20:15 no se ofrece si la hora actual ya ha pasado de las 20:15', async () => {
    const targetDate = new Date('2026-09-09T00:00:00.000Z');
    // Consulta realizada a las 20:30 de la noche del mismo miércoles (hora ya pasada)
    const nowPast = new Date('2026-09-09T18:30:00.000Z'); // 20:30 local

    const slots = await appointmentsService.getAvailableSlots(
      targetDate,
      90,
      [],
      'Europe/Madrid',
      nowPast,
      'cal-hatha-yoga',
      'svc-yoga-1',
      'Hatha Yoga Terapéutico (1 clase semanal)',
    );

    const starts = slots.map((s) => s.startsAt.toISOString());
    expect(starts).not.toContain('2026-09-09T18:15:00.000Z');
  });
});
