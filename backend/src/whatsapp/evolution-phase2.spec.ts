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

import { BadRequestException, PayloadTooLargeException, UnauthorizedException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AgentConfig } from '../common/entities/agent-config.entity';
import {
  MessageChannel,
  MessageDirection,
  MessageStatus,
} from '../common/entities/message.entity';
import { AgentsConfigService } from '../agents/agents-config.service';
import { AgentRunnerService } from '../agents/agent-runner.service';
import { SettingsService } from '../settings/settings.service';
import { ConversationsController } from '../conversations/conversations.controller';
import { AUDIT_EVENT, AuditAction } from '../audit/audit.types';
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
import { WhatsappAdminSendService } from './whatsapp-admin-send.service';
import {
  WhatsappSendController,
  verifyWhatsappCliToken,
} from './whatsapp-send.controller';
import { validateWhatsappAttachment } from './whatsapp-attachment-validator';

/**
 * Helper that constructs a standards-compliant ZIP buffer in memory containing
 * the given entry file paths (with PK\x03\x04 Local File Headers, PK\x01\x02
 * Central Directory Headers, and PK\x05\x06 End of Central Directory record).
 */
function buildMockZipBuffer(entryNames: string[]): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const name of entryNames) {
    const nameBuf = Buffer.from(name, 'utf8');
    const dataBuf = Buffer.from('<xml/>', 'utf8');

    // Local file header (30 bytes + name + data)
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0); // PK\x03\x04
    localHeader.writeUInt16LE(20, 4); // version needed
    localHeader.writeUInt16LE(0, 6); // flags
    localHeader.writeUInt16LE(0, 8); // compression (0 = stored)
    localHeader.writeUInt32LE(dataBuf.length, 18); // compressed size
    localHeader.writeUInt32LE(dataBuf.length, 22); // uncompressed size
    localHeader.writeUInt16LE(nameBuf.length, 26); // file name length
    localHeader.writeUInt16LE(0, 28); // extra field length

    localParts.push(localHeader, nameBuf, dataBuf);

    // Central directory header (46 bytes + name)
    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0); // PK\x01\x02
    centralHeader.writeUInt16LE(20, 4); // version made by
    centralHeader.writeUInt16LE(20, 6); // version needed
    centralHeader.writeUInt32LE(dataBuf.length, 20); // compressed size
    centralHeader.writeUInt32LE(dataBuf.length, 24); // uncompressed size
    centralHeader.writeUInt16LE(nameBuf.length, 28); // file name length
    centralHeader.writeUInt16LE(0, 30); // extra length
    centralHeader.writeUInt16LE(0, 32); // comment length
    centralHeader.writeUInt32LE(offset, 42); // relative offset of local header

    centralParts.push(centralHeader, nameBuf);
    offset += 30 + nameBuf.length + dataBuf.length;
  }

  const centralDirBuffer = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // PK\x05\x06
  eocd.writeUInt16LE(entryNames.length, 8);
  eocd.writeUInt16LE(entryNames.length, 10);
  eocd.writeUInt32LE(centralDirBuffer.length, 12);
  eocd.writeUInt32LE(offset, 16);

  return Buffer.concat([...localParts, centralDirBuffer, eocd]);
}

