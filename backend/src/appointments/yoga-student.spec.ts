import { AppointmentStatus, PaymentStatus } from '../common/entities/appointment.entity';
import { ContactStatus } from '../common/entities/contact.entity';
import { PipelineStage } from '../contacts/pipeline';
import { AppointmentsService } from './appointments.service';
import { ContactsService } from '../contacts/contacts.service';

describe('Yoga Appointments & Student Lifecycle', () => {
  let appointmentsService: AppointmentsService;
  let contactsService: ContactsService;

  let inMemoryContacts: any[] = [];
  let inMemoryAppointments: any[] = [];

  const contactsRepoMock: any = {
    findOne: jest.fn().mockImplementation(({ where }) => {
      const found = inMemoryContacts.find((c) => c.id === where?.id || c.phone === where?.phone);
      return Promise.resolve(found ? { ...found } : null);
    }),
    save: jest.fn().mockImplementation((contact) => {
      const idx = inMemoryContacts.findIndex((c) => c.id === contact.id);
      if (idx >= 0) {
        inMemoryContacts[idx] = { ...contact };
      } else {
        inMemoryContacts.push({ ...contact });
      }
      return Promise.resolve({ ...contact });
    }),
    create: jest.fn().mockImplementation((dto) => ({
      id: 'contact-' + Math.random().toString(36).substring(2, 9),
      ...dto,
    })),
    query: jest.fn().mockResolvedValue([]),
  };

  const appointmentsRepoMock: any = {
    find: jest.fn().mockImplementation(({ where }) => {
      return Promise.resolve(
        inMemoryAppointments.filter((a) => {
          if (where?.contactId && a.contactId !== where.contactId) return false;
          if (where?.isRecovery !== undefined && Boolean(a.isRecovery) !== Boolean(where.isRecovery)) return false;
          if (where?.status) {
            if (typeof where.status === 'object' && where.status._type === 'in') {
              if (!where.status._value.includes(a.status)) return false;
            } else if (a.status !== where.status) {
              return false;
            }
          }
          if (where?.startsAt && where.startsAt._type === 'between') {
            const [from, to] = where.startsAt._value;
            const aTime = new Date(a.startsAt).getTime();
            if (aTime < new Date(from).getTime() || aTime > new Date(to).getTime()) return false;
          }
          return true;
        }),
      );
    }),
    findOne: jest.fn().mockImplementation(({ where }) => {
      return Promise.resolve(
        inMemoryAppointments.find((a) => {
          if (Array.isArray(where)) {
            return where.some((w) => {
              if (w.contactId && a.contactId !== w.contactId) return false;
              if (w.status && a.status !== w.status) return false;
              if (w.serviceId && a.serviceId !== w.serviceId) return false;
              if (w.calendarId && a.calendarId !== w.calendarId) return false;
              return true;
            });
          }
          if (where?.id && a.id !== where.id) return false;
          if (where?.contactId && a.contactId !== where.contactId) return false;
          if (where?.status && a.status !== where.status) return false;
          return true;
        }) || null,
      );
    }),
    save: jest.fn().mockImplementation((appt) => {
      const idx = inMemoryAppointments.findIndex((a) => a.id === appt.id);
      if (idx >= 0) {
        inMemoryAppointments[idx] = { ...appt };
      } else {
        inMemoryAppointments.push({ ...appt });
      }
      return Promise.resolve({ ...appt });
    }),
    create: jest.fn().mockImplementation((dto) => ({
      id: 'appt-' + Math.random().toString(36).substring(2, 9),
      ...dto,
    })),
    manager: {
      transaction: jest.fn().mockImplementation(async (cb) => {
        return cb(appointmentsRepoMock.manager);
      }),
      query: jest.fn().mockResolvedValue([]),
      getRepository: jest.fn().mockImplementation(() => appointmentsRepoMock),
    },
    createQueryBuilder: jest.fn().mockReturnValue({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(null),
      getCount: jest.fn().mockResolvedValue(0),
    }),
    query: jest.fn().mockResolvedValue([]),
  };

  const servicesRepoMock: any = {
    findOne: jest.fn().mockImplementation(({ where }) => {
      return Promise.resolve({
        id: 'svc-yoga-1',
        name: 'Hatha Yoga Terapéutico (1 clase semanal)',
        durationMinutes: 90,
        price: '25.00',
        calendarId: 'cal-hatha-yoga',
        maxCapacity: 20,
        weeklySchedule: {
          2: ['09:45', '11:15', '17:00', '18:30', '20:00'],
          3: ['20:15'],
          4: ['09:45', '11:15', '16:30', '17:30', '19:00'],
        },
      });
    }),
    find: jest.fn().mockResolvedValue([]),
  };

  const eventEmitterMock: any = {
    emit: jest.fn(),
  };

  const calcomServiceMock: any = {
    createBooking: jest.fn(),
  };

  beforeEach(() => {
    inMemoryContacts = [
      {
        id: 'contact-ana-1',
        name: 'Ana Martin',
        phone: '+34600111222',
        email: 'ana@example.com',
        status: ContactStatus.LEAD,
        pipelineStage: PipelineStage.NEW,
        tags: [],
        isStudent: false,
        studentModality: null,
      },
    ];
    inMemoryAppointments = [];

    appointmentsService = new AppointmentsService(
      appointmentsRepoMock,
      servicesRepoMock,
      contactsRepoMock,
      null as any, // conversationsRepo
      calcomServiceMock,
      eventEmitterMock,
      null as any, // analizaIaService
      null as any, // emailService
      null as any, // ycloudClient
      null as any, // agentsConfigService
      null as any, // messagesService
    );

    contactsService = new ContactsService(
      contactsRepoMock,
      appointmentsRepoMock,
      eventEmitterMock,
    );
  });

  it('reserva la primera cita para un no-alumno con isFirstClass=true y precio de clase suelta 10€', async () => {
    // Martes 8 de Septiembre de 2026 a las 09:45
    const startsAt = '2026-09-15T07:45:00.000Z';
    const endsAt = '2026-09-15T09:15:00.000Z';

    const appt = await appointmentsService.create({
      contactId: 'contact-ana-1',
      service: 'Hatha Yoga Terapéutico (1 clase semanal)',
      startsAt,
      endsAt,
    });

    expect(appt.isFirstClass).toBe(true);
    expect(appt.price).toBe('10.00');
    expect(appt.notes).toContain('Primera cita (10,00 €)');
  });

  it('al convertir al usuario en alumno, bonifica su primera cita a 0.00€ y actualiza el contacto', async () => {
    // 1. Crear primera cita
    const startsAt = '2026-09-15T07:45:00.000Z';
    const endsAt = '2026-09-15T09:15:00.000Z';

    const created = await appointmentsService.create({
      contactId: 'contact-ana-1',
      service: 'Hatha Yoga Terapéutico (1 clase semanal)',
      startsAt,
      endsAt,
    });
    expect(created.price).toBe('10.00');

    // 2. Convertir en alumno con modalidad 1 clase semanal
    const updatedContact = await contactsService.convertToStudent('contact-ana-1', '1_clase_semanal');

    expect(updatedContact.isStudent).toBe(true);
    expect(updatedContact.studentModality).toBe('1_clase_semanal');
    expect(updatedContact.studentEnrolledAt).toBeInstanceOf(Date);
    expect(updatedContact.tags).toContain('alumno');
    expect(updatedContact.status).toBe(ContactStatus.ACTIVE);

    // 3. Verificar que la primera cita se bonificó a 0€ y EXEMPT
    const apptInDb = inMemoryAppointments.find((a) => a.id === created.id);
    expect(apptInDb.price).toBe('0.00');
    expect(apptInDb.paymentStatus).toBe(PaymentStatus.EXEMPT);
    expect(apptInDb.paymentNotes).toContain('Primera clase gratuita por confirmación de alta como alumno');
  });

  it('las citas posteriores de un alumno se crean con precio 0.00€ e isFirstClass=false (cubiertas por cuota mensual)', async () => {
    // Convertir primero en alumno
    inMemoryContacts[0].isStudent = true;
    inMemoryContacts[0].studentModality = '1_clase_semanal';

    const startsAt = '2026-09-15T07:45:00.000Z';
    const endsAt = '2026-09-15T09:15:00.000Z';

    const appt = await appointmentsService.create({
      contactId: 'contact-ana-1',
      service: 'Hatha Yoga Terapéutico (1 clase semanal)',
      startsAt,
      endsAt,
    });

    expect(appt.isFirstClass).toBe(false);
    expect(appt.price).toBe('0.00');
    expect(appt.paymentStatus).toBe(PaymentStatus.EXEMPT);
    expect(appt.notes).toContain('Cuota mensual de alumno');
  });

  it('permite recuperar clases canceladas durante 3 meses y agendar una cita adicional de recuperación', async () => {
    // Alumno activo con 1 clase semanal
    inMemoryContacts[0].isStudent = true;
    inMemoryContacts[0].studentModality = '1_clase_semanal';

    // 1. Simular una cita de yoga cancelada hace 2 semanas
    const twoWeeksAgo = new Date('2026-09-01T07:45:00.000Z');
    inMemoryAppointments.push({
      id: 'appt-cancelled-1',
      contactId: 'contact-ana-1',
      service: 'Hatha Yoga Terapéutico (1 clase semanal)',
      startsAt: twoWeeksAgo,
      endsAt: new Date(twoWeeksAgo.getTime() + 90 * 60 * 1000),
      status: AppointmentStatus.CANCELLED,
      cancellationReason: 'Viaje imprevisto',
      isRecovery: false,
    });

    // 2. Comprobar que getAvailableYogaRecoveries reporta 1 clase disponible para recuperar
    const targetDate = new Date('2026-09-15T07:45:00.000Z');
    const recoveries = await appointmentsService.getAvailableYogaRecoveries('contact-ana-1', targetDate);
    expect(recoveries.availableCount).toBe(1);
    expect(recoveries.missedClasses.length).toBe(1);
    expect(recoveries.missedClasses[0].id).toBe('appt-cancelled-1');

    // 3. Agendar su clase habitual de la semana (Martes 15 Sep 09:45)
    await appointmentsService.create({
      contactId: 'contact-ana-1',
      service: 'Hatha Yoga Terapéutico (1 clase semanal)',
      startsAt: '2026-09-15T07:45:00.000Z',
      endsAt: '2026-09-15T09:15:00.000Z',
    });

    // 4. Intentar agendar una segunda clase normal en la misma semana sin ser recuperación debe fallar por cupo
    await expect(
      appointmentsService.create({
        contactId: 'contact-ana-1',
        service: 'Hatha Yoga Terapéutico (1 clase semanal)',
        startsAt: '2026-09-17T07:45:00.000Z', // Jueves 17 Sep 09:45
        endsAt: '2026-09-17T09:15:00.000Z',
      }),
    ).rejects.toThrow('Ya tienes una clase de Hatha Yoga agendada');

    // 5. Agendar esa segunda cita indicando isRecovery=true debe tener éxito y quedar bonificada
    const recoveryAppt = await appointmentsService.create({
      contactId: 'contact-ana-1',
      service: 'Hatha Yoga Terapéutico (1 clase semanal)',
      startsAt: '2026-09-17T07:45:00.000Z', // Jueves 17 Sep 09:45
      endsAt: '2026-09-17T09:15:00.000Z',
      isRecovery: true,
      recoveredFromAppointmentId: 'appt-cancelled-1',
    });

    expect(recoveryAppt.isRecovery).toBe(true);
    expect(recoveryAppt.price).toBe('0.00');
    expect(recoveryAppt.paymentStatus).toBe(PaymentStatus.EXEMPT);
    expect(recoveryAppt.notes).toContain('recuperación');

    // 6. Ahora que ya se usó la recuperación, el saldo disponible debe ser 0
    const updatedRecoveries = await appointmentsService.getAvailableYogaRecoveries('contact-ana-1', targetDate);
    expect(updatedRecoveries.availableCount).toBe(0);
  });

  it('generateWeeklyStudentAppointments autogenera las citas de la semana siguiente basándose en las preferencias', async () => {
    // Alumno activo con modalidad de 2 clases semanales
    inMemoryContacts[0].isStudent = true;
    inMemoryContacts[0].studentModality = '2_clases_semanales';

    // Mock find en contactsRepo para retornar lista de estudiantes activos
    contactsRepoMock.find = jest.fn().mockResolvedValue(inMemoryContacts);

    // Domingo 13 de Septiembre de 2026
    const sundayDate = new Date('2026-09-13T18:00:00.000Z');

    const result = await appointmentsService.generateWeeklyStudentAppointments(sundayDate);
    expect(result.studentsProcessed).toBe(1);
    expect(result.createdCount).toBe(2);
    expect(result.details[0].contactId).toBe('contact-ana-1');
    expect(result.details[0].apptIds.length).toBe(2);

    // Si se vuelve a ejecutar en el mismo rango, es idempotente y no crea duplicados
    const rerun = await appointmentsService.generateWeeklyStudentAppointments(sundayDate);
    expect(rerun.createdCount).toBe(0);
  });
});