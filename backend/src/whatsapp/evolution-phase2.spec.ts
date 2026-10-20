jest.mock('@mastra/nestjs', () => ({ MASTRA: 'MASTRA_TOKEN' }), { virtual: true });
jest.mock('@mastra/core/mastra', () => ({ Mastra: class {} }), { virtual: true });
jest.mock(
  '@mastra/core/request-context',
  () => ({
    RequestContext: class {
      set = jest.fn();
    },
  }),
  { virtual: true },
);
jest.mock('../mastra/booking-agent', () => ({ TEMPLATE_AGENT_ID: 'booking-agent' }));

import { EventEmitter2 } from '@nestjs/event-emitter';
import { AgentConfig } from '../common/entities/agent-config.entity';
import {
  MessageChannel,
  MessageDirection,
  MessageStatus,
} from '../common/entities/message.entity';
import { AgentRunnerService } from '../agents/agent-runner.service';
import { SettingsService } from '../settings/settings.service';
import { ConversationsController } from '../conversations/conversations.controller';
import { EvolutionProvider, EVOLUTION_WEBHOOK_EVENTS } from './providers/evolution.provider';
import { YCloudProvider } from './providers/ycloud.provider';
import { WhatsappGatewayService } from './whatsapp-gateway.service';
import { YCloudClient } from './ycloud-client.service';
import {
  parseEvolutionInboundMessages,
  parseEvolutionStatusUpdates,
  verifyEvolutionInstance,
  verifyEvolutionSecret,
} from './evolution-inbound-parser';
import { EvolutionWebhookController } from './evolution-webhook.controller';

