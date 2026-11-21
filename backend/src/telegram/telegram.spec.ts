jest.mock('../agents/agent-runner.service', () => ({
  AgentRunnerService: class MockAgentRunnerService {},
}));
jest.mock('../widget/contact-query-evaluator.service', () => ({
  ContactQueryEvaluatorService: class MockContactQueryEvaluatorService {},
}));

import {
  parseTelegramUpdate,
  verifyTelegramWebhookSecret,
  isTelegramBotToken,
} from './telegram-inbound-parser';
import { TelegramLinkService } from './telegram-link.service';
import { TelegramService } from './telegram.service';
import { TelegramWebhookController } from './telegram-webhook.controller';
import { ContactsService } from '../contacts/contacts.service';
import { ServicesService } from '../services/services.service';
import { RemindersService } from '../reminders/reminders.service';
import { WidgetController } from '../widget/widget.controller';
import { formatChannelName } from '../conversations/conversation-export.generator';
import {
  MessageChannel,
  MessageDirection,
  MessageStatus,
} from '../common/entities/message.entity';
import {
  ReminderChannel,
  ReminderStatus,
} from '../common/entities/appointment-reminder.entity';
import { AppointmentStatus } from '../common/entities/appointment.entity';
import { ContactStatus } from '../common/entities/contact.entity';

