import { AppointmentsService } from './appointments.service';
import { Appointment, AppointmentStatus } from '../common/entities/appointment.entity';
import { Contact, ContactStatus } from '../common/entities/contact.entity';

describe('AppointmentsService - rescheduleAppointment', () => {
  let service: AppointmentsService;
  let appointmentsRepo: any;
  let contactsRepo: any;
  let servicesRepo: any;

  const contactMock: Partial<Contact> = {
    id: 'contact-test-1',
    name: 'Jose Julio Gomez',
    phone: '+34646603433',
    email: 'jigomez@hotmail.com',
    status: ContactStatus.LEAD,
    isStudent: false,
  };

  let apptsInDb: any[] = [];

  beforeEach(() => {
    const tuesdayAppt: Partial<Appointment> = {
      id: 'appt-tuesday-1',
      contactId: 'contact-test-1',
      contact: contactMock as Contact,
      service: 'Hatha Yoga Terapéutico (1 clase semanal)',
      calendarId: 'cal-hatha-yoga',
      startsAt: new Date('2026-09-15T07:45:00.000Z'), // Tuesday 09:45 local
      endsAt: new Date('2026-09-15T09:15:00.000Z'),
      status: AppointmentStatus.SCHEDULED,
      isFirstClass: true,
      price: '0.00',
      notes: 'Primera clase de prueba (gratuita / regalo del centro).',
    };

    apptsInDb = [tuesdayAppt];

    appointmentsRepo = {
      findOne: jest.fn(async ({ where }: any) => {
        return apptsInDb.find((a) => a.id === where.id) || null;
      }),
      find: jest.fn(async ({ where }: any) => {
        let res = [...apptsInDb];
        if (where.contactId) {
          res = res.filter((a) => a.contactId === where.contactId);
        }
        if (where.status) {
          if (where.status instanceof Object && where.status._type === 'in') {
            res = res.filter((a) => where.status._value.includes(a.status));
          } else {
            res = res.filter((a) => a.status === where.status);
          }
        }
        return res;
      }),
      save: jest.fn(async (appt: any) => {
        const idx = apptsInDb.findIndex((a) => a.id === appt.id);
        if (idx >= 0) {
          apptsInDb[idx] = { ...apptsInDb[idx], ...appt };
          return apptsInDb[idx];
        }
        const created = { id: `appt-new-${Date.now()}`, ...appt };
        apptsInDb.push(created);
        return created;
      }),
      manager: {
        transaction: jest.fn(async (cb: (m: any) => Promise<any>) => {
          const qbMock = {
            where: jest.fn().mockReturnThis(),
            andWhere: jest.fn().mockReturnThis(),
            getMany: jest.fn().mockResolvedValue([]),
            getOne: jest.fn().mockResolvedValue(null),
            getCount: jest.fn().mockResolvedValue(0),
          };
          return cb({
            query: jest.fn().mockResolvedValue([]),
            getRepository: jest.fn().mockReturnValue({
              count: jest.fn().mockResolvedValue(0),
              find: jest.fn().mockResolvedValue([]),
              create: jest.fn().mockImplementation((d: any) => ({ ...d })),
              save: jest.fn(async (item: any) => {
                const saved = { id: 'appt-thursday-new', ...item, startsAt: new Date(item.startsAt), endsAt: new Date(item.endsAt) };
                apptsInDb.push(saved);
                return saved;
              }),
              createQueryBuilder: jest.fn().mockReturnValue(qbMock),
            }),
          });
        }),
      },
    };

    contactsRepo = {
      findOne: jest.fn(async () => contactMock),
      save: jest.fn(async (c: any) => c),
    };

    servicesRepo = {
      findOne: jest.fn(async (query: any) => {
        const nameQuery = query?.where?.[0]?.name || query?.where?.name;
        if (nameQuery && /meditaci/i.test(nameQuery)) {
          return {
            id: 'svc-med-1',
            name: 'Meditaciones Guiadas',
            durationMinutes: 30,
            maxCapacity: 28,
            weeklySchedule: {
              2: ['09:15'],
              4: ['09:15'],
            },
          };
        }
        return {
          id: 'svc-hatha-1',
          name: 'Hatha Yoga Terapéutico (1 clase semanal)',
          durationMinutes: 90,
          maxCapacity: 20,
          weeklySchedule: {
            2: ['09:45', '11:15', '17:00', '18:30', '20:00'],
            4: ['09:45', '11:15', '16:00', '17:30', '19:00'],
          },
        };
      }),
      find: jest.fn(async () => []),
    };

    service = new AppointmentsService(
      appointmentsRepo,
      servicesRepo,
      contactsRepo,
      null as any, // conversationRepo
      { cancelBooking: jest.fn().mockResolvedValue({}) } as any, // calcom
      { emit: jest.fn() } as any, // eventEmitter
      null as any, // analizaIa
      {
        sendAppointmentDecisionEmail: jest.fn().mockResolvedValue({}),
        sendNotification: jest.fn().mockResolvedValue({}),
      } as any, // emailService
      null as any, // ycloudClient
      null as any, // agentsConfigService
      null as any, // messagesService
      { sendAppointmentDecisionSms: jest.fn().mockResolvedValue({}) } as any, // zadarmaSmsService
    );
  });

  it('cancels Tuesday appointment and creates Thursday appointment retaining free trial', async () => {
    // Thursday 17 Sep at 09:45 (07:45 UTC)
    const thursdayIso = '2026-09-17T07:45:00.000Z';

    const newAppt = await service.rescheduleAppointment(
      'appt-tuesday-1',
      thursdayIso,
      'Reprogramada por el usuario',
    );

    expect(newAppt).toBeDefined();
    expect(newAppt.startsAt).toEqual(new Date(thursdayIso));
    expect(newAppt.isFirstClass).toBe(true);

    // Verify Tuesday appt was cancelled
    const tuesday = apptsInDb.find((a) => a.id === 'appt-tuesday-1');
    expect(tuesday.status).toBe(AppointmentStatus.CANCELLED);
    expect(tuesday.cancelledBy).toBe('agent');
  });

  it('cancels Tuesday Meditación Guiada and creates Thursday Meditación retaining conditions', async () => {
    const tuesdayMed: Partial<Appointment> = {
      id: 'appt-med-tuesday',
      contactId: 'contact-test-1',
      contact: contactMock as Contact,
      service: 'Meditaciones Guiadas',
      calendarId: 'cal-meditacion',
      startsAt: new Date('2026-09-15T07:15:00.000Z'), // Tuesday 09:15 local (UTC+2)
      endsAt: new Date('2026-09-15T07:45:00.000Z'),
      status: AppointmentStatus.SCHEDULED,
      isFirstClass: false,
      price: '3.00',
      notes: 'Meditación guiada sesión suelta (3,00 €) o abono mensual (15,00 €/mes).',
    };
    apptsInDb.push(tuesdayMed);

    // Thursday 17 Sep at 09:15 local (07:15 UTC)
    const thursdayIso = '2026-09-17T07:15:00.000Z';

    const newAppt = await service.rescheduleAppointment(
      'appt-med-tuesday',
      thursdayIso,
      'Reprogramada al jueves por el alumno',
    );

    expect(newAppt).toBeDefined();
    expect(newAppt.startsAt).toEqual(new Date(thursdayIso));
    expect(newAppt.service).toBe('Meditaciones Guiadas');
    expect(newAppt.price).toBe('3.00');

    // Verify Tuesday med appt was cancelled
    const cancelledMed = apptsInDb.find((a) => a.id === 'appt-med-tuesday');
    expect(cancelledMed.status).toBe(AppointmentStatus.CANCELLED);
    expect(cancelledMed.cancelledBy).toBe('agent');
  });
});
