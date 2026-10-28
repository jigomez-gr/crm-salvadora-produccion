import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import * as crypto from 'crypto';
import { ContactVerificationService } from './contact-verification.service';
import { Contact, ContactStatus } from '../common/entities/contact.entity';
import { ContactIdentityChange } from './entities/contact-identity-change.entity';
import { EmailService } from '../email/email.service';
import { ZadarmaSmsService } from '../sms/zadarma-sms.service';
import { YCloudClient } from '../whatsapp/ycloud-client.service';
import { AgentsConfigService } from '../agents/agents-config.service';

describe('ContactVerificationService', () => {
  let service: ContactVerificationService;
  let mockContactsRepo: any;
  let mockIdentityChangeRepo: any;
  let mockEmailService: any;
  let mockZadarmaSms: any;
  let mockYcloudClient: any;
  let mockAgentsConfigService: any;

  beforeEach(async () => {
    mockContactsRepo = {
      findOne: jest.fn(),
      save: jest.fn().mockImplementation((c) => Promise.resolve(c)),
      createQueryBuilder: jest.fn(),
    };

    mockIdentityChangeRepo = {
      create: jest.fn().mockImplementation((dto) => ({ id: 'change-uuid', ...dto })),
      save: jest.fn().mockImplementation((rec) => Promise.resolve(rec)),
      findOne: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
      createQueryBuilder: jest.fn().mockReturnValue({
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 1 }),
      }),
    };

    mockEmailService = {
      sendNotification: jest.fn().mockResolvedValue({ ok: true }),
    };

    mockZadarmaSms = {
      sendSms: jest.fn().mockResolvedValue({ success: true }),
    };

    mockYcloudClient = {
      sendTextMessage: jest.fn().mockResolvedValue({ ok: true }),
    };

    mockAgentsConfigService = {
      findByKeyOrNull: jest.fn().mockResolvedValue({
        whatsappPhoneNumber: '+34600000000',
        ycloudApiKey: 'test-key',
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContactVerificationService,
        { provide: getRepositoryToken(Contact), useValue: mockContactsRepo },
        { provide: getRepositoryToken(ContactIdentityChange), useValue: mockIdentityChangeRepo },
        { provide: EmailService, useValue: mockEmailService },
        { provide: ZadarmaSmsService, useValue: mockZadarmaSms },
        { provide: YCloudClient, useValue: mockYcloudClient },
        { provide: AgentsConfigService, useValue: mockAgentsConfigService },
      ],
    }).compile();

    service = module.get<ContactVerificationService>(ContactVerificationService);
  });

  describe('OTP Expiry and Generation (Strict 7 Minutes)', () => {
    it('should generate an OTP code valid for strictly 7 minutes (420 seconds)', async () => {
      const before = Date.now();
      const result = await service.sendOtp({
        destination: 'test@ejemplo.com',
        channel: 'email',
        changeType: 'email_error_recovery',
      });

      const after = Date.now();
      expect(result.success).toBe(true);
      expect(result.expiresAt).toBeDefined();

      const expiryDiffMs = result.expiresAt.getTime() - before;
      const expectedMs = 7 * 60 * 1000;
      // Allow minor execution drift (within 1 second)
      expect(expiryDiffMs).toBeGreaterThanOrEqual(expectedMs - 1000);
      expect(expiryDiffMs).toBeLessThanOrEqual(expectedMs + 1000);

      expect(mockEmailService.sendNotification).toHaveBeenCalledTimes(1);
    });

    it('should successfully verify a correct code within 7 minutes and set emailerroneo to N', async () => {
      const code = '654321';
      const codeHash = crypto.createHash('sha256').update(code).digest('hex');
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 min into the future (valid)

      const pendingRecord: any = {
        id: 'rec-1',
        destination: 'alumnos@salvadora.com',
        codeHash,
        status: 'pending',
        attempts: 0,
        expiresAt,
        contactId: 'contact-uuid-1',
        changeType: 'email_error_recovery',
      };

      mockIdentityChangeRepo.findOne.mockResolvedValue(pendingRecord);

      const contactMock: any = {
        id: 'contact-uuid-1',
        name: 'Maria Gomez',
        email: 'alumnos@salvadora.com',
        emailerroneo: 'S',
      };
      mockContactsRepo.findOne.mockResolvedValue(contactMock);

      const res = await service.verifyOtp({
        destination: 'alumnos@salvadora.com',
        code,
      });

      expect(res.verified).toBe(true);
      expect(pendingRecord.status).toBe('verified');
      expect(contactMock.emailerroneo).toBe('N');
      expect(mockContactsRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ emailerroneo: 'N' }),
      );
    });

    it('should reject and mark expired when verifying after 7 minutes', async () => {
      const code = '123456';
      const codeHash = crypto.createHash('sha256').update(code).digest('hex');
      const expiredDate = new Date(Date.now() - 10 * 1000); // 10 seconds expired

      const pendingRecord: any = {
        id: 'rec-2',
        destination: 'caducado@salvadora.com',
        codeHash,
        status: 'pending',
        attempts: 0,
        expiresAt: expiredDate,
      };

      mockIdentityChangeRepo.findOne.mockResolvedValue(pendingRecord);

      await expect(
        service.verifyOtp({
          destination: 'caducado@salvadora.com',
          code,
        }),
      ).rejects.toThrow(BadRequestException);

      expect(pendingRecord.status).toBe('expired');
    });

    it('should lock out after 3 incorrect attempts', async () => {
      const realCode = '112233';
      const codeHash = crypto.createHash('sha256').update(realCode).digest('hex');

      const pendingRecord: any = {
        id: 'rec-3',
        destination: '+34611223344',
        codeHash,
        status: 'pending',
        attempts: 2, // 2 prior failed attempts
        expiresAt: new Date(Date.now() + 4 * 60 * 1000),
      };

      mockIdentityChangeRepo.findOne.mockResolvedValue(pendingRecord);

      await expect(
        service.verifyOtp({
          destination: '+34611223344',
          code: '000000', // wrong code (3rd attempt)
        }),
      ).rejects.toThrow(BadRequestException);

      expect(pendingRecord.attempts).toBe(3);
      expect(pendingRecord.status).toBe('failed');
    });
  });

  describe('Identity Contradiction Detection', () => {
    it('should detect contradiction when phone matches an existing contact with a different email', async () => {
      const existing = {
        id: 'c1',
        name: 'Carlos Ruiz',
        phone: '+34600112233',
        email: 'carlos@original.com',
      };

      mockContactsRepo.createQueryBuilder.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        orWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(existing),
      });

      const res = await service.detectContradiction({
        phone: '+34600112233',
        email: 'otro_email@diferente.com',
        name: 'Carlos Ruiz',
      });

      expect(res.hasContradiction).toBe(true);
      expect(res.contradictoryFields).toContain('email');
    });

    it('should detect contradiction when phone matches but name is completely different', async () => {
      const existing = {
        id: 'c2',
        name: 'Lucia Sanchez',
        phone: '+34655443322',
        email: 'lucia@correo.com',
      };

      mockContactsRepo.createQueryBuilder.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        orWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(existing),
      });

      const res = await service.detectContradiction({
        phone: '+34655443322',
        name: 'Alberto Fernandez',
      });

      expect(res.hasContradiction).toBe(true);
      expect(res.contradictoryFields).toContain('name');
    });

    it('should return no contradiction when details match existing contact', async () => {
      const existing = {
        id: 'c3',
        name: 'Elena Ramos',
        phone: '+34699887766',
        email: 'elena@gmail.com',
      };

      mockContactsRepo.createQueryBuilder.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        orWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(existing),
      });

      const res = await service.detectContradiction({
        phone: '+34699887766',
        email: 'elena@gmail.com',
        name: 'Elena Ramos',
      });

      expect(res.hasContradiction).toBe(false);
    });
  });

  describe('markEmailAsErroneous', () => {
    it('should update contact.emailerroneo to S when delivery error detected', async () => {
      const contact: any = {
        id: 'c-err',
        email: 'fail@bad-domain.xyz',
        emailerroneo: 'N',
      };
      mockContactsRepo.findOne.mockResolvedValue(contact);

      await service.markEmailAsErroneous('c-err', 'SMTP 550 Mailbox not found');

      expect(contact.emailerroneo).toBe('S');
      expect(mockContactsRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ emailerroneo: 'S' }),
      );
    });
  });

  describe('Baja por Restricción Técnica (Email y Móvil con OTP)', () => {
    it('requests OTP and dispatches SMS for baja', async () => {
      mockContactsRepo.findOne.mockResolvedValue({
        id: 'c-baja',
        phone: '+34646000000',
        email: 'user@salvadora.com',
        bloqueado: 'N',
      });

      const res = await service.requestBajaRestriccionTecnica({
        email: 'user@salvadora.com',
        phone: '646 00 00 00',
      });

      expect(res.success).toBe(true);
      expect(mockZadarmaSms.sendSms).toHaveBeenCalled();
    });

    it('confirms OTP and sets bloqueado = S and optedOut = true', async () => {
      const plainCode = '888999';
      const codeHash = crypto.createHash('sha256').update(plainCode).digest('hex');

      mockIdentityChangeRepo.findOne.mockResolvedValue({
        id: 'change-baja',
        destination: '+34646000000',
        codeHash,
        status: 'pending',
        changeType: 'baja_restriccion_tecnica',
        contactId: 'c-baja',
        attempts: 0,
        expiresAt: new Date(Date.now() + 300000),
      });

      const contact: any = {
        id: 'c-baja',
        phone: '+34646000000',
        email: 'user@salvadora.com',
        bloqueado: 'N',
        optedOut: false,
      };
      mockContactsRepo.find = jest.fn().mockResolvedValue([contact]);
      mockContactsRepo.findOne.mockResolvedValue(contact);

      const res = await service.confirmBajaRestriccionTecnica({
        email: 'user@salvadora.com',
        phone: '+34646000000',
        code: plainCode,
      });

      expect(res.success).toBe(true);
      expect(res.bloqueado).toBe('S');
      expect(contact.bloqueado).toBe('S');
      expect(contact.optedOut).toBe(true);
      expect(mockContactsRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ bloqueado: 'S', optedOut: true }),
      );
    });
  });

  describe('Web Booking Verification (Anti-Fraud & Contact Registration)', () => {
    it('returns requiresOtp: false when a valid registered contact matches', async () => {
      mockContactsRepo.createQueryBuilder = jest.fn().mockReturnValue({
        where: jest.fn().mockReturnThis(),
        orWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue({
          id: 'c-valid',
          name: 'Maria Yoga',
          phone: '+34646111222',
          email: 'maria@salvadora.com',
          bloqueado: 'N',
          contactadowassap: 'S',
        }),
      });

      const res = await service.requestBookingVerification({
        name: 'Maria Yoga',
        phone: '646 11 12 22',
        email: 'maria@salvadora.com',
      });

      expect(res.requiresOtp).toBe(false);
      expect(res.isValidContact).toBe(true);
      expect(res.contactId).toBe('c-valid');
    });

    it('rejects when contact is blocked with BLOCKED_USER_MESSAGE', async () => {
      mockContactsRepo.createQueryBuilder = jest.fn().mockReturnValue({
        where: jest.fn().mockReturnThis(),
        orWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue({
          id: 'c-blocked',
          phone: '+34646111333',
          bloqueado: 'S',
        }),
      });

      await expect(
        service.requestBookingVerification({
          phone: '646 11 13 33',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('dispatches OTP via SMS and Email when contact is new/unknown', async () => {
      mockContactsRepo.createQueryBuilder = jest.fn().mockReturnValue({
        where: jest.fn().mockReturnThis(),
        orWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
      });

      const res = await service.requestBookingVerification({
        name: 'Nuevo Alumno',
        phone: '655 44 33 22',
        email: 'nuevo@ejemplo.com',
      });

      expect(res.requiresOtp).toBe(true);
      expect(res.isValidContact).toBe(false);
      expect(res.channel).toBe('sms');
      expect(mockZadarmaSms.sendSms).toHaveBeenCalled();
      expect(mockEmailService.sendNotification).toHaveBeenCalled();
    });

    it('dispatches OTP via WhatsApp when phone has contactadowassap === S but details contradict', async () => {
      mockContactsRepo.createQueryBuilder = jest.fn().mockReturnValue({
        where: jest.fn().mockReturnThis(),
        orWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue({
          id: 'c-wassap',
          name: 'Antiguo Nombre',
          phone: '+34646999888',
          email: 'antiguo@ejemplo.com',
          bloqueado: 'N',
          contactadowassap: 'S',
        }),
      });

      const res = await service.requestBookingVerification({
        name: 'Persona Totalmente Diferente',
        phone: '646 99 98 88',
        email: 'diferente@ejemplo.com',
      });

      expect(res.requiresOtp).toBe(true);
      expect(res.isValidContact).toBe(false);
      expect(res.channel).toBe('whatsapp');
    });

    it('fails confirmation if OTP code is wrong (no dejarle seguir)', async () => {
      mockIdentityChangeRepo.findOne.mockResolvedValue(null);

      await expect(
        service.confirmBookingVerification({
          phone: '655 44 33 22',
          code: '000000',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('confirms OTP and creates contact in CRM at that moment', async () => {
      const code = '777888';
      const codeHash = crypto.createHash('sha256').update(code).digest('hex');

      mockIdentityChangeRepo.findOne.mockResolvedValue({
        id: 'change-booking',
        destination: '+34655443322',
        codeHash,
        status: 'pending',
        changeType: 'web_booking_verification',
        attempts: 0,
        expiresAt: new Date(Date.now() + 300000),
      });

      mockContactsRepo.createQueryBuilder = jest.fn().mockReturnValue({
        where: jest.fn().mockReturnThis(),
        orWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
      });
      mockContactsRepo.findOne = jest.fn().mockResolvedValue(null);
      mockContactsRepo.create = jest.fn().mockImplementation((dto) => ({
        id: 'new-contact-id',
        ...dto,
      }));

      const res = await service.confirmBookingVerification({
        name: 'Nuevo Alumno Confirmado',
        phone: '655 44 33 22',
        email: 'nuevo@salvadora.com',
        code,
      });

      expect(res.verified).toBe(true);
      expect(res.contactId).toBe('new-contact-id');
      expect(mockContactsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          phone: '+34655443322',
          email: 'nuevo@salvadora.com',
          name: 'Nuevo Alumno Confirmado',
          source: 'landing_web',
          tags: expect.arrayContaining(['alta_web_verificada']),
        }),
      );
      expect(mockContactsRepo.save).toHaveBeenCalled();
    });
  });
});