describe('WhatsApp Complete Suite — Provider Selector, Evolution API v2.3.7, QR, Webhook, Pause, Handoff, Admin/CLI Media Sender & Attachment Validation', () => {
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
      WHATSAPP_CLI_TOKEN: 'super-secret-cli-token-2026',
      WHATSAPP_MAX_ATTACHMENT_MB: '16',
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

  // ─── 1, 2, 3, 4. Provider selector, Gateway routing & Meta guard ─────────────

  describe('1, 2, 3, 4. Provider selector, Gateway routing & Meta non-operative guard', () => {
    it('1 & 4. AgentsConfigService.update switches whatsappProvider between evolution and ycloud without erasing other credentials, and rejects activating meta until MetaProvider is implemented', async () => {
      const storedAgent: AgentConfig = {
        ...evolutionAgentConfig,
        whatsappProvider: 'ycloud',
        ycloudApiKey: 'yc-key-keep',
        ycloudWebhookSecret: 'yc-secret-keep',
        evolutionApiKey: 'evo-key-keep',
        evolutionWebhookSecret: 'evo-secret-keep',
      };
      const repoMock = {
        findOne: jest.fn().mockImplementation(async () => ({ ...storedAgent })),
        save: jest.fn().mockImplementation(async (entity) => {
          Object.assign(storedAgent, entity);
          return storedAgent;
        }),
      };
      const service = new AgentsConfigService(repoMock as any);

      // 1. Switch from 'ycloud' to 'evolution' — YCloud secrets are preserved
      const updatedEvo = await service.update('booking', {
        whatsappProvider: 'evolution',
      });
      expect(updatedEvo.whatsappProvider).toBe('evolution');
      expect(storedAgent.ycloudApiKey).toBe('yc-key-keep');
      expect(storedAgent.ycloudWebhookSecret).toBe('yc-secret-keep');

      // Switch back to 'ycloud' — Evolution secrets are preserved
      const updatedYc = await service.update('booking', {
        whatsappProvider: 'ycloud',
      });
      expect(updatedYc.whatsappProvider).toBe('ycloud');
      expect(storedAgent.evolutionApiKey).toBe('evo-key-keep');
      expect(storedAgent.evolutionWebhookSecret).toBe('evo-secret-keep');

      // 4. Attempting to activate 'meta' as operative provider throws BadRequestException
      await expect(
        service.update('booking', { whatsappProvider: 'meta' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('2. routes to EvolutionProvider when whatsappProvider = "evolution"', async () => {
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

    it('3. uses YCloudProvider when whatsappProvider = "ycloud"', async () => {
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

  // ─── 5, 6, 7, 8. Instance status, ensureInstance, QR, and configureWebhook ───

  describe('5, 6, 7, 8. Instance status, ensureInstance, QR, and configureWebhook', () => {
    it('5. getConnectionStatus maps open, connecting, close, and unconfigured states accurately', async () => {
      const unconf = await evolutionProvider.getConnectionStatus({
        ...evolutionAgentConfig,
        evolutionApiKey: null,
      });
      expect(unconf.state).toBe('unconfigured');

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

    it('6. ensureInstance creates the instance when GET /instance/connectionState returns 404, and skips creation when 200', async () => {
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

    it('7. getQr fetches GET /instance/connect/{instance} and returns qrBase64 and pairingCode', async () => {
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

    it('8. configureWebhook sends x-evolution-secret header and required events to POST /webhook/set/{instance}', async () => {
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

  // ─── 9 & 10. Fail-closed webhook security ─────────────────────────────────────

  describe('9 & 10. EvolutionWebhookController fail-closed security', () => {
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

    it('9. rejects missing, empty, different-length, or invalid x-evolution-secret (fail-closed 401)', async () => {
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

    it('10. rejects webhook when payload instance does not match agent evolutionInstanceName (403)', async () => {
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

  // ─── 11, 12, 13, 14. MESSAGES_UPSERT, Deduplication & MESSAGES_UPDATE ─────────

  describe('11, 12, 13, 14. Inbound parsing, filtering, deduplication, and status updates', () => {
    it('11. parses both message.conversation and message.extendedTextMessage.text', () => {
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

    it('12. ignores fromMe = true, @g.us group chats, status@broadcast, and protocol/reaction messages', () => {
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

    it('13. deduplicates repeated MESSAGES_UPSERT deliveries by externalId (key.id)', async () => {
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

    it('14. MESSAGES_UPDATE maps SERVER_ACK, DELIVERY_ACK, READ, PLAYED, and ERROR to MessageStatus and updates by providerMessageId', async () => {
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

  // ─── 15, 16, 17. Coexistence with Global Automation Pause & Human Handoff ────

  describe('15, 16, 17. Global Automation Pause & Per-Conversation Human Handoff with Evolution', () => {
    it('15. when whatsappAutomationPaused = true, an inbound Evolution message is saved & emitted to Inbox, does NOT run LLM, and does NOT auto-reply', async () => {
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

      expect(messagesServiceMock.saveInboundOnce).toHaveBeenCalledTimes(1);
      expect(eventEmitterMock.emit).toHaveBeenCalledWith(
        'message.received',
        expect.objectContaining({
          id: 'msg-in-paused-1',
          threadId: 'booking:+34600112233',
          body: 'Hola, ¿hay clase mañana?',
        }),
      );
      expect(mastraMock.getAgent).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('16. when whatsappAutomationPaused = true, manual reply from Inbox IS sent via Evolution API', async () => {
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

    it('17. when conversation.handoff = true on thread A, thread A does NOT auto-reply via Evolution, while thread B (handoff = false) DOES auto-reply via Evolution', async () => {
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
    });
  });

  // ─── 18–29. Admin & CLI Manual Send, Attachments, Size Limit & Audit ──────────

  describe('18–29. Admin & CLI Manual Send, Strict Attachment Validation, 413 Size Limit, CLI Token & Audit', () => {
    let adminSendService: WhatsappAdminSendService;
    let sendController: WhatsappSendController;
    let messagesServiceMock: {
      saveMessage: jest.Mock;
      updateStatus: jest.Mock;
      linkContact: jest.Mock;
      markRead: jest.Mock;
    };
    let contactsServiceMock: {
      upsertByPhone: jest.Mock;
    };
    let eventEmitterMock: {
      emit: jest.Mock;
    };
    let savedMsgSeq: number;

    beforeEach(() => {
      savedMsgSeq = 0;
      messagesServiceMock = {
        saveMessage: jest.fn().mockImplementation(async (dto) => ({
          id: `msg-manual-${++savedMsgSeq}`,
          ...dto,
          createdAt: new Date(),
        })),
        updateStatus: jest.fn().mockResolvedValue(undefined),
        linkContact: jest.fn().mockResolvedValue(undefined),
        markRead: jest.fn().mockResolvedValue(undefined),
      };
      contactsServiceMock = {
        upsertByPhone: jest.fn().mockImplementation(async (phone: string) => ({
          id: 'contact-manual-1',
          name: phone,
          phone,
        })),
      };
      eventEmitterMock = {
        emit: jest.fn(),
      };

      adminSendService = new WhatsappAdminSendService(
        { findByKey: jest.fn().mockResolvedValue(evolutionAgentConfig) } as any,
        contactsServiceMock as any,
        messagesServiceMock as any,
        gateway,
        eventEmitterMock as unknown as EventEmitter2,
      );

      sendController = new WhatsappSendController(adminSendService);
    });

    it('18. Admin manual send: text only', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 201,
        text: async () =>
          JSON.stringify({
            key: { id: 'EVO_ADMIN_TXT_1' },
            status: 'PENDING',
          }),
      });

      const res = await adminSendService.sendManual({
        agentKey: 'booking',
        to: '+34 600 111 222',
        message: 'Hola, te escribimos desde Salvadora',
        actor: { id: 'admin-1', email: 'admin@salvadora.com' },
        ip: '127.0.0.1',
      });

      expect(res.ok).toBe(true);
      expect(res.provider).toBe('evolution');
      expect(res.to).toBe('+34600111222');
      expect(res.providerMessageId).toBe('EVO_ADMIN_TXT_1');
      expect(res.providerMessageIds).toEqual(['EVO_ADMIN_TXT_1']);
      expect(fetchMock).toHaveBeenCalledWith(
        'https://evolutionapi.jigretera.com/message/sendText/salvadora_whatsapp',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            number: '34600111222',
            text: 'Hola, te escribimos desde Salvadora',
          }),
        }),
      );
    });

    it('19. Admin manual send: valid .pdf attachment', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 201,
        text: async () =>
          JSON.stringify({
            key: { id: 'EVO_ADMIN_PDF_1' },
            status: 'PENDING',
          }),
      });

      const pdfBuffer = Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n', 'utf8');
      const res = await adminSendService.sendManual({
        agentKey: 'booking',
        to: '+34600111222',
        message: 'Te adjunto el horario en PDF',
        file: {
          originalname: 'horario.pdf',
          mimetype: 'application/pdf',
          buffer: pdfBuffer,
        },
        actor: { id: 'admin-1', email: 'admin@salvadora.com' },
      });

      expect(res.ok).toBe(true);
      expect(res.filename).toBe('horario.pdf');
      expect(res.mimeType).toBe('application/pdf');
      expect(res.providerMessageId).toBe('EVO_ADMIN_PDF_1');

      expect(fetchMock).toHaveBeenCalledWith(
        'https://evolutionapi.jigretera.com/message/sendMedia/salvadora_whatsapp',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            number: '34600111222',
            mediatype: 'document',
            mimetype: 'application/pdf',
            caption: 'Te adjunto el horario en PDF',
            media: pdfBuffer.toString('base64'),
            fileName: 'horario.pdf',
          }),
        }),
      );
    });

    it('20. Admin manual send: valid .docx attachment (with [Content_Types].xml and word/document.xml)', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 201,
        text: async () =>
          JSON.stringify({
            key: { id: 'EVO_ADMIN_DOCX_1' },
            status: 'PENDING',
          }),
      });

      const docxBuffer = buildMockZipBuffer([
        '[Content_Types].xml',
        '_rels/.rels',
        'word/document.xml',
        'word/styles.xml',
      ]);
      const docxMime =
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

      const res = await adminSendService.sendManual({
        agentKey: 'booking',
        to: '+34600111222',
        file: {
          originalname: 'normativa.docx',
          mimetype: docxMime,
          buffer: docxBuffer,
        },
        actor: { id: 'admin-1', email: 'admin@salvadora.com' },
      });

      expect(res.ok).toBe(true);
      expect(res.filename).toBe('normativa.docx');
      expect(res.mimeType).toBe(docxMime);
      expect(res.providerMessageId).toBe('EVO_ADMIN_DOCX_1');
    });

    it('21. Rejects fake .docx (plain ZIP or renamed .xlsx without word/document.xml)', async () => {
      const docxMime =
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

      // Case A: Generic ZIP without OpenXML Word structure
      const plainZip = buildMockZipBuffer(['readme.txt', 'script.sh']);
      await expect(
        adminSendService.sendManual({
          agentKey: 'booking',
          to: '+34600111222',
          file: {
            originalname: 'falso.docx',
            mimetype: docxMime,
            buffer: plainZip,
          },
          actor: { id: 'admin-1', email: 'admin@salvadora.com' },
        }),
      ).rejects.toThrow(BadRequestException);

      // Case B: Excel .xlsx renamed to .docx
      const xlsxRenamedAsDocx = buildMockZipBuffer([
        '[Content_Types].xml',
        'xl/workbook.xml',
        'xl/worksheets/sheet1.xml',
      ]);
      await expect(
        adminSendService.sendManual({
          agentKey: 'booking',
          to: '+34600111222',
          file: {
            originalname: 'excel_renombrado.docx',
            mimetype: docxMime,
            buffer: xlsxRenamedAsDocx,
          },
          actor: { id: 'admin-1', email: 'admin@salvadora.com' },
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('22. Admin manual send: valid .xlsx attachment (with [Content_Types].xml and xl/workbook.xml)', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 201,
        text: async () =>
          JSON.stringify({
            key: { id: 'EVO_ADMIN_XLSX_1' },
            status: 'PENDING',
          }),
      });

      const xlsxBuffer = buildMockZipBuffer([
        '[Content_Types].xml',
        '_rels/.rels',
        'xl/workbook.xml',
        'xl/worksheets/sheet1.xml',
      ]);
      const xlsxMime =
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

      const res = await adminSendService.sendManual({
        agentKey: 'booking',
        to: '+34600111222',
        file: {
          originalname: 'listado.xlsx',
          mimetype: xlsxMime,
          buffer: xlsxBuffer,
        },
        actor: { id: 'admin-1', email: 'admin@salvadora.com' },
      });

      expect(res.ok).toBe(true);
      expect(res.filename).toBe('listado.xlsx');
      expect(res.mimeType).toBe(xlsxMime);
      expect(res.providerMessageId).toBe('EVO_ADMIN_XLSX_1');
    });

    it('23. Rejects fake .xlsx (plain ZIP or renamed .docx without xl/workbook.xml)', async () => {
      const xlsxMime =
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

      const plainZip = buildMockZipBuffer(['datos.csv']);
      await expect(
        adminSendService.sendManual({
          agentKey: 'booking',
          to: '+34600111222',
          file: {
            originalname: 'falso.xlsx',
            mimetype: xlsxMime,
            buffer: plainZip,
          },
          actor: { id: 'admin-1', email: 'admin@salvadora.com' },
        }),
      ).rejects.toThrow(BadRequestException);

      const docxRenamedAsXlsx = buildMockZipBuffer([
        '[Content_Types].xml',
        'word/document.xml',
      ]);
      await expect(
        adminSendService.sendManual({
          agentKey: 'booking',
          to: '+34600111222',
          file: {
            originalname: 'word_renombrado.xlsx',
            mimetype: xlsxMime,
            buffer: docxRenamedAsXlsx,
          },
          actor: { id: 'admin-1', email: 'admin@salvadora.com' },
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('24. Admin manual send: valid .txt attachment', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 201,
        text: async () =>
          JSON.stringify({
            key: { id: 'EVO_ADMIN_TXT_FILE_1' },
            status: 'PENDING',
          }),
      });

      const txtBuffer = Buffer.from(
        'Horarios de Hatha Yoga:\nLunes y Miércoles 18:30 - 20:00\n',
        'utf8',
      );
      const res = await adminSendService.sendManual({
        agentKey: 'booking',
        to: '+34600111222',
        file: {
          originalname: 'notas.txt',
          mimetype: 'text/plain',
          buffer: txtBuffer,
        },
        actor: { id: 'admin-1', email: 'admin@salvadora.com' },
      });

      expect(res.ok).toBe(true);
      expect(res.filename).toBe('notas.txt');
      expect(res.mimeType).toBe('text/plain');
      expect(res.providerMessageId).toBe('EVO_ADMIN_TXT_FILE_1');
    });

    it('25. Admin manual send: valid .mp3 + text sends text first (sendText) and audio second (sendMedia), returning both providerMessageIds', async () => {
      fetchMock
        .mockResolvedValueOnce({
          ok: true,
          status: 201,
          text: async () =>
            JSON.stringify({
              key: { id: 'EVO_MP3_STEP1_TEXT' },
              status: 'PENDING',
            }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 201,
          text: async () =>
            JSON.stringify({
              key: { id: 'EVO_MP3_STEP2_AUDIO' },
              status: 'PENDING',
            }),
        });

      // Valid ID3v2 header bytes: "ID3" + version + flags + size
      const mp3Buffer = Buffer.from([
        0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x10, 0xff, 0xfb,
      ]);

      const res = await adminSendService.sendManual({
        agentKey: 'booking',
        to: '+34600111222',
        message: 'Te envío el audio explicativo',
        file: {
          originalname: 'explicacion.mp3',
          mimetype: 'audio/mpeg',
          buffer: mp3Buffer,
        },
        actor: { id: 'admin-1', email: 'admin@salvadora.com' },
      });

      expect(res.ok).toBe(true);
      expect(res.providerMessageId).toBe('EVO_MP3_STEP1_TEXT');
      expect(res.providerMessageIds).toEqual([
        'EVO_MP3_STEP1_TEXT',
        'EVO_MP3_STEP2_AUDIO',
      ]);
      expect(res.messageIds).toHaveLength(2);
      expect(fetchMock).toHaveBeenCalledTimes(2);

      // 1st call: sendText
      expect(fetchMock).toHaveBeenNthCalledWith(
        1,
        'https://evolutionapi.jigretera.com/message/sendText/salvadora_whatsapp',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            number: '34600111222',
            text: 'Te envío el audio explicativo',
          }),
        }),
      );

      // 2nd call: sendMedia audio
      expect(fetchMock).toHaveBeenNthCalledWith(
        2,
        'https://evolutionapi.jigretera.com/message/sendMedia/salvadora_whatsapp',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            number: '34600111222',
            mediatype: 'audio',
            mimetype: 'audio/mpeg',
            caption: '',
            media: mp3Buffer.toString('base64'),
            fileName: 'explicacion.mp3',
          }),
        }),
      );
    });

    it('26. Admin manual send: valid .mp4 attachment', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 201,
        text: async () =>
          JSON.stringify({
            key: { id: 'EVO_ADMIN_MP4_1' },
            status: 'PENDING',
          }),
      });

      // Valid MP4 ftyp box at offset 4..8
      const mp4Buffer = Buffer.from([
        0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32,
        0x00, 0x00, 0x00, 0x00,
      ]);

      const res = await adminSendService.sendManual({
        agentKey: 'booking',
        to: '+34600111222',
        message: 'Vídeo del centro',
        file: {
          originalname: 'centro.mp4',
          mimetype: 'video/mp4',
          buffer: mp4Buffer,
        },
        actor: { id: 'admin-1', email: 'admin@salvadora.com' },
      });

      expect(res.ok).toBe(true);
      expect(res.filename).toBe('centro.mp4');
      expect(res.mimeType).toBe('video/mp4');
      expect(res.providerMessageId).toBe('EVO_ADMIN_MP4_1');
    });

    it('27. Rejects attachment exceeding WHATSAPP_MAX_ATTACHMENT_MB with 413 PayloadTooLargeException', () => {
      process.env.WHATSAPP_MAX_ATTACHMENT_MB = '1'; // 1 MB limit for test
      const oversizedPdf = Buffer.alloc(1024 * 1024 + 512, 0x41);
      oversizedPdf.write('%PDF-1.7\n', 0, 'ascii');

      expect(() =>
        validateWhatsappAttachment({
          originalname: 'grande.pdf',
          mimetype: 'application/pdf',
          buffer: oversizedPdf,
        }),
      ).toThrow(PayloadTooLargeException);
    });

    it('28. Validates WHATSAPP_CLI_TOKEN fail-closed using timingSafeEqual after checking byte length', async () => {
      expect(verifyWhatsappCliToken(undefined, 'secret-token')).toBe(false);
      expect(verifyWhatsappCliToken('secret-token', undefined)).toBe(false);
      expect(verifyWhatsappCliToken('secret-token', '')).toBe(false);
      expect(verifyWhatsappCliToken('short', 'much-longer-secret-token')).toBe(false);
      expect(verifyWhatsappCliToken('wrong-token-12', 'right-token-12')).toBe(false);
      expect(verifyWhatsappCliToken('right-token-12', 'right-token-12')).toBe(true);

      await expect(
        sendController.cliSend(
          'invalid-token',
          { agentKey: 'booking', to: '+34600111222', message: 'Hola' },
          undefined,
          '127.0.0.1',
        ),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('29. Emits whatsapp.admin_send audit event with metadata and without leaking secrets or binary data', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 201,
        text: async () =>
          JSON.stringify({
            key: { id: 'EVO_AUDIT_MSG_1' },
            status: 'PENDING',
          }),
      });

      const pdfBuffer = Buffer.from('%PDF-1.7\nContenido PDF', 'utf8');
      await adminSendService.sendManual({
        agentKey: 'booking',
        to: '+34600111222',
        message: 'Documento adjunto',
        file: {
          originalname: 'informe.pdf',
          mimetype: 'application/pdf',
          buffer: pdfBuffer,
        },
        actor: { id: 'admin-99', email: 'admin@salvadora.com' },
        ip: '192.168.1.50',
      });

      const auditCall = eventEmitterMock.emit.mock.calls.find(
        ([event]) => event === AUDIT_EVENT,
      );
      expect(auditCall).toBeDefined();
      const auditPayload = auditCall![1];
      expect(auditPayload).toMatchObject({
        actor: { id: 'admin-99', email: 'admin@salvadora.com' },
        action: AuditAction.WHATSAPP_ADMIN_SEND,
        targetType: 'whatsapp',
        targetId: 'booking:+34600111222',
        ip: '192.168.1.50',
        metadata: expect.objectContaining({
          agentKey: 'booking',
          provider: 'evolution',
          to: '+34600111222',
          filename: 'informe.pdf',
          mimeType: 'application/pdf',
          sizeBytes: pdfBuffer.length,
          providerMessageId: 'EVO_AUDIT_MSG_1',
          providerMessageIds: ['EVO_AUDIT_MSG_1'],
        }),
      });
      // Ensure binary/base64 or API keys are never stored in audit metadata
      const serializedAudit = JSON.stringify(auditPayload);
      expect(serializedAudit).not.toContain('evo-test-api-key-999');
      expect(serializedAudit).not.toContain(pdfBuffer.toString('base64'));
    });
  });
});