describe('Phase 2 — Evolution API v2.3.7 Integration (Provider, Instance/QR, Webhook, Pause & Handoff)', () => {
  const originalFetch = global.fetch;
  const originalEnv = process.env;

  let fetchMock: jest.Mock;
  let evolutionProvider: EvolutionProvider;
  let ycloudClientMock: jest.Mocked<Pick<YCloudClient, 'sendTextMessage' | 'sendTemplateMessage'>>;
  let ycloudProvider: YCloudProvider;
  let settingsRepoMock: { find: jest.Mock };
  let agentConfigRepoMock: { findOne: jest.Mock };
  let gateway: WhatsappGatewayService;

  const evolutionAgentConfig: AgentConfig = {
    agentKey: 'booking',
    businessName: 'Centro Salvadora',
    businessDescription: 'Yoga',
    channel: 'whatsapp',
    services: [],
    workingHours: [],
    tone: 'friendly',
    timezone: 'Europe/Madrid',
    model: 'openai/gpt-4.1-mini',
    whatsappProvider: 'evolution',
    whatsappNumber: '+34 646 034 231',
    evolutionApiUrl: 'https://evolutionapi.jigretera.com',
    evolutionInstanceName: 'salvadora_whatsapp',
    evolutionApiKey: 'evo-test-api-key-999',
    evolutionWebhookSecret: 'evo-webhook-secret-xyz',
    enabled: true,
    remindersEnabled: true,
    reminderTemplateLanguage: 'es',
    createdAt: new Date(),
  } as AgentConfig;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      EVOLUTION_WEBHOOK_BASE_URL: 'http://crm-backend-internal:3001',
    };

    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    evolutionProvider = new EvolutionProvider();
    ycloudClientMock = {
      sendTextMessage: jest.fn().mockResolvedValue({
        ok: true,
        providerMessageId: 'wamid.ycloud.111',
        status: 'accepted',
      }),
      sendTemplateMessage: jest.fn().mockResolvedValue({
        ok: true,
        providerMessageId: 'wamid.ycloud.tpl.222',
        status: 'accepted',
      }),
    };
    ycloudProvider = new YCloudProvider(ycloudClientMock as unknown as YCloudClient);
    settingsRepoMock = {
      find: jest.fn().mockResolvedValue([{ whatsappAutomationPaused: false }]),
    };
    agentConfigRepoMock = {
      findOne: jest.fn().mockResolvedValue(evolutionAgentConfig),
    };

    gateway = new WhatsappGatewayService(
      ycloudProvider,
      settingsRepoMock as any,
      agentConfigRepoMock as any,
      evolutionProvider,
    );
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  // ─── 1 & 2. Gateway provider routing ──────────────────────────────────────────

  describe('1 & 2. WhatsappGatewayService provider routing', () => {
    it('1. routes to EvolutionProvider when whatsappProvider = "evolution"', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 201,
        text: async () =>
          JSON.stringify({
            key: { id: 'BAE599112233', remoteJid: '34600112233@s.whatsapp.net', fromMe: true },
            status: 'PENDING',
          }),
      });

      const res = await gateway.sendAutomatedTextMessage({
        config: evolutionAgentConfig,
        to: '+34 600 11 22 33',
        body: 'Hola desde Evolution',
      });

      expect(res.ok).toBe(true);
      expect(res.providerMessageId).toBe('BAE599112233');
      expect(ycloudClientMock.sendTextMessage).not.toHaveBeenCalled();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('2. continues using YCloudProvider when whatsappProvider = "ycloud"', async () => {
      const ycloudConfig: AgentConfig = {
        ...evolutionAgentConfig,
        whatsappProvider: 'ycloud',
        ycloudApiKey: 'yc-api-key',
      };

      const res = await gateway.sendAutomatedTextMessage({
        config: ycloudConfig,
        to: '+34600112233',
        body: 'Hola desde YCloud',
      });

      expect(res.ok).toBe(true);
      expect(res.providerMessageId).toBe('wamid.ycloud.111');
      expect(ycloudClientMock.sendTextMessage).toHaveBeenCalledWith(
        '+34 646 034 231',
        '+34600112233',
        'Hola desde YCloud',
        'yc-api-key',
      );
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  // ─── 3, 4, 5. EvolutionProvider.sendTextMessage ───────────────────────────────

  describe('3, 4, 5. EvolutionProvider.sendTextMessage', () => {
    it('builds POST /message/sendText/{instance}, sends apikey header, and returns providerMessageId', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 201,
        text: async () =>
          JSON.stringify({
            key: {
              remoteJid: '34611223344@s.whatsapp.net',
              fromMe: true,
              id: '3EB0A1B2C3D4E5',
            },
            status: 'PENDING',
          }),
      });

      const result = await evolutionProvider.sendTextMessage({
        config: evolutionAgentConfig,
        to: '+34 611 22 33 44',
        body: 'Confirmación de tu clase de Hatha Yoga',
      });

      expect(result).toEqual({
        ok: true,
        providerMessageId: '3EB0A1B2C3D4E5',
        status: 'PENDING',
      });

      expect(fetchMock).toHaveBeenCalledWith(
        'https://evolutionapi.jigretera.com/message/sendText/salvadora_whatsapp',
        expect.objectContaining({
          method: 'POST',
          headers: {
            apikey: 'evo-test-api-key-999',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            number: '34611223344',
            text: 'Confirmación de tu clase de Hatha Yoga',
          }),
        }),
      );
    });
  });

  // ─── 6, 7, 8, 9. Instance management, QR & Webhook configuration ─────────────

  describe('6, 7, 8, 9. Instance status, ensureInstance, QR, and configureWebhook', () => {
    it('6. getConnectionStatus maps open, connecting, close, and unconfigured states accurately', async () => {
      // Unconfigured
      const unconf = await evolutionProvider.getConnectionStatus({
        ...evolutionAgentConfig,
        evolutionApiKey: null,
      });
      expect(unconf.state).toBe('unconfigured');

      // Open
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            instance: { instanceName: 'salvadora_whatsapp', state: 'open' },
          }),
      });
      const openStatus = await evolutionProvider.getConnectionStatus(evolutionAgentConfig);
      expect(openStatus).toEqual({
        provider: 'evolution',
        state: 'open',
        instanceName: 'salvadora_whatsapp',
      });

      // Connecting
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            instance: { instanceName: 'salvadora_whatsapp', state: 'connecting' },
          }),
      });
      const connectingStatus = await evolutionProvider.getConnectionStatus(evolutionAgentConfig);
      expect(connectingStatus.state).toBe('connecting');

      // 404 Not Found -> close (not yet created)
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: async () =>
          JSON.stringify({
            status: 404,
            error: 'Not Found',
            response: { message: ['The "salvadora_whatsapp" instance does not exist'] },
          }),
      });
      const missingStatus = await evolutionProvider.getConnectionStatus(evolutionAgentConfig);
      expect(missingStatus.state).toBe('close');
    });

    it('7. ensureInstance creates the instance when GET /instance/connectionState returns 404, and skips creation when 200', async () => {
      // Case A: 404 -> POST /instance/create
      fetchMock
        .mockResolvedValueOnce({
          ok: false,
          status: 404,
          text: async () =>
            JSON.stringify({
              status: 404,
              response: { message: ['The "salvadora_whatsapp" instance does not exist'] },
            }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 201,
          text: async () =>
            JSON.stringify({
              instance: { instanceName: 'salvadora_whatsapp', status: 'connecting' },
              qrcode: { base64: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==' },
            }),
        });

      const createdRes = await evolutionProvider.ensureInstance(evolutionAgentConfig);
      expect(createdRes.created).toBe(true);
      expect(createdRes.qrBase64).toBe('data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==');
      expect(fetchMock).toHaveBeenNthCalledWith(
        2,
        'https://evolutionapi.jigretera.com/instance/create',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            instanceName: 'salvadora_whatsapp',
            integration: 'WHATSAPP-BAILEYS',
            qrcode: true,
            number: '34646034231',
          }),
        }),
      );

      // Case B: 200 -> does NOT call POST /instance/create
      fetchMock.mockClear();
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            instance: { instanceName: 'salvadora_whatsapp', state: 'open' },
          }),
      });

      const existingRes = await evolutionProvider.ensureInstance(evolutionAgentConfig);
      expect(existingRes.created).toBe(false);
      expect(existingRes.state).toBe('open');
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('8. getQr fetches GET /instance/connect/{instance} and returns qrBase64 and pairingCode', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            pairingCode: 'ABCD-1234',
            code: '2@abc...',
            base64: 'data:image/png;base64,QR_IMAGE_BASE64_DATA',
            count: 1,
          }),
      });

      const qrRes = await evolutionProvider.getQr(evolutionAgentConfig);
      expect(qrRes).toEqual({
        provider: 'evolution',
        state: 'connecting',
        instanceName: 'salvadora_whatsapp',
        qrBase64: 'data:image/png;base64,QR_IMAGE_BASE64_DATA',
        pairingCode: 'ABCD-1234',
      });
      expect(fetchMock).toHaveBeenCalledWith(
        'https://evolutionapi.jigretera.com/instance/connect/salvadora_whatsapp',
        expect.objectContaining({ method: 'GET' }),
      );
    });

    it('9. configureWebhook sends x-evolution-secret header and required events to POST /webhook/set/{instance}', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ webhook: { enabled: true } }),
      });

      const res = await evolutionProvider.configureWebhook(evolutionAgentConfig);

      expect(res).toEqual({
        ok: true,
        instanceName: 'salvadora_whatsapp',
        webhookUrl: 'http://crm-backend-internal:3001/api/webhooks/evolution/booking',
        events: [...EVOLUTION_WEBHOOK_EVENTS],
      });

      expect(fetchMock).toHaveBeenCalledWith(
        'https://evolutionapi.jigretera.com/webhook/set/salvadora_whatsapp',
        expect.objectContaining({
          method: 'POST',
          headers: {
            apikey: 'evo-test-api-key-999',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            webhook: {
              enabled: true,
              url: 'http://crm-backend-internal:3001/api/webhooks/evolution/booking',
              byEvents: false,
              base64: false,
              headers: {
                'x-evolution-secret': 'evo-webhook-secret-xyz',
              },
              events: [
                'MESSAGES_UPSERT',
                'MESSAGES_UPDATE',
                'CONNECTION_UPDATE',
                'QRCODE_UPDATED',
              ],
            },
          }),
        }),
      );
    });
  });

  // ─── 10 & 11. Fail-closed webhook security ────────────────────────────────────

  describe('10 & 11. EvolutionWebhookController fail-closed security', () => {
    let controller: EvolutionWebhookController;
    let messagesServiceMock: any;
    let contactsServiceMock: any;
    let agentRunnerMock: any;
    let agentsConfigServiceMock: any;
    let eventEmitterMock: any;

    beforeEach(() => {
      messagesServiceMock = {
        updateStatus: jest.fn(),
        updateStatusByProviderId: jest.fn(),
      };
      contactsServiceMock = {
        upsertByPhone: jest.fn(),
      };
      agentRunnerMock = {
        run: jest.fn(),
      };
      agentsConfigServiceMock = {
        findByKeyOrNull: jest.fn().mockResolvedValue(evolutionAgentConfig),
      };
      eventEmitterMock = {
        emit: jest.fn(),
      };

      controller = new EvolutionWebhookController(
        messagesServiceMock,
        contactsServiceMock,
        agentRunnerMock,
        agentsConfigServiceMock,
        gateway,
        eventEmitterMock,
      );
    });

    it('10. rejects missing, empty, different-length, or invalid x-evolution-secret (fail-closed 401)', async () => {
      expect(verifyEvolutionSecret(undefined, 'secret')).toBe(false);
      expect(verifyEvolutionSecret('secret', undefined)).toBe(false);
      expect(verifyEvolutionSecret('short', 'much-longer-secret')).toBe(false);
      expect(verifyEvolutionSecret('wrong-secret-1', 'right-secret-1')).toBe(false);
      expect(verifyEvolutionSecret('right-secret-1', 'right-secret-1')).toBe(true);

      const resMock = { sendStatus: jest.fn() } as any;
      await controller.handleForAgent(
        'booking',
        {
          headers: { 'x-evolution-secret': 'invalid-secret' },
          body: { event: 'messages.upsert', instance: 'salvadora_whatsapp', data: {} },
        } as any,
        resMock,
      );

      expect(resMock.sendStatus).toHaveBeenCalledWith(401);
      expect(contactsServiceMock.upsertByPhone).not.toHaveBeenCalled();
      expect(agentRunnerMock.run).not.toHaveBeenCalled();
    });

    it('11. rejects webhook when payload instance does not match agent evolutionInstanceName (403)', async () => {
      expect(verifyEvolutionInstance('other_instance', 'salvadora_whatsapp')).toBe(false);
      expect(verifyEvolutionInstance(undefined, 'salvadora_whatsapp')).toBe(false);
      expect(verifyEvolutionInstance('salvadora_whatsapp', 'salvadora_whatsapp')).toBe(true);

      const resMock = { sendStatus: jest.fn() } as any;
      await controller.handleForAgent(
        'booking',
        {
          headers: { 'x-evolution-secret': 'evo-webhook-secret-xyz' },
          body: { event: 'messages.upsert', instance: 'wrong_instance', data: {} },
        } as any,
        resMock,
      );

      expect(resMock.sendStatus).toHaveBeenCalledWith(403);
      expect(contactsServiceMock.upsertByPhone).not.toHaveBeenCalled();
      expect(agentRunnerMock.run).not.toHaveBeenCalled();
    });
  });

  // ─── 12, 13, 14, 15. MESSAGES_UPSERT, Deduplication & MESSAGES_UPDATE ─────────

  describe('12, 13, 14, 15. Inbound parsing, filtering, deduplication, and status updates', () => {
    it('12. parses both message.conversation and message.extendedTextMessage.text', () => {
      const parsed = parseEvolutionInboundMessages({
        event: 'messages.upsert',
        instance: 'salvadora_whatsapp',
        data: [
          {
            key: {
              remoteJid: '34600112233@s.whatsapp.net',
              fromMe: false,
              id: 'MSG_CONV_1',
            },
            pushName: 'Laura',
            message: {
              conversation: 'Hola, quiero información de Hatha Yoga',
            },
          },
          {
            key: {
              remoteJid: '123456789@lid',
              remoteJidAlt: '34699887766@s.whatsapp.net',
              fromMe: false,
              id: 'MSG_EXT_2',
            },
            pushName: 'Carlos',
            message: {
              extendedTextMessage: {
                text: '¿Tenéis plaza el martes a las 18:30?',
              },
            },
          },
        ],
      });

      expect(parsed).toEqual([
        {
          externalId: 'MSG_CONV_1',
          from: '+34600112233',
          body: 'Hola, quiero información de Hatha Yoga',
          pushName: 'Laura',
        },
        {
          externalId: 'MSG_EXT_2',
          from: '+34699887766',
          body: '¿Tenéis plaza el martes a las 18:30?',
          pushName: 'Carlos',
        },
      ]);
    });

    it('13. ignores fromMe = true, @g.us group chats, status@broadcast, and protocol/reaction messages', () => {
      const parsed = parseEvolutionInboundMessages({
        event: 'messages.upsert',
        instance: 'salvadora_whatsapp',
        data: [
          {
            key: { remoteJid: '34600112233@s.whatsapp.net', fromMe: true, id: 'ECHO_1' },
            message: { conversation: 'Mensaje propio' },
          },
          {
            key: { remoteJid: '120363022222@g.us', fromMe: false, id: 'GROUP_1' },
            message: { conversation: 'Mensaje en grupo' },
          },
          {
            key: { remoteJid: 'status@broadcast', fromMe: false, id: 'STATUS_1' },
            message: { conversation: 'Estado de WhatsApp' },
          },
          {
            key: { remoteJid: '34600112233@s.whatsapp.net', fromMe: false, id: 'REACT_1' },
            message: { reactionMessage: { text: '👍' } },
          },
        ],
      });

      expect(parsed).toEqual([]);
    });

    it('14. deduplicates repeated MESSAGES_UPSERT deliveries by externalId (key.id)', async () => {
      const seenExternalIds = new Set<string>();
      const messagesServiceMock = {
        saveInboundOnce: jest.fn().mockImplementation(async ({ externalId, body, threadId }) => {
          if (seenExternalIds.has(externalId)) return null;
          seenExternalIds.add(externalId);
          return {
            id: `db-${externalId}`,
            threadId,
            direction: MessageDirection.INBOUND,
            channel: MessageChannel.WHATSAPP,
            body,
            createdAt: new Date().toISOString(),
          };
        }),
        saveMessage: jest.fn().mockImplementation(async (data) => ({
          id: 'db-out-1',
          ...data,
          createdAt: new Date().toISOString(),
        })),
        getConversation: jest.fn().mockResolvedValue({ handoff: false }),
        getRecentThreadMessages: jest.fn().mockResolvedValue([]),
        updateStatus: jest.fn(),
        updateStatusByProviderId: jest.fn(),
      };

      const mastraAgentGenerate = jest.fn().mockResolvedValue({
        text: '¡Hola! Claro, tenemos clase el martes.',
      });
      const mastraMock = {
        getAgent: jest.fn().mockReturnValue({ generate: mastraAgentGenerate }),
      };

      const runner = new AgentRunnerService(
        mastraMock as any,
        messagesServiceMock as any,
        { findByKeyOrNull: jest.fn().mockResolvedValue(evolutionAgentConfig) } as any,
        {
          findById: jest.fn().mockResolvedValue({ id: 'c1', bloqueado: 'N' }),
          isContactBlocked: jest.fn().mockResolvedValue(false),
        } as any,
        { emit: jest.fn() } as unknown as EventEmitter2,
        { resolveForMessage: jest.fn().mockResolvedValue({ mode: 'inject', text: '' }) } as any,
        { findAll: jest.fn().mockResolvedValue([]) } as any,
        {
          isWhatsappAutomationPaused: jest.fn().mockResolvedValue(false),
          isMaintenanceActive: jest.fn().mockResolvedValue(false),
          get: jest.fn().mockResolvedValue({ serviciosEnMantenimiento: 'N' }),
        } as unknown as SettingsService,
      );

      const firstRun = await runner.run({
        agentKey: 'booking',
        message: 'Hola',
        threadId: 'booking:+34600112233',
        contactId: 'c1',
        phone: '+34600112233',
        channel: MessageChannel.WHATSAPP,
        externalId: 'EVO_DUP_KEY_1',
      });
      expect(firstRun.reply).toBe('¡Hola! Claro, tenemos clase el martes.');
      expect(mastraAgentGenerate).toHaveBeenCalledTimes(1);

      // Duplicate webhook with same externalId
      const secondRun = await runner.run({
        agentKey: 'booking',
        message: 'Hola',
        threadId: 'booking:+34600112233',
        contactId: 'c1',
        phone: '+34600112233',
        channel: MessageChannel.WHATSAPP,
        externalId: 'EVO_DUP_KEY_1',
      });
      expect(secondRun.reply).toBe('');
      expect(secondRun.outbound).toBeNull();
      expect(mastraAgentGenerate).toHaveBeenCalledTimes(1);
    });

    it('15. MESSAGES_UPDATE maps SERVER_ACK, DELIVERY_ACK, READ, PLAYED, and ERROR to MessageStatus and updates by providerMessageId', async () => {
      const updates = parseEvolutionStatusUpdates({
        event: 'messages.update',
        instance: 'salvadora_whatsapp',
        data: [
          { keyId: 'EVO_MSG_1', status: 'SERVER_ACK' },
          { keyId: 'EVO_MSG_2', status: 'DELIVERY_ACK' },
          { keyId: 'EVO_MSG_3', status: 'READ' },
          { keyId: 'EVO_MSG_4', status: 'PLAYED' },
          { keyId: 'EVO_MSG_5', status: 'ERROR' },
          { keyId: 'EVO_MSG_PENDING', status: 'PENDING' },
        ],
      });

      expect(updates).toEqual([
        { providerMessageId: 'EVO_MSG_1', status: MessageStatus.SENT },
        { providerMessageId: 'EVO_MSG_2', status: MessageStatus.DELIVERED },
        { providerMessageId: 'EVO_MSG_3', status: MessageStatus.READ },
        { providerMessageId: 'EVO_MSG_4', status: MessageStatus.READ },
        { providerMessageId: 'EVO_MSG_5', status: MessageStatus.FAILED },
      ]);

      const messagesServiceMock = {
        updateStatusByProviderId: jest.fn().mockResolvedValue(undefined),
      };
      const eventEmitterMock = { emit: jest.fn() };
      const controller = new EvolutionWebhookController(
        messagesServiceMock as any,
        {} as any,
        {} as any,
        {} as any,
        gateway,
        eventEmitterMock as any,
      );

      await controller.processWebhook(
        'booking',
        evolutionAgentConfig,
        {
          event: 'messages.update',
          instance: 'salvadora_whatsapp',
          data: [{ keyId: 'EVO_MSG_2', status: 'DELIVERY_ACK' }],
        },
      );

      expect(messagesServiceMock.updateStatusByProviderId).toHaveBeenCalledWith(
        'EVO_MSG_2',
        MessageStatus.DELIVERED,
      );
      expect(eventEmitterMock.emit).toHaveBeenCalledWith('message.status', {
        providerMessageId: 'EVO_MSG_2',
        status: MessageStatus.DELIVERED,
      });
    });
  });

  // ─── 16, 17, 18. Coexistence with Global Automation Pause & Human Handoff ────

  describe('16, 17, 18. Global Automation Pause & Per-Conversation Human Handoff with Evolution', () => {
    it('16. when whatsappAutomationPaused = true, an inbound Evolution message is saved & emitted to Inbox, does NOT run LLM, and does NOT auto-reply', async () => {
      const messagesServiceMock = {
        saveInboundOnce: jest.fn().mockImplementation(async (data) => ({
          id: 'msg-in-paused-1',
          ...data,
          createdAt: new Date().toISOString(),
        })),
        saveMessage: jest.fn(),
        updateStatus: jest.fn(),
      };
      const eventEmitterMock = { emit: jest.fn() };
      const mastraMock = { getAgent: jest.fn() };

      const runner = new AgentRunnerService(
        mastraMock as any,
        messagesServiceMock as any,
        { findByKeyOrNull: jest.fn().mockResolvedValue(evolutionAgentConfig) } as any,
        { upsertByPhone: jest.fn() } as any,
        eventEmitterMock as unknown as EventEmitter2,
        {} as any,
        {} as any,
        {
          isWhatsappAutomationPaused: jest.fn().mockResolvedValue(true),
          isMaintenanceActive: jest.fn().mockResolvedValue(false),
        } as unknown as SettingsService,
      );

      const webhookController = new EvolutionWebhookController(
        messagesServiceMock as any,
        {
          upsertByPhone: jest
            .fn()
            .mockResolvedValue({ id: 'contact-1', name: 'María', phone: '+34600112233' }),
        } as any,
        runner,
        { findByKeyOrNull: jest.fn().mockResolvedValue(evolutionAgentConfig) } as any,
        gateway,
        eventEmitterMock as unknown as EventEmitter2,
      );

      await webhookController.processWebhook('booking', evolutionAgentConfig, {
        event: 'messages.upsert',
        instance: 'salvadora_whatsapp',
        data: {
          key: {
            remoteJid: '34600112233@s.whatsapp.net',
            fromMe: false,
            id: 'EVO_IN_PAUSED_1',
          },
          message: { conversation: 'Hola, ¿hay clase mañana?' },
        },
      });

      // Saved in DB and emitted to Inbox via SSE
      expect(messagesServiceMock.saveInboundOnce).toHaveBeenCalledTimes(1);
      expect(eventEmitterMock.emit).toHaveBeenCalledWith(
        'message.received',
        expect.objectContaining({
          id: 'msg-in-paused-1',
          threadId: 'booking:+34600112233',
          body: 'Hola, ¿hay clase mañana?',
        }),
      );
      // LLM not called, Evolution sendText not called
      expect(mastraMock.getAgent).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('17. when whatsappAutomationPaused = true, manual reply from Inbox IS sent via Evolution API', async () => {
      settingsRepoMock.find.mockResolvedValue([{ whatsappAutomationPaused: true }]);

      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 201,
        text: async () =>
          JSON.stringify({
            key: { id: 'EVO_MANUAL_SENT_1' },
            status: 'PENDING',
          }),
      });

      const messagesServiceMock = {
        getConversation: jest.fn().mockResolvedValue({
          threadId: 'booking:+34600112233',
          agentKey: 'booking',
          contactId: 'contact-1',
          channel: MessageChannel.WHATSAPP,
          handoff: true,
        }),
        saveMessage: jest.fn().mockImplementation(async (data) => ({
          id: 'msg-manual-out-1',
          ...data,
          createdAt: new Date().toISOString(),
        })),
        markRead: jest.fn().mockResolvedValue(undefined),
        updateStatus: jest.fn().mockResolvedValue(undefined),
      };
      const eventEmitterMock = { emit: jest.fn() };

      const convController = new ConversationsController(
        messagesServiceMock as any,
        { findByKeyOrNull: jest.fn().mockResolvedValue(evolutionAgentConfig) } as any,
        ycloudClientMock as unknown as YCloudClient,
        eventEmitterMock as unknown as EventEmitter2,
        {} as any,
        {} as any,
        gateway,
      );

      const view = await convController.sendManual('booking:+34600112233', {
        body: 'Hola María, te respondo manualmente desde el Inbox.',
      });

      expect(view.status).toBe(MessageStatus.SENT);
      expect(fetchMock).toHaveBeenCalledWith(
        'https://evolutionapi.jigretera.com/message/sendText/salvadora_whatsapp',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            number: '34600112233',
            text: 'Hola María, te respondo manualmente desde el Inbox.',
          }),
        }),
      );
      expect(messagesServiceMock.updateStatus).toHaveBeenCalledWith(
        'msg-manual-out-1',
        MessageStatus.SENT,
        'EVO_MANUAL_SENT_1',
      );
    });

    it('18. when conversation.handoff = true on thread A, thread A does NOT auto-reply via Evolution, while thread B (handoff = false) DOES auto-reply via Evolution', async () => {
      const handoffByThread: Record<string, boolean> = {
        'booking:+34600111111': true,
        'booking:+34600222222': false,
      };

      const messagesServiceMock = {
        saveInboundOnce: jest.fn().mockImplementation(async (data) => ({
          id: `in-${data.externalId}`,
          ...data,
          createdAt: new Date().toISOString(),
        })),
        saveMessage: jest.fn().mockImplementation(async (data) => ({
          id: `out-${Date.now()}`,
          ...data,
          createdAt: new Date().toISOString(),
        })),
        getConversation: jest.fn().mockImplementation(async (threadId: string) => ({
          threadId,
          handoff: handoffByThread[threadId] ?? false,
        })),
        getRecentThreadMessages: jest.fn().mockResolvedValue([]),
        updateStatus: jest.fn().mockResolvedValue(undefined),
      };

      const mastraGenerate = jest.fn().mockResolvedValue({
        text: 'Respuesta automática para el hilo B.',
      });
      const mastraMock = {
        getAgent: jest.fn().mockReturnValue({ generate: mastraGenerate }),
      };

      const runner = new AgentRunnerService(
        mastraMock as any,
        messagesServiceMock as any,
        { findByKeyOrNull: jest.fn().mockResolvedValue(evolutionAgentConfig) } as any,
        {
          findById: jest.fn().mockResolvedValue({ id: 'c', bloqueado: 'N' }),
          isContactBlocked: jest.fn().mockResolvedValue(false),
        } as any,
        { emit: jest.fn() } as unknown as EventEmitter2,
        { resolveForMessage: jest.fn().mockResolvedValue({ mode: 'inject', text: '' }) } as any,
        { findAll: jest.fn().mockResolvedValue([]) } as any,
        {
          isWhatsappAutomationPaused: jest.fn().mockResolvedValue(false),
          isMaintenanceActive: jest.fn().mockResolvedValue(false),
          get: jest.fn().mockResolvedValue({ serviciosEnMantenimiento: 'N' }),
        } as unknown as SettingsService,
      );

      const webhookController = new EvolutionWebhookController(
        messagesServiceMock as any,
        {
          upsertByPhone: jest.fn().mockImplementation(async (phone: string) => ({
            id: `contact-${phone}`,
            name: 'Cliente',
            phone,
          })),
        } as any,
        runner,
        { findByKeyOrNull: jest.fn().mockResolvedValue(evolutionAgentConfig) } as any,
        gateway,
        { emit: jest.fn() } as unknown as EventEmitter2,
      );

      fetchMock.mockResolvedValue({
        ok: true,
        status: 201,
        text: async () =>
          JSON.stringify({
            key: { id: 'EVO_AUTO_REPLY_B' },
            status: 'PENDING',
          }),
      });

      // Thread A (handoff = true) -> no LLM, no Evolution sendText
      await webhookController.processWebhook('booking', evolutionAgentConfig, {
        event: 'messages.upsert',
        instance: 'salvadora_whatsapp',
        data: {
          key: {
            remoteJid: '34600111111@s.whatsapp.net',
            fromMe: false,
            id: 'MSG_THREAD_A',
          },
          message: { conversation: 'Hola desde hilo en handoff' },
        },
      });
      expect(mastraGenerate).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();

      // Thread B (handoff = false) -> runs LLM and sends reply via Evolution
      await webhookController.processWebhook('booking', evolutionAgentConfig, {
        event: 'messages.upsert',
        instance: 'salvadora_whatsapp',
        data: {
          key: {
            remoteJid: '34600222222@s.whatsapp.net',
            fromMe: false,
            id: 'MSG_THREAD_B',
          },
          message: { conversation: 'Hola desde hilo automático' },
        },
      });
      expect(mastraGenerate).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledWith(
        'https://evolutionapi.jigretera.com/message/sendText/salvadora_whatsapp',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            number: '34600222222',
            text: 'Respuesta automática para el hilo B.',
          }),
        }),
      );
    });
  });
});
