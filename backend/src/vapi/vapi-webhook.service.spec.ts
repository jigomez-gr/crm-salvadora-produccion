import { VapiWebhookService, normalizeSpokenEmail } from './vapi-webhook.service';

describe('VapiWebhookService', () => {
  let service: VapiWebhookService;
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

  beforeEach(() => {
    callsRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation((dto) => ({ id: 'call-1', ...dto })),
      save: jest.fn().mockImplementation((entity) => Promise.resolve(entity)),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };

    contactsRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation((dto) => ({ id: 'c-1', ...dto })),
      save: jest.fn().mockImplementation((entity) => Promise.resolve({ id: 'c-1', ...entity })),
    };

    appointmentsRepo = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
      save: jest.fn().mockImplementation((entity) => Promise.resolve(entity)),
    };

    servicesRepo = {
      find: jest.fn().mockResolvedValue([
        {
          id: 's-1',
          name: 'Hatha Yoga Terapéutico',
          durationMinutes: 60,
          price: 15,
          isActive: true,
          calendarId: 'default',
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
            { day: 6, open: '09:00', close: '15:00' },
          ],
        },
      ]),
    };

    settingsRepo = {
      find: jest.fn().mockResolvedValue([
        { businessName: 'Centro de Yoga Salvadora Conesa' },
      ]),
    };

    vapiAccountRepo = {
      findOne: jest.fn().mockResolvedValue(null),
    };

    appointmentsService = {
      getAvailableSlots: jest.fn().mockResolvedValue([
        {
          startsAt: new Date('2026-09-03T08:00:00.000Z'), // 10:00 in Europe/Madrid
          endsAt: new Date('2026-09-03T09:00:00.000Z'),
        },
        {
          startsAt: new Date('2026-09-03T15:00:00.000Z'), // 17:00 in Europe/Madrid
          endsAt: new Date('2026-09-03T16:00:00.000Z'),
        },
      ]),
      create: jest.fn().mockImplementation((dto) => Promise.resolve({
        id: 'appt-1',
        service: dto.service,
        startsAt: dto.startsAt,
        endsAt: dto.endsAt,
      })),
      update: jest.fn().mockResolvedValue({ id: 'appt-1' }),
      cancel: jest.fn().mockResolvedValue({ id: 'appt-1' }),
      sendAppointmentConfirmationNotification: jest.fn().mockResolvedValue(true),
    };

    contactsService = {};
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

  describe('VAPI tool-calls payload handling', () => {
    it('handles VAPI standard message.toolCallList format with consultar_huecos', async () => {
      const payload: any = {
        message: {
          type: 'tool-calls',
          call: {
            id: 'vapi-call-123',
            type: 'inboundPhoneCall',
            customer: { number: '+34600123456' },
          },
          toolCallList: [
            {
              id: 'tc-999',
              name: 'consultar_huecos',
              arguments: {
                servicio: 'Yoga',
                fechaPreferida: 'mañana',
                franja: 'manana',
              },
            },
          ],
        },
      };

      const response = await service.handleWebhook(payload);

      expect(response.results).toBeDefined();
      expect(response.results?.length).toBe(1);
      expect(response.results![0].toolCallId).toBe('tc-999');
      expect(response.results![0].result).toContain('calendario oficial');
      expect(response.results![0].result).toContain('[2026-09-03T15:00:00.000Z]');
    });

    it('handles root-level toolCalls format with preferred hour match', async () => {
      const payload: any = {
        type: 'tool-calls',
        call: {
          id: 'vapi-call-456',
        },
        toolCalls: [
          {
            id: 'tc-888',
            type: 'function',
            function: {
              name: 'consultar_huecos',
              arguments: JSON.stringify({
                servicio: 'Yoga',
                fechaPreferida: '2026-09-03',
                horaPreferida: '17:00',
              }),
            },
          },
        ],
      };

      const response = await service.handleWebhook(payload);

      expect(response.results).toBeDefined();
      expect(response.results?.length).toBe(1);
      expect(response.results![0].toolCallId).toBe('tc-888');
      expect(response.results![0].result).toContain('está disponible en el calendario oficial');
    });

    it('handles reservar_cita with flexible alias parameters', async () => {
      const payload: any = {
        message: {
          type: 'tool-calls',
          call: {
            id: 'vapi-call-789',
            customer: { number: '+34611222333' },
          },
          toolCallList: [
            {
              id: 'tc-777',
              name: 'reservar_cita',
              arguments: {
                inicioIso: '2026-09-03T07:45:00.000Z',
                servicio: 'Hatha Yoga Terapéutico',
                nombre: 'Carlos Santana',
              },
            },
          ],
        },
      };

      const response = await service.handleWebhook(payload);

      expect(response.results).toBeDefined();
      expect(response.results![0].toolCallId).toBe('tc-777');
      expect(response.results![0].result).toContain('¡Cita confirmada con éxito!');
      expect(appointmentsService.create).toHaveBeenCalled();
    });

    it('handles identificar_llamante correctly', async () => {
      contactsRepo.findOne.mockResolvedValue({
        id: 'contact-carlos',
        name: 'Carlos Santana',
        phone: '+34611222333',
      });

      const payload: any = {
        message: {
          type: 'tool-calls',
          call: {
            id: 'vapi-call-ident',
            customer: { number: '+34611222333' },
          },
          toolCallList: [
            {
              id: 'tc-ident',
              name: 'identificar_llamante',
              arguments: {},
            },
          ],
        },
      };

      const response = await service.handleWebhook(payload);

      expect(response.results![0].result).toContain('Carlos Santana');
      expect(response.results![0].result).toContain('Salúdale cordialmente');
    });

    it('handles Constelaciones Familiares fixed-date workshop availability correctly', async () => {
      const payload: any = {
        message: {
          type: 'tool-calls',
          call: { id: 'vapi-call-constel' },
          toolCallList: [
            {
              id: 'tc-constel-1',
              name: 'consultar_huecos',
              arguments: {
                servicio: 'Constelaciones Familiares',
              },
            },
          ],
        },
      };

      const response = await service.handleWebhook(payload);
      expect(response.results![0].result).toContain('domingo 27 de septiembre');
      expect(response.results![0].result).toContain('[2026-09-27T08:00:00.000Z]');
    });

    it('rejects random date for Constelaciones Familiares and informs of the real workshop date', async () => {
      const payload: any = {
        message: {
          type: 'tool-calls',
          call: { id: 'vapi-call-constel-tarde' },
          toolCallList: [
            {
              id: 'tc-constel-2',
              name: 'consultar_huecos',
              arguments: {
                servicio: 'Constelaciones Familiares',
                fechaPreferida: 'esta tarde',
              },
            },
          ],
        },
      };

      const response = await service.handleWebhook(payload);
      expect(response.results![0].result).toContain('no hay sesiones de «Constelaciones Familiares» para esa fecha');
      expect(response.results![0].result).toContain('domingo 27 de septiembre');
    });

    it('handles guardar_datos_contacto, saves email, and dispatches appointment confirmation email', async () => {
      contactsRepo.findOne.mockResolvedValue({
        id: 'contact-test-1',
        name: 'Jose Ignacio',
        phone: '+34699000999',
        email: null,
      });

      appointmentsRepo.findOne.mockResolvedValue({
        id: 'appt-recent-123',
        contactId: 'contact-test-1',
        service: 'Hatha Yoga Terapéutico',
        status: 'scheduled',
      });

      const payload: any = {
        message: {
          type: 'tool-calls',
          call: {
            id: 'vapi-call-save-email',
            customer: { number: '+34699000999' },
          },
          toolCallList: [
            {
              id: 'tc-save-email',
              name: 'guardar_datos_contacto',
              arguments: {
                email: 'jgomezjub@gmail.com',
              },
            },
          ],
        },
      };

      const response = await service.handleWebhook(payload);

      expect(contactsRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'contact-test-1',
          email: 'jgomezjub@gmail.com',
        }),
      );
      expect(appointmentsService.sendAppointmentConfirmationNotification).toHaveBeenCalledWith(
        'appt-recent-123',
        { email: true, whatsapp: false },
      );
      expect(response.results![0].result).toContain('jgomezjub@gmail.com');
      expect(response.results![0].result).toContain('se ha enviado la confirmación de la cita');
    });

    it('normalizeSpokenEmail normalizes spelled-out emails correctly', () => {
      expect(normalizeSpokenEmail('jota i g o m e z @ gmail . com')).toBe('jigomez@gmail.com');
      expect(normalizeSpokenEmail('j-i-g-o-m-e-z@gmail.com')).toBe('jigomez@gmail.com');
      expect(normalizeSpokenEmail('jota o ese e arroba hotmail punto com')).toBe('jose@hotmail.com');
      expect(normalizeSpokenEmail('jgomezjub@gmail.com')).toBe('jgomezjub@gmail.com');
      expect(normalizeSpokenEmail('  ana . martin @ yahoo . es  ')).toBe('ana.martin@yahoo.es');
    });

    it('reprogramar_cita rejects invalid non-official slots for Hatha Yoga', async () => {
      contactsRepo.findOne.mockResolvedValue({
        id: 'contact-test-1',
        name: 'Jose Ignacio',
        phone: '+34699000999',
      });

      appointmentsRepo.findOne.mockResolvedValue({
        id: 'appt-yoga-1',
        contactId: 'contact-test-1',
        service: 'Hatha Yoga Terapéutico',
        startsAt: new Date('2026-09-22T07:45:00.000Z'), // Martes 09:45
        endsAt: new Date('2026-09-22T09:15:00.000Z'),
        status: 'scheduled',
      });

      // Lunes 21 de Septiembre (día no oficial)
      const payload: any = {
        message: {
          type: 'tool-calls',
          call: { id: 'vapi-reprog-fail', customer: { number: '+34699000999' } },
          toolCallList: [
            {
              id: 'tc-reprog-1',
              name: 'reprogramar_cita',
              arguments: {
                nuevoInicioIso: '2026-09-21T07:45:00.000Z',
              },
            },
          ],
        },
      };

      const response = await service.handleWebhook(payload);
      expect(response.results![0].result).toContain('Ese horario no corresponde al calendario oficial');
    });

    it('reprogramar_cita successfully moves Yoga appointment to a valid official slot', async () => {
      contactsRepo.findOne.mockResolvedValue({
        id: 'contact-test-1',
        name: 'Jose Ignacio',
        phone: '+34699000999',
      });

      appointmentsRepo.findOne.mockResolvedValue({
        id: 'appt-yoga-1',
        contactId: 'contact-test-1',
        service: 'Hatha Yoga Terapéutico',
        startsAt: new Date('2026-09-22T07:45:00.000Z'), // Martes 09:45
        endsAt: new Date('2026-09-22T09:15:00.000Z'),
        status: 'scheduled',
      });

      appointmentsRepo.find.mockResolvedValue([]);

      // Jueves 24 de Septiembre a las 19:00 Madrid (17:00 UTC)
      const payload: any = {
        message: {
          type: 'tool-calls',
          call: { id: 'vapi-reprog-ok', customer: { number: '+34699000999' } },
          toolCallList: [
            {
              id: 'tc-reprog-2',
              name: 'reprogramar_cita',
              arguments: {
                nuevoInicioIso: '2026-09-24T17:00:00.000Z',
              },
            },
          ],
        },
      };

      const response = await service.handleWebhook(payload);
      expect(appointmentsService.update).toHaveBeenCalledWith(
        'appt-yoga-1',
        expect.objectContaining({
          startsAt: expect.any(String),
        }),
      );
      expect(response.results![0].result).toContain('Cita reprogramada con éxito');
    });

    it('anular_cita cancels yoga appointment and informs student about 3-month recovery window', async () => {
      contactsRepo.findOne.mockResolvedValue({
        id: 'contact-test-student',
        name: 'Ana Martin',
        phone: '+34699000999',
        isStudent: true,
      });

      appointmentsRepo.findOne.mockResolvedValue({
        id: 'appt-yoga-student',
        contactId: 'contact-test-student',
        service: 'Hatha Yoga Terapéutico',
        startsAt: new Date('2026-09-24T17:00:00.000Z'),
        endsAt: new Date('2026-09-24T18:30:00.000Z'),
        status: 'scheduled',
      });

      const payload: any = {
        message: {
          type: 'tool-calls',
          call: { id: 'vapi-cancel-ok', customer: { number: '+34699000999' } },
          toolCallList: [
            {
              id: 'tc-cancel-1',
              name: 'anular_cita',
              arguments: {
                motivo: 'Viaje de trabajo',
              },
            },
          ],
        },
      };

      const response = await service.handleWebhook(payload);
      expect(appointmentsService.cancel).toHaveBeenCalledWith(
        'appt-yoga-student',
        'agent',
        'Cancelada por teléfono: Viaje de trabajo',
      );
      expect(response.results![0].result).toContain('ha sido cancelada correctamente');
      expect(response.results![0].result).toContain('dispones de 3 meses para recuperar esta clase');
    });
  });
});
