import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ContactsService } from './contacts.service';
import { Contact, ContactStatus } from '../common/entities/contact.entity';
import { PipelineStage } from './pipeline';
import { Appointment } from '../common/entities/appointment.entity';
import { EventEmitter2 } from '@nestjs/event-emitter';

describe('ContactsService - emailerroneo handling', () => {
  let service: ContactsService;
  let mockContactsRepo: any;
  let mockAppointmentsRepo: any;
  let mockEvents: any;

  beforeEach(async () => {
    mockContactsRepo = {
      findOne: jest.fn(),
      find: jest.fn(),
      save: jest.fn().mockImplementation((c) => Promise.resolve(c)),
      create: jest.fn().mockImplementation((dto) => dto),
      createQueryBuilder: jest.fn(),
    };
    mockAppointmentsRepo = {
      find: jest.fn().mockResolvedValue([]),
      save: jest.fn().mockImplementation((a) => Promise.resolve(a)),
    };
    mockEvents = {
      emit: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContactsService,
        { provide: getRepositoryToken(Contact), useValue: mockContactsRepo },
        { provide: getRepositoryToken(Appointment), useValue: mockAppointmentsRepo },
        { provide: EventEmitter2, useValue: mockEvents },
      ],
    }).compile();

    service = module.get<ContactsService>(ContactsService);
  });

  it('resets emailerroneo to N when a new email is updated', async () => {
    const existingContact: Partial<Contact> = {
      id: 'c-1',
      name: 'José Ignacio',
      phone: '+34646034231',
      email: 'bad-email@salvadora.com',
      emailerroneo: 'S',
      status: ContactStatus.ACTIVE,
      pipelineStage: PipelineStage.NEW,
    };

    mockContactsRepo.findOne.mockResolvedValue(existingContact);

    const updated = await service.update('c-1', {
      email: 'jigomezjub@gmail.com',
    });

    expect(updated.email).toBe('jigomezjub@gmail.com');
    expect(updated.emailerroneo).toBe('N');
  });

  it('preserves emailerroneo S if no email is passed in update', async () => {
    const existingContact: Partial<Contact> = {
      id: 'c-2',
      name: 'José Ignacio',
      phone: '+34646034231',
      email: 'bad-email@salvadora.com',
      emailerroneo: 'S',
      status: ContactStatus.ACTIVE,
      pipelineStage: PipelineStage.NEW,
    };

    mockContactsRepo.findOne.mockResolvedValue(existingContact);

    const updated = await service.update('c-2', {
      name: 'José Ignacio Gómez',
    });

    expect(updated.name).toBe('José Ignacio Gómez');
    expect(updated.emailerroneo).toBe('S');
  });

  it('detects isContactEmailErroneous correctly', async () => {
    mockContactsRepo.findOne.mockImplementation(({ where }: any) => {
      if (where?.id === 'c-err') {
        return Promise.resolve({ id: 'c-err', emailerroneo: 'S' });
      }
      if (where?.phone === '+34646034231') {
        return Promise.resolve({ id: 'c-err', phone: '+34646034231', emailerroneo: 'S' });
      }
      return Promise.resolve(null);
    });

    const isErrById = await service.isContactEmailErroneous('00000000-0000-0000-0000-000000000001');
    expect(isErrById).toBe(false);

    const isErrByPhone = await service.isContactEmailErroneous('+34646034231');
    expect(isErrByPhone).toBe(true);
  });
});
