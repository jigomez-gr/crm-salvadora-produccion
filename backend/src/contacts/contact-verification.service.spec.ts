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
});
