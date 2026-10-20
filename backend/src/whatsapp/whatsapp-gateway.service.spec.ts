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
import { AppSettings } from '../common/entities/app-settings.entity';
import { MessageChannel } from '../common/entities/message.entity';
import { sanitizeAgentConfig } from '../agents/agents-config.service';
import { AgentRunnerService } from '../agents/agent-runner.service';
import { AUDIT_EVENT, AuditAction } from '../audit/audit.types';
import { SettingsController } from '../settings/settings.controller';
import { SettingsService } from '../settings/settings.service';
import { YCloudProvider } from './providers/ycloud.provider';
import { WhatsappGatewayService } from './whatsapp-gateway.service';
import { YCloudClient } from './ycloud-client.service';

describe('Phase 1 — WhatsappGatewayService, YCloudProvider, Global Pause & Human Handoff', () => {
  let ycloudClientMock: jest.Mocked<Pick<YCloudClient, 'sendTextMessage' | 'sendTemplateMessage'>>;
  let ycloudProvider: YCloudProvider;
  let settingsRepoMock: { find: jest.Mock };
  let agentConfigRepoMock: { findOne: jest.Mock };
  let gateway: WhatsappGatewayService;

  beforeEach(() => {
    ycloudClientMock = {
      sendTextMessage: jest.fn().mockResolvedValue({
        ok: true,
        providerMessageId: 'wamid.ycloud.123',
        status: 'accepted',
      }),
      sendTemplateMessage: jest.fn().mockResolvedValue({
        ok: true,
        providerMessageId: 'wamid.ycloud.tpl.456',
        status: 'accepted',
      }),
    };

    ycloudProvider = new YCloudProvider(ycloudClientMock as unknown as YCloudClient);
    settingsRepoMock = {
      find: jest.fn().mockResolvedValue([{ whatsappAutomationPaused: false }]),
    };
    agentConfigRepoMock = {
      findOne: jest.fn().mockResolvedValue({
        agentKey: 'booking',
        whatsappProvider: 'ycloud',
        whatsappNumber: '+34695172625',
        ycloudApiKey: 'yc-secret-key',
      }),
    };

    gateway = new WhatsappGatewayService(
      ycloudProvider,
      settingsRepoMock as any,
      agentConfigRepoMock as any,
    );
  });

  describe('YCloudProvider & WhatsappGatewayService routing', () => {
    it('routes automated text messages to YCloudClient when whatsappProvider is ycloud (or default) and pause is false', async () => {
      const config = {
        whatsappProvider: 'ycloud',
        whatsappNumber: '+34695172625',
        ycloudApiKey: 'yc-key-1',
      } as AgentConfig;

      const res = await gateway.sendAutomatedTextMessage({
        config,
        to: '+34600111222',
        body: 'Hola desde Salvadora',
      });

      expect(res.ok).toBe(true);
      expect(res.providerMessageId).toBe('wamid.ycloud.123');
      expect(ycloudClientMock.sendTextMessage).toHaveBeenCalledWith(
        '+34695172625',
        '+34600111222',
        'Hola desde Salvadora',
        'yc-key-1',
      );
    });

    it('routes automated template messages to YCloudClient when pause is false', async () => {
      const config = {
        whatsappProvider: 'ycloud',
        whatsappNumber: '+34695172625',
        ycloudApiKey: 'yc-key-1',
      } as AgentConfig;

      const res = await gateway.sendAutomatedTemplateMessage({
        config,
        to: '+34600111222',
        templateName: 'cita_recordatorio',
        languageCode: 'es',
        components: [{ type: 'body', parameters: [{ type: 'text', text: 'Ana' }] }],
      });

      expect(res.ok).toBe(true);
      expect(ycloudClientMock.sendTemplateMessage).toHaveBeenCalledWith(
        '+34695172625',
        '+34600111222',
        'cita_recordatorio',
        'es',
        [{ type: 'body', parameters: [{ type: 'text', text: 'Ana' }] }],
        'yc-key-1',
      );
    });

    it('blocks automated text and template sends when whatsappAutomationPaused is true', async () => {
      settingsRepoMock.find.mockResolvedValue([{ whatsappAutomationPaused: true }]);

      const textRes = await gateway.sendAutomatedTextMessage({
        from: '+34695172625',
        to: '+34600111222',
        body: 'Respuesta automática',
      });
      expect(textRes.ok).toBe(false);
      expect(textRes.skippedByPause).toBe(true);
      expect(textRes.error).toBe('whatsapp_automation_paused');
      expect(ycloudClientMock.sendTextMessage).not.toHaveBeenCalled();

      const tplRes = await gateway.sendAutomatedTemplateMessage({
        from: '+34695172625',
        to: '+34600111222',
        templateName: 'cita_recordatorio',
        languageCode: 'es',
      });
      expect(tplRes.ok).toBe(false);
      expect(tplRes.skippedByPause).toBe(true);
      expect(ycloudClientMock.sendTemplateMessage).not.toHaveBeenCalled();
    });

    it('permits manual text sends (Inbox operator replies) even when whatsappAutomationPaused is true', async () => {
      settingsRepoMock.find.mockResolvedValue([{ whatsappAutomationPaused: true }]);

      const manualRes = await gateway.sendManualTextMessage({
        from: '+34695172625',
        to: '+34600111222',
        body: 'Respuesta manual del operador desde el Inbox',
        apiKeyOverride: 'yc-manual-key',
      });

      expect(manualRes.ok).toBe(true);
      expect(ycloudClientMock.sendTextMessage).toHaveBeenCalledWith(
        '+34695172625',
        '+34600111222',
        'Respuesta manual del operador desde el Inbox',
        'yc-manual-key',
      );
    });
  });

  describe('AgentRunnerService — Global Pause vs Per-Conversation Human Handoff', () => {
    it('saves inbound message and emits message.received SSE, but skips LLM and outbound reply when whatsappAutomationPaused is true', async () => {
      const savedInbound = {
        id: 'msg-in-1',
        threadId: 'booking:+34600111222',
        direction: 'inbound',
        channel: MessageChannel.WHATSAPP,
        body: 'Hola, quiero reservar yoga',
        createdAt: new Date().toISOString(),
      };
      const messagesServiceMock = {
        saveInboundOnce: jest.fn().mockResolvedValue(savedInbound),
        saveMessage: jest.fn(),
        getConversation: jest.fn(),
      };
      const eventEmitterMock = {
        emit: jest.fn(),
      };
      const settingsServiceMock = {
        isWhatsappAutomationPaused: jest.fn().mockResolvedValue(true),
        isMaintenanceActive: jest.fn().mockResolvedValue(false),
      };
      const mastraMock = {
        getAgent: jest.fn(),
      };

      const runner = new AgentRunnerService(
        mastraMock as any,
        messagesServiceMock as any,
        { findByKeyOrNull: jest.fn() } as any,
        { findById: jest.fn(), isContactBlocked: jest.fn() } as any,
        eventEmitterMock as unknown as EventEmitter2,
        {} as any,
        {} as any,
        settingsServiceMock as unknown as SettingsService,
      );

      const res = await runner.run({
        agentKey: 'booking',
        message: 'Hola, quiero reservar yoga',
        threadId: 'booking:+34600111222',
        contactId: 'contact-1',
        phone: '+34600111222',
        contactName: 'Cliente',
        channel: MessageChannel.WHATSAPP,
        externalId: 'wamid.inbound.1',
      });

      expect(messagesServiceMock.saveInboundOnce).toHaveBeenCalledTimes(1);
      expect(eventEmitterMock.emit).toHaveBeenCalledWith(
        'message.received',
        expect.objectContaining({
          id: 'msg-in-1',
          threadId: 'booking:+34600111222',
        }),
      );
      expect(res).toEqual({ reply: '', outbound: null });
      expect(mastraMock.getAgent).not.toHaveBeenCalled();
      expect(messagesServiceMock.saveMessage).not.toHaveBeenCalled();
    });

    it('preserves per-conversation Human Handoff when global pause is false', async () => {
      const savedInbound = {
        id: 'msg-in-2',
        threadId: 'booking:+34600999888',
        direction: 'inbound',
        channel: MessageChannel.WHATSAPP,
        body: 'Consulta en hilo atendido por humano',
        createdAt: new Date().toISOString(),
      };
      const messagesServiceMock = {
        saveInboundOnce: jest.fn().mockResolvedValue(savedInbound),
        saveMessage: jest.fn(),
        getConversation: jest.fn().mockResolvedValue({
          threadId: 'booking:+34600999888',
          handoff: true,
        }),
      };
      const eventEmitterMock = { emit: jest.fn() };
      const settingsServiceMock = {
        isWhatsappAutomationPaused: jest.fn().mockResolvedValue(false),
        isMaintenanceActive: jest.fn().mockResolvedValue(false),
      };
      const mastraMock = { getAgent: jest.fn() };

      const runner = new AgentRunnerService(
        mastraMock as any,
        messagesServiceMock as any,
        {
          findByKeyOrNull: jest.fn().mockResolvedValue({
            agentKey: 'booking',
            enabled: true,
          }),
        } as any,
        {
          findById: jest.fn().mockResolvedValue({ id: 'contact-2', bloqueado: 'N' }),
          isContactBlocked: jest.fn().mockResolvedValue(false),
        } as any,
        eventEmitterMock as unknown as EventEmitter2,
        {} as any,
        {} as any,
        settingsServiceMock as unknown as SettingsService,
      );

      const res = await runner.run({
        agentKey: 'booking',
        message: 'Consulta en hilo atendido por humano',
        threadId: 'booking:+34600999888',
        contactId: 'contact-2',
        phone: '+34600999888',
        contactName: 'Cliente 2',
        channel: MessageChannel.WHATSAPP,
        externalId: 'wamid.inbound.2',
      });

      expect(res).toEqual({ reply: '', outbound: null });
      expect(messagesServiceMock.getConversation).toHaveBeenCalledWith(
        'booking:+34600999888',
      );
      expect(mastraMock.getAgent).not.toHaveBeenCalled();
    });
  });

  describe('SettingsService & SettingsController — Audit & PublicBranding security', () => {
    it('does not expose whatsappAutomationPaused in PublicBranding (getBranding)', async () => {
      const repoMock = {
        find: jest.fn().mockResolvedValue([
          {
            id: 'settings-1',
            businessName: 'CRM Salvadora',
            brandColor: '#4f46e5',
            logoUrl: null,
            serviciosEnMantenimiento: 'N',
            whatsappAutomationPaused: true,
          },
        ]),
      };
      const service = new SettingsService(repoMock as any, {} as any, {} as any);
      const branding = await service.getBranding();

      expect(branding).toEqual({
        businessName: 'CRM Salvadora',
        brandColor: '#4f46e5',
        logoUrl: null,
        serviciosEnMantenimiento: 'N',
      });
      expect((branding as any).whatsappAutomationPaused).toBeUndefined();
    });

    it('emits whatsapp.automation_paused and whatsapp.automation_resumed audit events when toggled', async () => {
      let currentPaused = false;
      const settingsServiceMock = {
        get: jest.fn().mockImplementation(async () => ({
          id: 'settings-1',
          businessName: 'CRM Salvadora',
          whatsappAutomationPaused: currentPaused,
        })),
        update: jest.fn().mockImplementation(async (dto: { whatsappAutomationPaused?: boolean }) => {
          if (dto.whatsappAutomationPaused !== undefined) {
            currentPaused = Boolean(dto.whatsappAutomationPaused);
          }
          return {
            id: 'settings-1',
            businessName: 'CRM Salvadora',
            whatsappAutomationPaused: currentPaused,
          };
        }),
      };
      const eventsMock = { emit: jest.fn() };
      const controller = new SettingsController(
        settingsServiceMock as unknown as SettingsService,
        eventsMock as unknown as EventEmitter2,
      );

      await controller.update(
        { whatsappAutomationPaused: true },
        { id: 'admin-1', email: 'admin@salvadora.com', role: 'admin' } as any,
        '127.0.0.1',
      );

      expect(eventsMock.emit).toHaveBeenCalledWith(
        AUDIT_EVENT,
        expect.objectContaining({
          action: AuditAction.WHATSAPP_AUTOMATION_PAUSED,
          actor: { id: 'admin-1', email: 'admin@salvadora.com' },
          metadata: {
            previousWhatsappAutomationPaused: false,
            whatsappAutomationPaused: true,
          },
        }),
      );

      eventsMock.emit.mockClear();

      await controller.update(
        { whatsappAutomationPaused: false },
        { id: 'admin-1', email: 'admin@salvadora.com', role: 'admin' } as any,
        '127.0.0.1',
      );

      expect(eventsMock.emit).toHaveBeenCalledWith(
        AUDIT_EVENT,
        expect.objectContaining({
          action: AuditAction.WHATSAPP_AUTOMATION_RESUMED,
          actor: { id: 'admin-1', email: 'admin@salvadora.com' },
          metadata: {
            previousWhatsappAutomationPaused: true,
            whatsappAutomationPaused: false,
          },
        }),
      );
    });
  });

  describe('sanitizeAgentConfig — multi-provider secret stripping', () => {
    it('strips all YCloud, Evolution, and Meta secrets while exposing has* flags', () => {
      const raw = {
        id: 'cfg-1',
        agentKey: 'booking',
        whatsappProvider: 'evolution',
        openrouterApiKey: 'or-secret',
        ycloudApiKey: 'yc-secret',
        ycloudWebhookSecret: 'yc-wh-secret',
        evolutionApiKey: 'evo-secret',
        evolutionWebhookSecret: 'evo-wh-secret',
        metaAccessToken: 'meta-token',
        metaAppSecret: 'meta-app-secret',
        metaVerifyToken: 'meta-verify',
      } as unknown as AgentConfig;

      const sanitized = sanitizeAgentConfig(raw);

      expect(sanitized.openrouterApiKey).toBeUndefined();
      expect(sanitized.ycloudApiKey).toBeUndefined();
      expect(sanitized.ycloudWebhookSecret).toBeUndefined();
      expect(sanitized.evolutionApiKey).toBeUndefined();
      expect(sanitized.evolutionWebhookSecret).toBeUndefined();
      expect(sanitized.metaAccessToken).toBeUndefined();
      expect(sanitized.metaAppSecret).toBeUndefined();
      expect(sanitized.metaVerifyToken).toBeUndefined();

      expect(sanitized.hasOpenrouterApiKey).toBe(true);
      expect(sanitized.hasYcloudApiKey).toBe(true);
      expect(sanitized.hasYcloudWebhookSecret).toBe(true);
      expect(sanitized.hasEvolutionApiKey).toBe(true);
      expect(sanitized.hasEvolutionWebhookSecret).toBe(true);
      expect(sanitized.hasMetaAccessToken).toBe(true);
      expect(sanitized.hasMetaAppSecret).toBe(true);
      expect(sanitized.hasMetaVerifyToken).toBe(true);
    });
  });
});
