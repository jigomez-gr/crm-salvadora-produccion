import { ZadarmaSmsService } from './zadarma-sms.service';
import * as crypto from 'crypto';

describe('ZadarmaSmsService', () => {
  let service: ZadarmaSmsService;
  let mockSmsLogRepo: any;
  let mockVapiAccountRepo: any;

  beforeEach(() => {
    mockSmsLogRepo = {
      create: jest.fn((data) => ({ id: 101, ...data })),
      save: jest.fn(async (entry) => entry),
      find: jest.fn(async () => []),
    };

    mockVapiAccountRepo = {
      findOne: jest.fn(async () => ({
        zadarmaApiKey: 'test-key-123',
        zadarmaApiSecret: 'test-secret-456',
        zadarmaSenderId: 'Salvadora',
        zadarmaSmsEnabled: true,
      })),
      save: jest.fn(async (acc) => acc),
    };

    service = new ZadarmaSmsService(mockSmsLogRepo, mockVapiAccountRepo);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('generateAuthHeader', () => {
    it('should correctly sort parameters, compute MD5 and HMAC-SHA1 signature in base64', () => {
      const apiKey = 'test_key';
      const apiSecret = 'test_secret';
      const methodPath = '/v1/sms/send/';
      const params = {
        number: '34611223344',
        message: 'Hola Mundo',
      };

      const { authHeader, queryString } = service.generateAuthHeader(
        apiKey,
        apiSecret,
        methodPath,
        params,
      );

      // 1. Check alphabetical order
      expect(queryString).toBe('message=Hola+Mundo&number=34611223344');

      // 2. Compute independently to verify exact match
      const md5 = crypto.createHash('md5').update(queryString).digest('hex');
      const toSign = `${methodPath}${queryString}${md5}`;
      const hmacHex = crypto.createHmac('sha1', apiSecret).update(toSign).digest('hex');
      const expectedSig = Buffer.from(hmacHex).toString('base64');

      expect(authHeader).toBe(`${apiKey}:${expectedSig}`);
    });
  });

  describe('sendSms', () => {
    it('should clean phone number, send HTTP request with proper auth and log success', async () => {
      const mockSuccessResponse = {
        status: 'success',
        messages: 1,
        cost: '0.045',
        currency: 'EUR',
        sms_detalization: [
          {
            callerid: 'Salvadora',
            cost: 0.045,
            cost_min: 0.045,
            cost_max: 0.045,
            parts: 1,
          },
        ],
      };

      // Mock global fetch
      const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify(mockSuccessResponse),
      } as any);

      const result = await service.sendSms({
        number: '+34 611 22 33 44',
        message: 'Tu cita está confirmada',
        contactId: 'c1111111-1111-1111-1111-111111111111',
        appointmentId: 'a2222222-2222-2222-2222-222222222222',
      });

      expect(result.success).toBe(true);
      expect(result.cost).toBe(0.045);
      expect(result.currency).toBe('EUR');

      // Verify fetch was called with cleaned number (no + or spaces)
      expect(fetchSpy).toHaveBeenCalled();
      const [calledUrl, calledOptions] = fetchSpy.mock.calls[0];
      expect(calledUrl).toBe('https://api.zadarma.com/v1/sms/send/');
      expect((calledOptions as any).headers['Authorization']).toMatch(/^test-key-123:/);
      expect((calledOptions as any).body).toContain('number=34611223344');

      // Verify DB logging
      expect(mockSmsLogRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'success',
          phone: '34611223344',
          cost: 0.045,
          contactId: 'c1111111-1111-1111-1111-111111111111',
          appointmentId: 'a2222222-2222-2222-2222-222222222222',
        }),
      );
      expect(mockSmsLogRepo.save).toHaveBeenCalled();
    });

    it('should skip dispatch when zadarmaSmsEnabled is false', async () => {
      mockVapiAccountRepo.findOne.mockResolvedValueOnce({
        zadarmaApiKey: 'test-key',
        zadarmaApiSecret: 'test-secret',
        zadarmaSmsEnabled: false,
      });

      const fetchSpy = jest.spyOn(global, 'fetch');

      const result = await service.sendSms({
        number: '34611223344',
        message: 'Hola',
      });

      expect(result.success).toBe(false);
      expect(result.status).toBe('disabled');
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('should handle API error gracefully and record error log in DB', async () => {
      const mockErrorResponse = {
        status: 'error',
        message: 'Insufficient funds on balance',
      };

      jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => JSON.stringify(mockErrorResponse),
      } as any);

      const result = await service.sendSms({
        number: '34611223344',
        message: 'Hola',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Insufficient funds');
      expect(mockSmsLogRepo.save).toHaveBeenCalled();
    });
  });
});
