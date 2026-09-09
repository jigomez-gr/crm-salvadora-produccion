import { Test } from '@nestjs/testing';
import { SettingsService } from './settings.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AppSettings } from '../common/entities/app-settings.entity';
import { DataSource } from 'typeorm';
import { AgentsConfigService } from '../agents/agents-config.service';

describe('SettingsService - resetTestData', () => {
  let service: SettingsService;
  let dataSourceMock: any;

  beforeEach(async () => {
    const executedQueries: string[] = [];

    dataSourceMock = {
      transaction: jest.fn(async (cb: (m: any) => Promise<any>) => {
        const managerMock = {
          query: jest.fn(async (sql: string) => {
            executedQueries.push(sql);
            return [];
          }),
        };
        return cb(managerMock);
      }),
      query: jest.fn(async (sql: string) => {
        if (sql.includes('SELECT COUNT(*) FROM contacts')) {
          return [{ count: '15' }];
        }
        return [];
      }),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        SettingsService,
        {
          provide: getRepositoryToken(AppSettings),
          useValue: {
            find: jest.fn(),
            save: jest.fn(),
          },
        },
        {
          provide: DataSource,
          useValue: dataSourceMock,
        },
        {
          provide: AgentsConfigService,
          useValue: {},
        },
      ],
    }).compile();

    service = moduleRef.get<SettingsService>(SettingsService);
  });

  it('deletes contacts and deletes test data', async () => {
    const res = await service.resetTestData();

    expect(res).toEqual({
      ok: true,
      contactsReset: 15,
      deleted: {
        contacts: true,
        conversations: true,
        appointments: true,
        calls: true,
        auditLogs: true,
      },
    });

    expect(dataSourceMock.transaction).toHaveBeenCalled();
  });
});
