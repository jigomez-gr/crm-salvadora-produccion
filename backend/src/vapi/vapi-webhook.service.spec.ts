import { VapiWebhookService } from './vapi-webhook.service';

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
      expect(response.results![0].result).toContain('Huecos disponibles');
      expect(response.results![0].result).toContain('[2026-09-03T08:00:00.000Z]');
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
                horaPreferida: '10:00',
              }),
            },
          },
        ],
      };

      const response = await service.handleWebhook(payload);

      expect(response.results).toBeDefined();
      expect(response.results?.length).toBe(1);
      expect(response.results![0].toolCallId).toBe('tc-888');
      expect(response.results![0].result).toContain('está disponible');
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
      expect(response.results![0].result).toContain('No hay sesiones de «Constelaciones Familiares» para esa fecha');
      expect(response.results![0].result).toContain('domingo 27 de septiembre');
    });
  });
});