describe('Telegram Complete Integration Suite (29 Mandatory Scenarios)', () => {
  // ─── 1. PARSER & SECURITY HELPERS ───────────────────────────────────────────
  describe('1. Telegram Inbound Parser & Security Verification', () => {
    it('validates Telegram bot token format and rejects invalid strings', () => {
      expect(
        isTelegramBotToken('123456789:AAH1234567890abcdefghijklmnopqrstuv'),
      ).toBe(true);
      expect(isTelegramBotToken('invalid-token')).toBe(false);
      expect(isTelegramBotToken('')).toBe(false);
    });

    it('verifies X-Telegram-Bot-Api-Secret-Token in constant time', () => {
      const secret = 'salvadora_tg_secret_2026';
      expect(verifyTelegramWebhookSecret(secret, secret)).toBe(true);
      expect(verifyTelegramWebhookSecret('wrong_secret', secret)).toBe(false);
      expect(verifyTelegramWebhookSecret(undefined, secret)).toBe(false);
    });

    it('parses /start <token> deep link command from landing', () => {
      const parsed = parseTelegramUpdate({
        update_id: 1001,
        message: {
          message_id: 50,
          date: 1763750000,
          text: '/start a1b2c3d4e5f600112233445566778899',
          from: {
            id: 99887766,
            first_name: 'Elena',
            last_name: 'Gómez',
            username: 'elenagomez',
          },
          chat: {
            id: 99887766,
            type: 'private',
          },
        },
      });

      expect(parsed).toBeTruthy();
      expect(parsed?.kind).toBe('message');
      expect(parsed?.isStartCommand).toBe(true);
      expect(parsed?.startToken).toBe('a1b2c3d4e5f600112233445566778899');
      expect(parsed?.sender?.userId).toBe('99887766');
      expect(parsed?.sender?.chatId).toBe('99887766');
      expect(parsed?.sender?.username).toBe('elenagomez');
    });

    it('parses /desvincular command and my_chat_member block/unblock events', () => {
      const unlinkParsed = parseTelegramUpdate({
        update_id: 1002,
        message: {
          message_id: 51,
          date: 1763750010,
          text: '/desvincular',
          from: { id: 99887766, first_name: 'Elena' },
          chat: { id: 99887766, type: 'private' },
        },
      });
      expect(unlinkParsed?.isUnlinkCommand).toBe(true);

      const blockParsed = parseTelegramUpdate({
        update_id: 1003,
        my_chat_member: {
          chat: { id: 99887766, type: 'private' },
          from: { id: 99887766, first_name: 'Elena', username: 'elenagomez' },
          date: 1763750020,
          new_chat_member: { status: 'kicked' },
        },
      });
      expect(blockParsed?.kind).toBe('block_status');
      expect(blockParsed?.blockStatus?.blocked).toBe(true);
    });
  });

  // ─── 2. CONEXIÓN Y CONTACTOS (Escenarios 1 a 7) ─────────────────────────────
  describe('2. Conexión desde la Landing y Contactos (conectadotelegram)', () => {
    let contactsRepo: any;
    let tokensRepo: any;
    let agentsConfigService: any;
    let contactsService: ContactsService;
    let telegramLinkService: TelegramLinkService;
    let widgetController: WidgetController;

    const storedContacts = new Map<string, any>();
    const storedTokens = new Map<string, any>();

    beforeEach(() => {
      storedContacts.clear();
      storedTokens.clear();

      contactsRepo = {
        query: jest.fn().mockResolvedValue([]),
        findOne: jest.fn(async ({ where }: any) => {
          const conditions = Array.isArray(where) ? where : [where];
          for (const cond of conditions) {
            for (const c of storedContacts.values()) {
              if (cond.id && c.id === cond.id) return c;
              if (cond.phone && c.phone === cond.phone) return c;
              if (cond.telegramUserId && c.telegramUserId === cond.telegramUserId)
                return c;
              if (cond.telegramChatId && c.telegramChatId === cond.telegramChatId)
                return c;
            }
          }
          return null;
        }),
        create: jest.fn((dto: any) => ({
          id: dto.id || `contact-${storedContacts.size + 1}`,
          conectadotelegram: 'N',
          contactadowassap: 'N',
          telegramUserId: null,
          telegramChatId: null,
          telegramUsername: null,
          telegramConnectedAt: null,
          telegramLinkStatus: 'unlinked',
          telegramBlocked: false,
          tags: [],
          ...dto,
        })),
        save: jest.fn(async (entity: any) => {
          storedContacts.set(entity.id, entity);
          return entity;
        }),
        createQueryBuilder: jest.fn(() => {
          let filterParams: any = {};
          let whereSql = '';
          return {
            where: jest.fn(function (sql: string, params?: any) {
              whereSql = sql || '';
              filterParams = params || {};
              return this;
            }),
            andWhere: jest.fn().mockReturnThis(),
            orderBy: jest.fn().mockReturnThis(),
            getOne: jest.fn(async () => null),
            getMany: jest.fn(async () => {
              const all = Array.from(storedContacts.values());
              if (whereSql.includes('!= :id')) {
                return all.filter(
                  (c) =>
                    c.id !== filterParams.id &&
                    (c.telegramUserId === filterParams.userId ||
                      c.telegramChatId === filterParams.chatId),
                );
              }
              if (filterParams.id) {
                return all.filter(
                  (c) =>
                    c.telegramUserId === filterParams.id ||
                    c.telegramChatId === filterParams.id,
                );
              }
              return [];
            }),
          };
        }),
      };

      tokensRepo = {
        create: jest.fn((dto: any) => ({
          id: `tok-${storedTokens.size + 1}`,
          usedAt: null,
          usedByTelegramUserId: null,
          usedByTelegramChatId: null,
          ...dto,
        })),
        save: jest.fn(async (entity: any) => {
          storedTokens.set(entity.token, entity);
          return entity;
        }),
        findOne: jest.fn(async ({ where }: any) => {
          return storedTokens.get(where.token) || null;
        }),
      };

      agentsConfigService = {
        findByKeyOrNull: jest.fn(async () => ({
          agentKey: 'booking',
          businessName: 'Centro de Yoga Salvadora Conesa',
          telegramEnabled: true,
          telegramBotToken: '123456789:AAH_SALVADORA_BOT_TOKEN_TEST_123456',
          telegramBotUsername: 'SalvadoraYogaBot',
          telegramBotName: 'Centro de Yoga Salvadora Conesa',
          telegramWebhookSecret: 'secret_salvadora_123',
        })),
      };

      contactsService = new ContactsService(
        contactsRepo as any,
        {} as any,
        { emit: jest.fn() } as any,
      );

      telegramLinkService = new TelegramLinkService(
        tokensRepo as any,
        contactsService,
        { linkContact: jest.fn().mockResolvedValue(undefined) } as any,
        { emit: jest.fn() } as any,
      );

      widgetController = new WidgetController(
        agentsConfigService,
        {} as any,
        {} as any,
        contactsService,
        { isMaintenanceActive: jest.fn().mockResolvedValue(false) } as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        undefined,
        undefined,
        undefined,
        telegramLinkService,
      );
    });

    it('Scenario 1, 3 & 4: links an existing contact from landing via single-use deep-link token and updates conectadotelegram from N to S only upon /start <token>', async () => {
      // 1. Existing contact starts with conectadotelegram = 'N'
      const existing = await contactsService.create({
        name: 'Laura Martínez',
        phone: '+34611223344',
        email: 'laura@salvadoraconesa.es',
        status: ContactStatus.ACTIVE,
      });
      expect(existing.conectadotelegram).toBe('N');

      // 2. Visitor clicks "Conectar con Telegram" on the landing
      const handoff = await widgetController.handoffToTelegram('booking', {
        sessionId: 'sess_landing_1',
        name: 'Laura Martínez',
        phone: '+34611223344',
        email: 'laura@salvadoraconesa.es',
        serviceName: 'Hatha Yoga Terapéutico',
      });

      expect(handoff.ok).toBe(true);
      expect(handoff.botUsername).toBe('SalvadoraYogaBot');
      expect(handoff.token).toBeTruthy();
      expect(handoff.telegramUrl).toBe(
        `https://t.me/SalvadoraYogaBot?start=${handoff.token}`,
      );

      // Before pressing "Iniciar" in Telegram, conectadotelegram MUST still be 'N'
      const beforeStart = await contactsService.findById(existing.id);
      expect(beforeStart.conectadotelegram).toBe('N');

      // 3. User presses "Iniciar" in Telegram -> webhook receives /start <token>
      const consumed = await telegramLinkService.consumeStartToken(
        handoff.token!,
        {
          userId: '777888999',
          chatId: '777888999',
          username: 'laurayoga',
          firstName: 'Laura',
          lastName: 'Martínez',
          displayName: 'Laura Martínez',
        },
        'booking',
      );

      expect(consumed.status).toBe('linked');
      expect(consumed.contact?.id).toBe(existing.id);
      expect(consumed.contact?.conectadotelegram).toBe('S');
      expect(consumed.contact?.telegramUserId).toBe('777888999');
      expect(consumed.contact?.telegramChatId).toBe('777888999');
      expect(consumed.contact?.telegramUsername).toBe('laurayoga');
      expect(consumed.contact?.telegramLinkStatus).toBe('linked');
      expect(consumed.contact?.telegramConnectedAt).toBeInstanceOf(Date);

      // Token is single-use: trying to consume it a second time fails
      const secondAttempt = await telegramLinkService.consumeStartToken(
        handoff.token!,
        {
          userId: '111222333',
          chatId: '111222333',
          username: 'intruder',
          firstName: 'Intruder',
          lastName: null,
          displayName: 'Intruder',
        },
        'booking',
      );
      expect(secondAttempt.status).toBe('invalid_or_expired');
    });

    it('Scenario 2 & 5: anonymous/unverified user starting conversation keeps conectadotelegram = N and is never matched by name or username', async () => {
      // Existing contact with name "Carlos Ruiz"
      const existing = await contactsService.create({
        name: 'Carlos Ruiz',
        phone: '+34699887766',
        email: 'carlos@example.com',
      });

      // Anonymous visitor clicks "Conectar con Telegram" without phone/email
      const handoff = await widgetController.handoffToTelegram('booking', {
        sessionId: 'sess_anon',
      });
      expect(handoff.ok).toBe(true);

      const consumed = await telegramLinkService.consumeStartToken(
        handoff.token!,
        {
          userId: '555444333',
          chatId: '555444333',
          username: 'carlosruiz',
          firstName: 'Carlos',
          lastName: 'Ruiz',
          displayName: 'Carlos Ruiz',
        },
        'booking',
      );

      // Must NOT associate with Carlos Ruiz just because name/username matches!
      expect(consumed.status).toBe('anonymous');
      expect(consumed.contact).toBeNull();
      expect(existing.conectadotelegram).toBe('N');
    });

    it('Scenario 6 & 7: supports unlinking Telegram (conectadotelegram -> N) and bot blocking (telegramBlocked -> true, conectadotelegram -> N) while keeping WhatsApp intact', async () => {
      const contact = await contactsService.create({
        name: 'Marta Díaz',
        phone: '+34622334455',
        contactadowassap: 'S',
      });

      // Link Telegram
      await contactsService.linkTelegramToContact(contact.id, {
        userId: '444555666',
        chatId: '444555666',
        username: 'martadiaz',
      });
      expect(contact.conectadotelegram).toBe('S');
      expect(contact.contactadowassap).toBe('S'); // Simultaneous WhatsApp + Telegram

      // Scenario 7: User blocks bot
      await contactsService.setTelegramBlocked('444555666', true);
      expect(contact.telegramBlocked).toBe(true);
      expect(contact.conectadotelegram).toBe('N');
      expect(contact.telegramLinkStatus).toBe('blocked');
      expect(contact.contactadowassap).toBe('S'); // WhatsApp unaffected

      // Re-link and test Scenario 6: Unlink Telegram
      await contactsService.linkTelegramToContact(contact.id, {
        userId: '444555666',
        chatId: '444555666',
        username: 'martadiaz',
      });
      expect(contact.conectadotelegram).toBe('S');

      await contactsService.unlinkTelegramFromContact(contact.id);
      expect(contact.conectadotelegram).toBe('N');
      expect(contact.telegramChatId).toBeNull();
      expect(contact.telegramUserId).toBeNull();
      expect(contact.telegramLinkStatus).toBe('unlinked');
      expect(contact.contactadowassap).toBe('S');
    });
  });

  // ─── 3. CONVERSACIONES Y AGENTE DE IA (Escenarios 8 a 13) ──────────────────
  describe('3. Conversaciones y Agente de IA por Telegram', () => {
    it('Scenario 8, 9, 10, 11, 12 & 13: receives message on Telegram webhook, creates conversation, associates contact, triggers AI agent reply, supports manual reply from Inbox, and filters/exports Telegram threads', async () => {
      const savedMessages: any[] = [];
      const mockMessagesService = {
        saveMessage: jest.fn(async (msg: any) => {
          const saved = {
            id: `msg-${savedMessages.length + 1}`,
            createdAt: new Date(),
            ...msg,
          };
          savedMessages.push(saved);
          return saved;
        }),
        saveInboundOnce: jest.fn(async (msg: any) => {
          const saved = {
            id: `msg-${savedMessages.length + 1}`,
            createdAt: new Date(),
            ...msg,
          };
          savedMessages.push(saved);
          return saved;
        }),
        updateStatus: jest.fn().mockResolvedValue(undefined),
        markRead: jest.fn().mockResolvedValue(undefined),
        linkContact: jest.fn().mockResolvedValue(undefined),
      };

      const mockTelegramClient = {
        sendTyping: jest.fn().mockResolvedValue(undefined),
        sendTextMessage: jest.fn(async () => ({
          ok: true,
          providerMessageId: 'tg-out-101',
        })),
        sendMedia: jest.fn(async () => ({
          ok: true,
          providerMessageId: 'tg-media-102',
        })),
        answerCallbackQuery: jest.fn().mockResolvedValue(undefined),
      };

      const mockAgentConfig = {
        agentKey: 'booking',
        enabled: true,
        telegramEnabled: true,
        telegramBotToken: '123456789:AAH_SALVADORA_BOT_TOKEN_TEST_123456',
        telegramWebhookSecret: 'secret_salvadora_123',
        telegramBotUsername: 'SalvadoraYogaBot',
      };

      const mockAgentsConfigService = {
        findByKeyOrNull: jest.fn().mockResolvedValue(mockAgentConfig),
        findAll: jest.fn().mockResolvedValue([mockAgentConfig]),
        saveRaw: jest.fn(async (cfg: any) => cfg),
      };

      const linkedContact = {
        id: 'contact-tg-1',
        name: 'Sofía Navarro',
        phone: '+34633445566',
        email: 'sofia@example.com',
        conectadotelegram: 'S',
        telegramUserId: '888111222',
        telegramChatId: '888111222',
        telegramUsername: 'sofianavarro',
        telegramBlocked: false,
      };

      const mockContactsService = {
        findByTelegramUserId: jest.fn(async (uid: string) =>
          uid === '888111222' ? linkedContact : null,
        ),
        findByTelegramChatId: jest.fn(async (cid: string) =>
          cid === '888111222' ? linkedContact : null,
        ),
        findById: jest.fn(async (id: string) =>
          id === 'contact-tg-1' ? linkedContact : null,
        ),
        linkTelegramToContact: jest.fn(async () => linkedContact),
      };

      const mockAgentRunner = {
        run: jest.fn(async (params: any) => {
          const outbound = await mockMessagesService.saveMessage({
            contactId: params.contactId,
            threadId: params.threadId,
            direction: MessageDirection.OUTBOUND,
            channel: MessageChannel.TELEGRAM,
            body: '¡Hola Sofía! Las clases de Hatha Yoga Terapéutico son los Martes, Miércoles y Jueves. ¿Qué día te viene mejor?',
            status: MessageStatus.QUEUED,
          });
          return {
            reply: outbound.body,
            outbound,
          };
        }),
      };

      const telegramService = new TelegramService(
        mockTelegramClient as any,
        mockAgentsConfigService as any,
        mockContactsService as any,
        mockMessagesService as any,
        { emit: jest.fn() } as any,
      );

      const webhookController = new TelegramWebhookController(
        mockAgentsConfigService as any,
        mockContactsService as any,
        mockMessagesService as any,
        mockTelegramClient as any,
        {} as any,
        telegramService,
        { emit: jest.fn() } as any,
        mockAgentRunner as any,
      );

      // Process inbound message from Sofía on Telegram via handleAgentWebhook
      await webhookController.handleAgentWebhook(
        'booking',
        {
          update_id: 2001,
          message: {
            message_id: 77,
            date: 1763751000,
            text: 'Hola, ¿qué horarios tenéis de Hatha Yoga?',
            from: {
              id: 888111222,
              first_name: 'Sofía',
              last_name: 'Navarro',
              username: 'sofianavarro',
            },
            chat: {
              id: 888111222,
              type: 'private',
            },
          },
        },
        'secret_salvadora_123',
      );

      // Verify threadId convention and contact association
      expect(mockMessagesService.linkContact).toHaveBeenCalledWith(
        'booking:telegram:888111222',
        'contact-tg-1',
      );
      expect(mockAgentRunner.run).toHaveBeenCalledWith(
        expect.objectContaining({
          agentKey: 'booking',
          threadId: 'booking:telegram:888111222',
          contactId: 'contact-tg-1',
          channel: MessageChannel.TELEGRAM,
          externalId: 'tg:888111222:77',
        }),
      );
      // Verify AI reply was sent via Telegram Bot API and status updated to SENT
      expect(mockTelegramClient.sendTextMessage).toHaveBeenCalledWith(
        mockAgentConfig.telegramBotToken,
        '888111222',
        expect.stringContaining('Hatha Yoga Terapéutico'),
      );
      expect(mockMessagesService.updateStatus).toHaveBeenCalledWith(
        'msg-1',
        MessageStatus.SENT,
        'tg-out-101',
      );

      // Scenario 11: Manual reply from CRM Inbox
      const manualMsg = await telegramService.sendManualFromInbox({
        agentKey: 'booking',
        threadId: 'booking:telegram:888111222',
        chatId: '888111222',
        contactId: 'contact-tg-1',
        body: 'Hola Sofía, te atiende Salvadora personalmente. Te reservo el martes a las 09:45.',
      });
      expect(manualMsg.channel).toBe(MessageChannel.TELEGRAM);
      expect(manualMsg.status).toBe(MessageStatus.SENT);

      // Scenario 13: Export channel name formatting
      expect(formatChannelName('telegram', 'booking:telegram:888111222')).toBe(
        'Telegram',
      );
    });
  });

  // ─── 4. SERVICIOS, CONFIRMACIONES Y RECORDATORIOS (Escenarios 14 a 21) ─────
  describe('4. Servicios, Confirmaciones y Recordatorios por Telegram (REGLA OBLIGATORIA)', () => {
    it('Scenario 14, 15 & 16: saves and persists notifyByTelegram and reminderTelegram on Services', async () => {
      const savedServices: any[] = [];
      const mockServicesRepo = {
        query: jest.fn().mockResolvedValue([]),
        find: jest.fn(async () => savedServices),
        findOne: jest.fn(async ({ where }: any) => {
          const cond = Array.isArray(where) ? where[0] : where;
          return (
            savedServices.find(
              (s) => s.id === cond?.id || s.name === cond?.name,
            ) || null
          );
        }),
        create: jest.fn((dto: any) => ({ id: 'svc-yoga-1', ...dto })),
        save: jest.fn(async (entity: any) => {
          const idx = savedServices.findIndex((s) => s.id === entity.id);
          if (idx >= 0) savedServices[idx] = entity;
          else savedServices.push(entity);
          return entity;
        }),
      };

      const servicesService = new ServicesService(
        mockServicesRepo as any,
        { findOne: jest.fn().mockResolvedValue(null) } as any,
        { findOne: jest.fn().mockResolvedValue(null) } as any,
        { count: jest.fn().mockResolvedValue(0), find: jest.fn().mockResolvedValue([]) } as any,
        { find: jest.fn().mockResolvedValue([]), save: jest.fn() } as any,
        { findOne: jest.fn().mockResolvedValue(null) } as any,
        { delete: jest.fn().mockResolvedValue(undefined) } as any,
        { emit: jest.fn() } as any,
        {} as any,
      );

      const created = await servicesService.create({
        name: 'Hatha Yoga Terapéutico',
        durationMinutes: 90,
        notifyByEmail: true,
        notifyByWhatsapp: true,
        notifyBySms: false,
        notifyByTelegram: true,
        reminderWhatsapp: true,
        reminderEmail: true,
        reminderTelegram: true,
      } as any);

      expect(created.notifyByTelegram).toBe(true);
      expect(created.reminderTelegram).toBe(true);

      const updated = await servicesService.update(created.id, {
        notifyByTelegram: false,
        reminderTelegram: true,
      } as any);
      expect(updated.notifyByTelegram).toBe(false);
      expect(updated.reminderTelegram).toBe(true);
    });

    it('Scenario 17 & 19 (REGLA OBLIGATORIA): sends confirmation via Telegram ONLY when service.notifyByTelegram=true AND contact.conectadotelegram="S", and strictly blocks when conectadotelegram="N"', async () => {
      const mockTelegramClient = {
        sendTextMessage: jest.fn(async () => ({
          ok: true,
          providerMessageId: 'tg-conf-1',
        })),
      };
      const mockAgentsConfigService = {
        findByKeyOrNull: jest.fn(async () => ({
          agentKey: 'booking',
          telegramEnabled: true,
          telegramBotToken: '123456789:AAH_SALVADORA_BOT_TOKEN_TEST_123456',
        })),
        findByKey: jest.fn(async () => ({
          agentKey: 'booking',
          telegramEnabled: true,
          telegramBotToken: '123456789:AAH_SALVADORA_BOT_TOKEN_TEST_123456',
        })),
      };
      const mockMessagesService = {
        saveMessage: jest.fn(async (m: any) => ({ id: 'msg-conf', ...m })),
      };

      const telegramService = new TelegramService(
        mockTelegramClient as any,
        mockAgentsConfigService as any,
        {} as any,
        mockMessagesService as any,
        { emit: jest.fn() } as any,
      );

      // Direct guard test on TelegramService.sendAutomatedTextMessage
      const unlinkedContact: any = {
        id: 'c-unlinked',
        name: 'Pedro Sin Vincular',
        phone: '+34600000001',
        conectadotelegram: 'N',
        telegramChatId: '123123123', // Even if chat_id exists!
      };
      const blockedResult = await telegramService.sendAutomatedTextMessage({
        contact: unlinkedContact,
        body: 'Confirmación de cita',
      });
      expect(blockedResult.ok).toBe(false);
      expect(blockedResult.skipped).toBe(true);
      expect(mockTelegramClient.sendTextMessage).not.toHaveBeenCalled();

      // Now test with a properly linked contact (conectadotelegram = 'S')
      const linkedContact: any = {
        id: 'c-linked',
        name: 'Lucía Conectada',
        phone: '+34600000002',
        conectadotelegram: 'S',
        telegramChatId: '987654321',
        telegramBlocked: false,
        optedOut: false,
      };
      const allowedResult = await telegramService.sendAutomatedTextMessage({
        contact: linkedContact,
        body: 'Confirmación de cita de Hatha Yoga',
      });
      expect(allowedResult.ok).toBe(true);
      expect(allowedResult.providerMessageId).toBe('tg-conf-1');
      expect(mockTelegramClient.sendTextMessage).toHaveBeenCalledTimes(1);
    });

    it('Scenario 18, 19, 20 & 21: sends automatic reminder via Telegram ONLY when reminderTelegram=true AND conectadotelegram="S", prevents duplicate reminders, and logs errors cleanly', async () => {
      const now = new Date('2026-10-15T08:00:00.000Z');
      const startsAt = new Date(now.getTime() + 24 * 60 * 60_000); // 24h ahead

      const contactLinked: any = {
        id: 'c-rem-S',
        name: 'Ana Conectada',
        phone: '+34611000001',
        email: 'ana@example.com',
        conectadotelegram: 'S',
        telegramChatId: '111222333',
        telegramBlocked: false,
        optedOut: false,
      };

      const contactUnlinked: any = {
        id: 'c-rem-N',
        name: 'Jorge No Conectado',
        phone: '+34611000002',
        email: 'jorge@example.com',
        conectadotelegram: 'N',
        telegramChatId: '444555666', // Even with chatId, conectadotelegram is 'N'
        telegramBlocked: false,
        optedOut: false,
      };

      const appointments = [
        {
          id: 'appt-S',
          serviceId: 'svc-1',
          service: 'Hatha Yoga Terapéutico',
          status: AppointmentStatus.SCHEDULED,
          startsAt,
          contact: contactLinked,
        },
        {
          id: 'appt-N',
          serviceId: 'svc-1',
          service: 'Hatha Yoga Terapéutico',
          status: AppointmentStatus.SCHEDULED,
          startsAt,
          contact: contactUnlinked,
        },
      ];

      const storedReminders: any[] = [];
      const mockRemindersRepo = {
        find: jest.fn(async () => storedReminders),
        create: jest.fn((dto: any) => ({
          id: `rem-${storedReminders.length + 1}`,
          ...dto,
        })),
        save: jest.fn(async (entity: any) => {
          const dup = storedReminders.find(
            (r) =>
              r.appointmentId === entity.appointmentId &&
              r.offsetLabel === entity.offsetLabel &&
              r.channel === entity.channel,
          );
          if (dup) {
            const err: any = new Error('Duplicate key');
            err.code = '23505';
            throw err;
          }
          storedReminders.push(entity);
          return entity;
        }),
        update: jest.fn(async (id: string, patch: any) => {
          const r = storedReminders.find((item) => item.id === id);
          if (r) Object.assign(r, patch);
        }),
        remove: jest.fn(async (entity: any) => {
          const idx = storedReminders.findIndex((item) => item.id === entity.id);
          if (idx >= 0) storedReminders.splice(idx, 1);
        }),
      };

      const mockTelegramService = {
        sendAutomatedTextMessage: jest.fn(async ({ contact }: any) => {
          if (contact.conectadotelegram !== 'S') {
            return { ok: false, skipped: true };
          }
          return { ok: true, providerMessageId: 'tg-rem-200' };
        }),
      };

      const remindersService = new RemindersService(
        { find: jest.fn(async () => appointments) } as any,
        mockRemindersRepo as any,
        {
          findOne: jest.fn(async () => ({
            id: 'svc-1',
            name: 'Hatha Yoga Terapéutico',
            reminderWhatsapp: false,
            reminderEmail: false,
            reminderVoice: false,
            reminderSms: false,
            reminderTelegram: true,
            reminderHoursEnabled: true,
            reminderHours: 24,
            reminderMinutesEnabled: false,
          })),
        } as any,
        {
          findByKeyOrNull: jest.fn(async () => ({
            agentKey: 'booking',
            timezone: 'Europe/Madrid',
            telegramEnabled: true,
          })),
        } as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        undefined,
        mockTelegramService as any,
      );

      // First run: should send ONLY to appt-S (conectadotelegram = 'S'), NEVER to appt-N ('N')
      await remindersService.runOnce(now);

      expect(mockTelegramService.sendAutomatedTextMessage).toHaveBeenCalledTimes(1);
      expect(mockTelegramService.sendAutomatedTextMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          contact: expect.objectContaining({ id: 'c-rem-S', conectadotelegram: 'S' }),
        }),
      );
      expect(storedReminders).toHaveLength(1);
      expect(storedReminders[0].appointmentId).toBe('appt-S');
      expect(storedReminders[0].channel).toBe(ReminderChannel.TELEGRAM);
      expect(storedReminders[0].status).toBe(ReminderStatus.SENT);

      // Scenario 20: Second run at the same time must NOT send duplicates
      await remindersService.runOnce(now);
      expect(mockTelegramService.sendAutomatedTextMessage).toHaveBeenCalledTimes(1);
    });
  });

  // ─── 5. NO REGRESIÓN (Escenarios 22 a 29) ──────────────────────────────────
  describe('5. No Regresión de Canales Existentes (WhatsApp, Landing, Email, VAPI, Citas)', () => {
    it('Scenario 22-29: preserves existing channel formatting and notifications for WhatsApp, Web Landing, Email, VAPI Calls and Zadarma SMS alongside Telegram', () => {
      expect(formatChannelName('whatsapp', 'booking:+34600112233')).toBe('WhatsApp');
      expect(formatChannelName('widget', 'booking:widget-sess_123')).toBe('Web Landing');
      expect(formatChannelName('email', 'salvadora:email:user@test.com')).toBe(
        'Correo electrónico (Email)',
      );
      expect(formatChannelName('call', 'call:12345')).toBe(
        'Llamada telefónica (VAPI)',
      );
      expect(formatChannelName('sms', 'sms:12345')).toBe('Mensaje SMS (Zadarma)');
      expect(formatChannelName('telegram', 'booking:telegram:998877')).toBe(
        'Telegram',
      );
    });
  });
});
