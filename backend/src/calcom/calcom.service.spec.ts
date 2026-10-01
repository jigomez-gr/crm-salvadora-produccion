import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CalcomService } from './calcom.service';
import { CalcomAccount } from '../common/entities/calcom-account.entity';

describe('CalcomService (v2 integration)', () => {
  let service: CalcomService;
  let mockAccountRepo: any;

  beforeEach(async () => {
    mockAccountRepo = {
      find: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockImplementation((dto) => dto),
      save: jest.fn().mockImplementation((acc) => Promise.resolve(acc)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CalcomService,
        { provide: getRepositoryToken(CalcomAccount), useValue: mockAccountRepo },
      ],
    }).compile();

    service = module.get<CalcomService>(CalcomService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('normalizes base URLs to v2 correctly', () => {
    expect(service.getV2BaseUrl('https://api.cal.com/v1')).toBe('https://api.cal.com/v2');
    expect(service.getV2BaseUrl('https://api.cal.com/v1/')).toBe('https://api.cal.com/v2');
    expect(service.getV2BaseUrl('https://api.cal.com')).toBe('https://api.cal.com/v2');
    expect(service.getV2BaseUrl('https://api.cal.com/v2')).toBe('https://api.cal.com/v2');
    expect(service.getV2BaseUrl('')).toBe('https://api.cal.com/v2');
  });

  it('creates booking via Cal.com v2 API', async () => {
    const fakeAccount: Partial<CalcomAccount> = {
      apiKey: 'cal_live_test123',
      baseUrl: 'https://api.cal.com/v2',
      defaultEventTypeId: '4252426',
      enabled: true,
    };
    mockAccountRepo.find.mockResolvedValue([fakeAccount]);

    const fakeCalResponse = {
      status: 'success',
      data: {
        id: 998877,
        uid: 'cal-uid-12345',
        meetingUrl: 'https://app.cal.com/video/cal-uid-12345',
        status: 'accepted',
      },
    };

    const fetchSpy = jest.spyOn(global, 'fetch' as any).mockResolvedValue({
      ok: true,
      status: 201,
      json: jest.fn().mockResolvedValue(fakeCalResponse),
    } as any);

    const result = await service.createBooking({
      startsAt: new Date('2026-10-15T10:00:00.000Z'),
      endsAt: new Date('2026-10-15T11:00:00.000Z'),
      serviceName: 'Terapia Gestalt (Sesión Individual)',
      contact: {
        name: 'Cliente Prueba',
        phone: '+34646034231',
        email: 'test@example.com',
      },
      reason: 'Consulta inicial',
    });

    expect(result.bookingId).toBe('998877');
    expect(result.bookingUid).toBe('cal-uid-12345');
    expect(result.meetingUrl).toBe('https://app.cal.com/video/cal-uid-12345');
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const [calledUrl, calledOpts] = fetchSpy.mock.calls[0] as [string, any];
    expect(calledUrl).toBe('https://api.cal.com/v2/bookings');
    expect(calledOpts.method).toBe('POST');
    expect(calledOpts.headers['cal-api-version']).toBe('2024-08-13');
    expect(calledOpts.headers['Authorization']).toBe('Bearer cal_live_test123');

    const body = JSON.parse(calledOpts.body);
    expect(body.eventTypeId).toBe(4252426);
    expect(body.attendee.name).toBe('Cliente Prueba');
    expect(body.attendee.email).toBe('test@example.com');
    expect(body.attendee.phoneNumber).toBe('+34646034231');
  });

  it('cancels booking via POST /v2/bookings/:uid/cancel', async () => {
    const fakeAccount: Partial<CalcomAccount> = {
      apiKey: 'cal_live_test123',
      baseUrl: 'https://api.cal.com/v2',
      enabled: true,
    };
    mockAccountRepo.find.mockResolvedValue([fakeAccount]);

    const fetchSpy = jest.spyOn(global, 'fetch' as any).mockResolvedValue({
      ok: true,
      status: 200,
    } as any);

    const success = await service.cancelBooking('uid-xyz-789', 'Cancelado por usuario');
    expect(success).toBe(true);

    const [calledUrl, calledOpts] = fetchSpy.mock.calls[0] as [string, any];
    expect(calledUrl).toBe('https://api.cal.com/v2/bookings/uid-xyz-789/cancel');
    expect(calledOpts.method).toBe('POST');
    expect(calledOpts.headers['cal-api-version']).toBe('2024-08-13');
  });

  it('tests connection via GET /v2/me', async () => {
    const fakeAccount: Partial<CalcomAccount> = {
      apiKey: 'cal_live_test123',
      baseUrl: 'https://api.cal.com/v2',
      enabled: true,
    };
    mockAccountRepo.find.mockResolvedValue([fakeAccount]);

    const fetchSpy = jest.spyOn(global, 'fetch' as any).mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({
        status: 'success',
        data: {
          name: 'Salvadora Conesa',
          email: 'salvadora@example.com',
          username: 'salvadora',
        },
      }),
    } as any);

    const result = await service.testConnection();
    expect(result.success).toBe(true);
    expect(result.message).toContain('Salvadora Conesa');

    const [calledUrl, calledOpts] = fetchSpy.mock.calls[0] as [string, any];
    expect(calledUrl).toBe('https://api.cal.com/v2/me');
    expect(calledOpts.headers['cal-api-version']).toBe('2024-08-13');
  });
});
