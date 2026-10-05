import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ContactsService } from './contacts.service';
import { Contact, ContactStatus } from '../common/entities/contact.entity';
import { Appointment } from '../common/entities/appointment.entity';

describe('ContactsService - Search & List Enhancements', () => {
  let service: ContactsService;
  let mockContactsRepo: any;
  let mockAppointmentsRepo: any;
  let mockEventEmitter: any;

  beforeEach(async () => {
    const qbMock: any = {
      orderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([
        [
          {
            id: 'c1',
            name: 'Óscar Gómez Llorente',
            phone: '+34630680794',
            email: 'oscar@example.com',
            tags: ['yoga'],
            status: ContactStatus.ACTIVE,
          },
        ],
        1,
      ]),
    };

    mockContactsRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(qbMock),
      findOne: jest.fn(),
      save: jest.fn(),
    };

    mockAppointmentsRepo = {
      findOne: jest.fn(),
    };

    mockEventEmitter = {
      emit: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContactsService,
        { provide: getRepositoryToken(Contact), useValue: mockContactsRepo },
        { provide: getRepositoryToken(Appointment), useValue: mockAppointmentsRepo },
        { provide: EventEmitter2, useValue: mockEventEmitter },
      ],
    }).compile();

    service = module.get<ContactsService>(ContactsService);
  });

  it('searches with multi-token name fragments and accents', async () => {
    const result = await service.list({
      limit: 10,
      offset: 0,
      search: 'oscar llorente',
    });

    expect(result.total).toBe(1);
    expect(mockContactsRepo.createQueryBuilder).toHaveBeenCalledWith('c');
  });

  it('searches with formatted phone containing spaces', async () => {
    const result = await service.list({
      limit: 10,
      offset: 0,
      search: '630 68 07 94',
    });

    expect(result.total).toBe(1);
  });

  it('supports explicit email, phone, and name filters', async () => {
    const result = await service.list({
      limit: 10,
      offset: 0,
      email: 'oscar@example.com',
      phone: '630680794',
      name: 'Óscar',
    });

    expect(result.total).toBe(1);
  });
});
