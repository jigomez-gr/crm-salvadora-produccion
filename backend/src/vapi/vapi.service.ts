import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { VapiAccount } from '../common/entities/vapi-account.entity';
import { AppSettings } from '../common/entities/app-settings.entity';
import { Service } from '../common/entities/service.entity';
import { AgentConfig } from '../common/entities/agent-config.entity';
import { Contact } from '../common/entities/contact.entity';
import { Call, CallDirection, CallStatus } from '../common/entities/call.entity';
import { VapiAccountConfigDto } from './vapi.types';
import { VAPI_CATALOG } from './vapi-catalog';
import { composeVapiSystemPrompt, PromptInputData } from './vapi-prompt';
import { buildVapiToolDefinitions, VapiToolDefinition } from './vapi-tools';

const VAPI_BASE_URL = 'https://api.vapi.ai';

@Injectable()
export class VapiService implements OnModuleInit {
  private readonly logger = new Logger(VapiService.name);

  constructor(
    @InjectRepository(VapiAccount)
    private readonly vapiAccountRepo: Repository<VapiAccount>,
    @InjectRepository(AppSettings)
    private readonly settingsRepo: Repository<AppSettings>,
    @InjectRepository(Service)
    private readonly servicesRepo: Repository<Service>,
    @InjectRepository(AgentConfig)
    private readonly agentConfigRepo: Repository<AgentConfig>,
    @InjectRepository(Contact)
    private readonly contactsRepo: Repository<Contact>,
    @InjectRepository(Call)
    private readonly callsRepo: Repository<Call>,
  ) {}

  async onModuleInit() {
    await this.ensureSchema();
  }

  private async ensureSchema(): Promise<void> {
    try {
      await this.vapiAccountRepo.query(`
        CREATE TABLE IF NOT EXISTS "vapi_accounts" (
          "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
          "apiKey" character varying,
          "webhookToken" character varying,
          "assistantId" character varying,
          "phoneNumberId" character varying,
          "phoneNumber" character varying,
          "serverCredentialId" character varying,
          "customWebhookUrl" character varying,
          "handoffNumber" character varying,
          "handoffMessage" character varying,
          "smsWebhookUrl" text,
          "voiceProvider" character varying NOT NULL DEFAULT '11labs',
          "voiceId" character varying NOT NULL DEFAULT 'UOIqAnmS11Reiei1Ytkc',
          "voiceModel" character varying NOT NULL DEFAULT 'eleven_turbo_v2_5',
          "voiceLanguage" character varying NOT NULL DEFAULT 'es',
          "transcriberProvider" character varying NOT NULL DEFAULT 'deepgram',
          "transcriberModel" character varying NOT NULL DEFAULT 'nova-3-general',
          "transcriberLanguage" character varying NOT NULL DEFAULT 'es',
          "llmProvider" character varying NOT NULL DEFAULT 'openai',
          "llmModel" character varying NOT NULL DEFAULT 'gpt-5.6-luna',
          "systemPromptOverride" text,
          "tone" character varying NOT NULL DEFAULT 'professional',
          "maxDurationSeconds" integer NOT NULL DEFAULT 900,
          "isActive" boolean NOT NULL DEFAULT true,
          "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
          "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
          CONSTRAINT "PK_vapi_accounts" PRIMARY KEY ("id")
        )
      `);

      await this.vapiAccountRepo.query(`
        ALTER TABLE "vapi_accounts" ADD COLUMN IF NOT EXISTS "smsWebhookUrl" text;
      `);

      await this.callsRepo.query(`
        CREATE TABLE IF NOT EXISTS "calls" (
          "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
          "vapiCallId" character varying(255) NOT NULL,
          "direction" character varying(32) NOT NULL DEFAULT 'inbound',
          "fromNumber" character varying(64),
          "toNumber" character varying(64),
          "status" character varying(32) NOT NULL DEFAULT 'in-progress',
          "startedAt" TIMESTAMP WITH TIME ZONE,
          "endedAt" TIMESTAMP WITH TIME ZONE,
          "durationSeconds" integer,
          "costCents" integer,
          "recordingUrl" character varying(1024),
          "stereoRecordingUrl" character varying(1024),
          "transcript" text,
          "summary" text,
          "needsReview" boolean NOT NULL DEFAULT false,
          "reviewReason" text,
          "metadata" jsonb,
          "contactId" uuid,
          "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
          "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
          CONSTRAINT "PK_calls" PRIMARY KEY ("id"),
          CONSTRAINT "UQ_calls_vapiCallId" UNIQUE ("vapiCallId")
        )
      `);
      await this.callsRepo.query(`
        CREATE INDEX IF NOT EXISTS "IDX_calls_fromNumber" ON "calls" ("fromNumber");
        CREATE INDEX IF NOT EXISTS "IDX_calls_contactId" ON "calls" ("contactId");
      `);
    } catch (err: any) {
      this.logger.warn(`Could not ensure vapi/calls schema: ${err?.message || err}`);
    }
  }

  async getAccount(): Promise<VapiAccount> {
    await this.ensureSchema();
    const [existing] = await this.vapiAccountRepo.find({
      order: { createdAt: 'ASC' },
      take: 1,
    });
    if (existing) return existing;

    const created = this.vapiAccountRepo.create({
      apiKey: process.env.VAPI_API_KEY || null,
      webhookToken: process.env.VAPI_WEBHOOK_TOKEN || 'vapi-crm-token-secret-2026',
      voiceProvider: '11labs',
      voiceId: 'UOIqAnmS11Reiei1Ytkc',
      voiceModel: 'eleven_turbo_v2_5',
      voiceLanguage: 'es',
      transcriberProvider: 'deepgram',
      transcriberModel: 'nova-3-general',
      transcriberLanguage: 'es',
      llmProvider: 'openai',
      llmModel: 'gpt-5.6-luna',
      tone: 'professional',
      maxDurationSeconds: 900,
      isActive: true,
    });
    return this.vapiAccountRepo.save(created);
  }

  async getConfigSanitized() {
    const acc = await this.getAccount();
    return {
      id: acc.id,
      hasApiKey: Boolean(acc.apiKey || process.env.VAPI_API_KEY),
      hasWebhookToken: Boolean(acc.webhookToken || process.env.VAPI_WEBHOOK_TOKEN),
      assistantId: acc.assistantId,
      phoneNumberId: acc.phoneNumberId,
      phoneNumber: acc.phoneNumber,
      serverCredentialId: acc.serverCredentialId,
      customWebhookUrl: acc.customWebhookUrl,
      handoffNumber: acc.handoffNumber,
      handoffMessage: acc.handoffMessage,
      voiceProvider: acc.voiceProvider,
      voiceId: acc.voiceId,
      voiceModel: acc.voiceModel,
      voiceLanguage: acc.voiceLanguage,
      transcriberProvider: acc.transcriberProvider,
      transcriberModel: acc.transcriberModel,
      transcriberLanguage: acc.transcriberLanguage,
      llmProvider: acc.llmProvider,
      llmModel: acc.llmModel,
      systemPromptOverride: acc.systemPromptOverride,
      tone: acc.tone,
      maxDurationSeconds: acc.maxDurationSeconds,
      isActive: acc.isActive,
      smsWebhookUrl: acc.smsWebhookUrl,
      updatedAt: acc.updatedAt,
    };
  }

  async updateConfig(dto: VapiAccountConfigDto) {
    const acc = await this.getAccount();
    if (dto.apiKey !== undefined && dto.apiKey.trim() !== '') {
      acc.apiKey = dto.apiKey.trim();
    }
    if (dto.webhookToken !== undefined && dto.webhookToken.trim() !== '') {
      acc.webhookToken = dto.webhookToken.trim();
    }
    if (dto.assistantId !== undefined) acc.assistantId = dto.assistantId || null;
    if (dto.phoneNumberId !== undefined) acc.phoneNumberId = dto.phoneNumberId || null;
    if (dto.phoneNumber !== undefined) acc.phoneNumber = dto.phoneNumber || null;
    if (dto.serverCredentialId !== undefined) acc.serverCredentialId = dto.serverCredentialId || null;
    if (dto.customWebhookUrl !== undefined) {
      acc.customWebhookUrl = dto.customWebhookUrl?.trim() ? dto.customWebhookUrl.trim() : null;
    }
    if (dto.smsWebhookUrl !== undefined) {
      acc.smsWebhookUrl = dto.smsWebhookUrl?.trim() ? dto.smsWebhookUrl.trim() : null;
    }
    if (dto.handoffNumber !== undefined) acc.handoffNumber = dto.handoffNumber || null;
    if (dto.handoffMessage !== undefined) acc.handoffMessage = dto.handoffMessage || null;
    if (dto.voiceProvider !== undefined) acc.voiceProvider = dto.voiceProvider;
    if (dto.voiceId !== undefined) acc.voiceId = dto.voiceId;
    if (dto.voiceModel !== undefined) acc.voiceModel = dto.voiceModel;
    if (dto.voiceLanguage !== undefined) acc.voiceLanguage = dto.voiceLanguage;
    if (dto.transcriberProvider !== undefined) acc.transcriberProvider = dto.transcriberProvider;
    if (dto.transcriberModel !== undefined) acc.transcriberModel = dto.transcriberModel;
    if (dto.transcriberLanguage !== undefined) acc.transcriberLanguage = dto.transcriberLanguage;
    if (dto.llmProvider !== undefined) acc.llmProvider = dto.llmProvider;
    if (dto.llmModel !== undefined) acc.llmModel = dto.llmModel;
    if (dto.systemPromptOverride !== undefined) {
      acc.systemPromptOverride = dto.systemPromptOverride?.trim() ? dto.systemPromptOverride.trim() : null;
    }
    if (dto.tone !== undefined) acc.tone = dto.tone;
    if (dto.maxDurationSeconds !== undefined) acc.maxDurationSeconds = dto.maxDurationSeconds;
    if (dto.isActive !== undefined) acc.isActive = dto.isActive;

    await this.vapiAccountRepo.save(acc);
    return this.getConfigSanitized();
  }

  getCatalog() {
    return VAPI_CATALOG;
  }

  private getEffectiveApiKey(account: VapiAccount): string {
    const key = account.apiKey || process.env.VAPI_API_KEY;
    if (!key) {
      throw new BadRequestException('Falta configurar la API Key de VAPI (VAPI_API_KEY).');
    }
    return key;
  }

  private getWebhookUrl(account?: VapiAccount): string {
    if (account?.customWebhookUrl && account.customWebhookUrl.trim() !== '') {
      const custom = account.customWebhookUrl.trim().replace(/\/$/, '');
      return custom.includes('/api/vapi/webhook') ? custom : `${custom}/api/vapi/webhook`;
    }

    const corsFirst = (process.env.CORS_ORIGIN || '')
      .split(',')
      .map((s) => s.trim())
      .find((s) => s.startsWith('https://') || (s.startsWith('http://') && !s.includes('localhost')));

    const host =
      process.env.APP_URL ||
      process.env.BACKEND_URL ||
      corsFirst ||
      process.env.NEXT_PUBLIC_API_URL ||
      'https://crm-salvadoraconesa.jigretera.com';

    const baseUrl = host.replace(/\/$/, '');
    return `${baseUrl}/api/vapi/webhook`;
  }

  async buildPromptData(): Promise<PromptInputData> {
    const [settings] = await this.settingsRepo.find({ take: 1 });
    const services = await this.servicesRepo.find({ where: { isActive: true } });
    const [agent] = await this.agentConfigRepo.find({ take: 1 });
    const acc = await this.getAccount();

    const hours =
      agent?.workingHours && agent.workingHours.length > 0
        ? agent.workingHours
        : [
            { day: 1, open: '09:00', close: '20:00' },
            { day: 2, open: '09:00', close: '20:00' },
            { day: 3, open: '09:00', close: '20:00' },
            { day: 4, open: '09:00', close: '20:00' },
            { day: 5, open: '09:00', close: '20:00' },
            { day: 6, open: '10:00', close: '14:00' },
          ];

    return {
      businessName: settings?.businessName || agent?.businessName || 'Centro de Yoga y Bienestar',
      businessDescription: agent?.businessDescription || 'Clases de yoga, consultas y sesiones de bienestar',
      timezone: agent?.timezone || 'Europe/Madrid',
      tone: acc.tone || agent?.tone || 'amable y profesional',
      hours,
      services: services.map((s) => ({
        name: s.name,
        durationMinutes: s.durationMinutes,
        price: s.price,
      })),
      phone: agent?.whatsappNumber || null,
    };
  }

  async previewPrompt(): Promise<{ prompt: string; isOverride: boolean }> {
    const acc = await this.getAccount();
    if (acc.systemPromptOverride && acc.systemPromptOverride.trim() !== '') {
      return { prompt: acc.systemPromptOverride, isOverride: true };
    }
    const data = await this.buildPromptData();
    return { prompt: composeVapiSystemPrompt(data), isOverride: false };
  }

  /**
   * Synchronize the 7 tools with VAPI
   */
  async syncTools(): Promise<{ synced: number; tools: Array<{ name: string; id: string; action: string }> }> {
    const acc = await this.getAccount();
    const apiKey = this.getEffectiveApiKey(acc);
    const webhookUrl = this.getWebhookUrl(acc);
    const toolDefs = buildVapiToolDefinitions(webhookUrl);

    // List existing tools in VAPI
    const res = await fetch(`${VAPI_BASE_URL}/tool`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      const errBody = await res.text();
      throw new BadRequestException(`Error al listar herramientas en VAPI (${res.status}): ${errBody}`);
    }

    const existingTools: any[] = await res.json();
    const existingByName = new Map<string, any>();
    if (Array.isArray(existingTools)) {
      for (const t of existingTools) {
        if (t.function?.name) {
          existingByName.set(t.function.name, t);
        }
      }
    }

    const results: Array<{ name: string; id: string; action: string }> = [];
    const errors: string[] = [];

    for (const def of toolDefs) {
      const name = def.function.name;
      const existing = existingByName.get(name);

      if (!existing) {
        // Create tool
        const createRes = await fetch(`${VAPI_BASE_URL}/tool`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(def),
        });
        if (!createRes.ok) {
          const err = await createRes.text();
          this.logger.error(`Error creando herramienta ${name}: ${err}`);
          errors.push(`${name}: ${err}`);
          continue;
        }
        const created = await createRes.json();
        results.push({ name, id: created.id, action: 'creada' });
      } else {
        // Update tool (omit immutable 'type' field in PATCH)
        const updatePayload = {
          function: def.function,
          server: def.server,
          messages: def.messages,
        };
        const updateRes = await fetch(`${VAPI_BASE_URL}/tool/${existing.id}`, {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(updatePayload),
        });
        if (!updateRes.ok) {
          // If PATCH failed, delete old tool and recreate
          await fetch(`${VAPI_BASE_URL}/tool/${existing.id}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${apiKey}` },
          }).catch(() => null);

          const recreateRes = await fetch(`${VAPI_BASE_URL}/tool`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(def),
          });

          if (!recreateRes.ok) {
            const err = await recreateRes.text();
            this.logger.error(`Error recreando herramienta ${name}: ${err}`);
            errors.push(`${name}: ${err}`);
            continue;
          }
          const created = await recreateRes.json();
          results.push({ name, id: created.id, action: 'recreada' });
        } else {
          const updated = await updateRes.json();
          results.push({ name, id: updated.id, action: 'actualizada' });
        }
      }
    }

    if (results.length === 0 && errors.length > 0) {
      throw new BadRequestException(`No se pudieron sincronizar las herramientas en VAPI: ${errors.join(', ')}`);
    }

    return { synced: results.length, tools: results };
  }

  /**
   * Publish / Synchronize the Assistant in VAPI
   */
  async publishAssistant(): Promise<{ assistantId: string; status: string }> {
    const acc = await this.getAccount();
    const apiKey = this.getEffectiveApiKey(acc);
    const webhookUrl = this.getWebhookUrl(acc);

    // 1. Sync tools first to get tool IDs
    const syncRes = await this.syncTools();
    const toolIds = syncRes.tools.map((t) => t.id);

    // 2. Compose system prompt
    const { prompt } = await this.previewPrompt();
    const promptData = await this.buildPromptData();

    // 3. Build model config
    const modelPayload: Record<string, any> = {
      provider: acc.llmProvider || 'openai',
      model: acc.llmModel || 'gpt-5.6-luna',
      messages: [
        {
          role: 'system',
          content: prompt,
        },
      ],
      toolIds,
      tools: [
        { type: 'endCall' },
      ],
    };

    if (acc.handoffNumber) {
      modelPayload.tools.push({
        type: 'transferCall',
        destinations: [
          {
            type: 'number',
            number: acc.handoffNumber,
            message: acc.handoffMessage || 'Un momento, te paso con un compañero.',
            description: 'Transferir la llamada a una persona cuando se solicite atención directa o haya una incidencia urgente.',
          },
        ],
      });
    }

    // 4. Build voice config
    const voicePayload: Record<string, any> = {
      provider: acc.voiceProvider || '11labs',
      voiceId: acc.voiceId || 'UOIqAnmS11Reiei1Ytkc',
    };
    if (acc.voiceModel) voicePayload.model = acc.voiceModel;
    if (acc.voiceLanguage) voicePayload.language = acc.voiceLanguage;

    // 5. Build transcriber config
    const transcriberPayload: Record<string, any> = {
      provider: acc.transcriberProvider || 'deepgram',
      model: acc.transcriberModel || 'nova-3-general',
      language: acc.transcriberLanguage || 'es',
    };

    // 6. Complete assistant payload
    const safeName = 'Recepcionista Escuela Yoga';

    const assistantPayload = {
      name: safeName,
      firstMessage: `Hola, gracias por llamar a ${promptData.businessName}. ¿En qué te puedo ayudar hoy?`,
      transcriber: transcriberPayload,
      model: modelPayload,
      voice: voicePayload,
      serverUrl: webhookUrl,
      ...(acc.webhookToken ? { serverUrlSecret: acc.webhookToken } : {}),
      serverMessages: [
        'end-of-call-report',
        'status-update',
        'tool-calls',
        'transcript',
        'hang',
      ],
      maxDurationSeconds: acc.maxDurationSeconds || 900,
      recordingEnabled: true,
      silenceTimeoutSeconds: 30,
      responseDelaySeconds: 0.4,
      llmRequestDelaySeconds: 0.1,
      endCallMessage: 'Gracias por llamar. ¡Que tengas un excelente día!',
      artifactPlan: {
        recordingEnabled: true,
        transcriptPlan: {
          enabled: true,
        },
      },
    };

    let assistantId = acc.assistantId;

    if (!assistantId) {
      // Create new assistant
      const createRes = await fetch(`${VAPI_BASE_URL}/assistant`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(assistantPayload),
      });

      if (!createRes.ok) {
        const err = await createRes.text();
        throw new BadRequestException(`Error creando asistente en VAPI (${createRes.status}): ${err}`);
      }

      const created = await createRes.json();
      assistantId = created.id;
      acc.assistantId = assistantId;
      await this.vapiAccountRepo.save(acc);
    } else {
      // Update existing assistant
      const updateRes = await fetch(`${VAPI_BASE_URL}/assistant/${assistantId}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(assistantPayload),
      });

      if (!updateRes.ok) {
        if (updateRes.status === 404) {
          // If 404, recreate
          const createRes = await fetch(`${VAPI_BASE_URL}/assistant`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(assistantPayload),
          });
          if (!createRes.ok) {
            const err = await createRes.text();
            throw new BadRequestException(`Error recreando asistente en VAPI (${createRes.status}): ${err}`);
          }
          const created = await createRes.json();
          assistantId = created.id;
          acc.assistantId = assistantId;
          await this.vapiAccountRepo.save(acc);
        } else {
          const err = await updateRes.text();
          throw new BadRequestException(`Error actualizando asistente en VAPI (${updateRes.status}): ${err}`);
        }
      }
    }

    // Auto-resolve and link phone number if available
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    let phoneIdToLink = acc.phoneNumberId;

    if (!phoneIdToLink || !UUID_REGEX.test(phoneIdToLink)) {
      try {
        const phoneListRes = await fetch(`${VAPI_BASE_URL}/phone-number`, {
          headers: { Authorization: `Bearer ${apiKey}` },
        });
        if (phoneListRes.ok) {
          const list = await phoneListRes.json();
          if (Array.isArray(list) && list.length > 0) {
            const match = acc.phoneNumber
              ? list.find(
                  (p: any) =>
                    p.number === acc.phoneNumber ||
                    p.number?.replace(/\D/g, '') === acc.phoneNumber?.replace(/\D/g, ''),
                )
              : list[0];
            const target = match || list[0];
            if (target?.id && UUID_REGEX.test(target.id)) {
              phoneIdToLink = target.id;
              acc.phoneNumberId = target.id;
              if (target.number) acc.phoneNumber = target.number;
              await this.vapiAccountRepo.save(acc).catch(() => null);
              this.logger.log(`Auto-resolved phone number UUID: ${target.id} (${target.number})`);
            }
          }
        }
      } catch (e) {
        this.logger.warn(`Could not auto-resolve phone number on publish: ${e}`);
      }
    }

    if (phoneIdToLink && UUID_REGEX.test(phoneIdToLink) && assistantId) {
      try {
        await fetch(`${VAPI_BASE_URL}/phone-number/${phoneIdToLink}`, {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            assistantId: assistantId,
            serverUrl: webhookUrl,
          }),
        });
        this.logger.log(`Linked assistant ${assistantId} to phone number ${phoneIdToLink}`);
      } catch (e) {
        this.logger.warn(`Could not update phone number with assistantId: ${e}`);
      }
    }

    return { assistantId: assistantId!, status: 'publicado_y_sincronizado' };
  }

  /**
   * List phone numbers from VAPI account
   */
  async listPhoneNumbersFromVapi(): Promise<Array<{ id: string; number: string; name?: string }>> {
    const acc = await this.getAccount();
    const apiKey = this.getEffectiveApiKey(acc);
    if (!apiKey) return [];

    try {
      const res = await fetch(`${VAPI_BASE_URL}/phone-number`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!res.ok) {
        this.logger.warn(`Error fetching phone numbers from VAPI (${res.status})`);
        return [];
      }
      const list = await res.json();
      if (!Array.isArray(list)) return [];
      return list.map((p: any) => ({
        id: p.id,
        number: p.number,
        name: p.name || p.number,
      }));
    } catch (err) {
      this.logger.error(`Failed to list phone numbers from VAPI: ${err}`);
      return [];
    }
  }

  /**
   * Launch an Outbound Call to a contact or test phone number
   */
  async startOutboundCall(
    targetPhone: string,
    contactId?: string,
    customFirstMessage?: string,
  ): Promise<{ ok: boolean; callId?: string; error?: string }> {
    const acc = await this.getAccount();
    const apiKey = this.getEffectiveApiKey(acc);

    if (!acc.assistantId) {
      throw new BadRequestException('El asistente aún no está publicado en VAPI. Pulsa «Publicar Asistente» primero.');
    }

    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    let resolvedPhoneId = acc.phoneNumberId;

    if (!resolvedPhoneId || !UUID_REGEX.test(resolvedPhoneId)) {
      // Auto-resolve phone number ID from VAPI
      try {
        const phoneRes = await fetch(`${VAPI_BASE_URL}/phone-number`, {
          headers: { Authorization: `Bearer ${apiKey}` },
        });

        if (phoneRes.ok) {
          const phoneList = await phoneRes.json();
          if (Array.isArray(phoneList) && phoneList.length > 0) {
            const match = acc.phoneNumber
              ? phoneList.find(
                  (p: any) =>
                    p.number === acc.phoneNumber ||
                    p.number?.replace(/\D/g, '') === acc.phoneNumber?.replace(/\D/g, ''),
                )
              : phoneList[0];

            const target = match || phoneList[0];
            if (target?.id && UUID_REGEX.test(target.id)) {
              resolvedPhoneId = target.id;
              acc.phoneNumberId = target.id;
              if (target.number) acc.phoneNumber = target.number;
              await this.vapiAccountRepo.save(acc).catch(() => null);
              this.logger.log(`Auto-resolved VAPI phoneNumberId to: ${resolvedPhoneId} (${target.number})`);
            }
          }
        }
      } catch (e) {
        this.logger.warn(`Error resolving phone numbers from VAPI: ${e}`);
      }
    }

    if (!resolvedPhoneId || !UUID_REGEX.test(resolvedPhoneId)) {
      throw new BadRequestException(
        'No se pudo encontrar un Phone Number ID válido en tu cuenta de VAPI. Comprueba que tienes un número importado en tu panel de VAPI (Phone Numbers).',
      );
    }

    let contact: Contact | null = null;
    if (contactId) {
      contact = await this.contactsRepo.findOne({ where: { id: contactId } });
    }

    const trimmedPhone = targetPhone.trim();
    const isSipUri = trimmedPhone.includes('@') || trimmedPhone.startsWith('sip:');
    const isShortcode = /^\d{3,6}$/.test(trimmedPhone);

    const customerPayload: any = {};
    if (isSipUri) {
      customerPayload.sipUri = trimmedPhone.startsWith('sip:') ? trimmedPhone : `sip:${trimmedPhone}`;
    } else if (isShortcode) {
      customerPayload.sipUri = `sip:${trimmedPhone}@sip.zadarma.com`;
    } else {
      customerPayload.number = trimmedPhone;
    }
    if (contact?.name) {
      customerPayload.name = contact.name;
    }

    const payload: any = {
      assistantId: acc.assistantId,
      phoneNumberId: resolvedPhoneId,
      customer: customerPayload,
      metadata: {
        contactId: contact?.id || null,
        direction: 'outbound',
      },
    };

    if (customFirstMessage) {
      payload.assistantOverrides = {
        firstMessage: customFirstMessage,
      };
    }

    const res = await fetch(`${VAPI_BASE_URL}/call`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.text();
      this.logger.error(`Error al iniciar llamada saliente: ${err}`);
      return { ok: false, error: `Error en VAPI (${res.status}): ${err}` };
    }

    const data = await res.json();
    const vapiCallId = data.id;

    // Create Call row
    const call = this.callsRepo.create({
      vapiCallId,
      direction: CallDirection.OUTBOUND,
      fromNumber: acc.phoneNumber || 'VAPI',
      toNumber: targetPhone,
      status: CallStatus.QUEUED,
      contactId: contact?.id || null,
      startedAt: new Date(),
    });
    await this.callsRepo.save(call);

    return { ok: true, callId: vapiCallId };
  }

  /**
   * Launch an Outbound call informing the customer that their appointment is waiting for teacher approval
   */
  async notifyApprovalPendingCall(
    appointmentId: string,
    phoneOverride?: string,
  ): Promise<{ ok: boolean; callId?: string; error?: string }> {
    const appt = await this.appointmentsRepo.findOne({ where: { id: appointmentId } });
    if (!appt) {
      throw new NotFoundException(`No se encontró la cita con ID ${appointmentId}`);
    }

    const contact = appt.contactId
      ? await this.contactsRepo.findOne({ where: { id: appt.contactId } })
      : null;

    const phone = phoneOverride || contact?.phone;
    if (!phone) {
      throw new BadRequestException('El contacto no tiene un teléfono válido para recibir la llamada.');
    }

    const customerName = contact?.name || 'Alumno';
    const message = `Hola ${customerName}, te llamamos del Centro de Yoga Salvadora Conesa para informarte de que tu solicitud de cita para ${appt.service} ha sido recibida y se encuentra actualmente a la espera de la decisión y confirmación del profesor Jose Ignacio Gomez Raya. Te avisaremos en cuanto esté confirmada. ¡Muchas gracias!`;

    return this.startOutboundCall(phone, contact?.id, message);
  }

  /**
   * Sync a call details (transcript, recording, summary, duration, cost) directly from VAPI API
   */
  async syncCallFromVapi(callIdOrDbId: string): Promise<Call> {
    const acc = await this.getAccount();
    const apiKey = this.getEffectiveApiKey(acc);
    if (!apiKey) {
      throw new BadRequestException('API Key de VAPI no configurada.');
    }

    const call = await this.callsRepo.findOne({
      where: [{ id: callIdOrDbId }, { vapiCallId: callIdOrDbId }],
      relations: ['contact'],
    });

    if (!call) {
      throw new NotFoundException(`Llamada con identificador ${callIdOrDbId} no encontrada.`);
    }

    if (!call.vapiCallId) {
      return call;
    }

    try {
      const res = await fetch(`${VAPI_BASE_URL}/call/${call.vapiCallId}`, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      });

      if (!res.ok) {
        const err = await res.text();
        this.logger.warn(`No se pudo sincronizar la llamada desde VAPI (${res.status}): ${err}`);
        return call;
      }

      const vapiData = await res.json();

      const recordingUrl =
        vapiData.artifact?.recordingUrl ||
        vapiData.recordingUrl ||
        (typeof vapiData.artifact?.recording === 'string'
          ? vapiData.artifact?.recording
          : (vapiData.artifact?.recording as any)?.url) ||
        call.recordingUrl;

      const summary =
        vapiData.analysis?.summary ||
        vapiData.summary ||
        vapiData.artifact?.summary ||
        call.summary;

      let transcript =
        vapiData.artifact?.transcript ||
        vapiData.transcript ||
        call.transcript;

      const messages =
        vapiData.artifact?.messages ||
        vapiData.messages ||
        call.messages;

      if (!transcript && Array.isArray(messages) && messages.length > 0) {
        transcript = messages
          .filter((m: any) => m.message || m.content)
          .map((m: any) => {
            const role =
              m.role === 'assistant' || m.role === 'bot'
                ? 'Asistente'
                : m.role === 'user' || m.role === 'customer'
                ? 'Cliente'
                : 'Herramienta';
            return `${role}: ${m.message || m.content}`;
          })
          .join('\n');
      }

      const rawCost = typeof vapiData.cost === 'number' ? vapiData.cost : null;
      const costCents = rawCost !== null ? Math.round(rawCost * 100) : call.costCents;
      const endedReason = vapiData.endedReason || call.endedReason;

      const startedAt = vapiData.startedAt ? new Date(vapiData.startedAt) : call.startedAt;
      const endedAt = vapiData.endedAt ? new Date(vapiData.endedAt) : call.endedAt;

      let durationSeconds = call.durationSeconds;
      if (typeof vapiData.durationSeconds === 'number') {
        durationSeconds = vapiData.durationSeconds;
      } else if (typeof vapiData.duration === 'number') {
        durationSeconds = Math.round(vapiData.duration);
      } else if (startedAt && endedAt) {
        durationSeconds = Math.max(0, Math.round((new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 1000));
      }

      let status = call.status;
      if (vapiData.status === 'ended') status = CallStatus.ENDED;
      else if (vapiData.status === 'failed') status = CallStatus.FAILED;
      else if (vapiData.status === 'in-progress') status = CallStatus.IN_PROGRESS;

      call.recordingUrl = recordingUrl;
      call.summary = summary;
      call.transcript = transcript;
      call.messages = messages;
      call.costCents = costCents;
      call.endedReason = endedReason;
      if (startedAt) call.startedAt = startedAt;
      if (endedAt) call.endedAt = endedAt;
      if (durationSeconds !== null) call.durationSeconds = durationSeconds;
      call.status = status;

      return await this.callsRepo.save(call);
    } catch (err: any) {
      this.logger.error(`Error sincronizando llamada ${call.vapiCallId}: ${err?.message || err}`);
      return call;
    }
  }

  /**
   * Synchronize all recent calls that lack transcripts or are in-progress
   */
  async syncRecentCalls(): Promise<{ synced: number }> {
    const acc = await this.getAccount();
    const apiKey = this.getEffectiveApiKey(acc);
    if (!apiKey) return { synced: 0 };

    const unsynced = await this.callsRepo
      .createQueryBuilder('c')
      .where('c.vapiCallId IS NOT NULL')
      .andWhere('(c.transcript IS NULL OR c.status = :inProg)', { inProg: CallStatus.IN_PROGRESS })
      .orderBy('c.createdAt', 'DESC')
      .take(20)
      .getMany();

    let count = 0;
    for (const c of unsynced) {
      try {
        await this.syncCallFromVapi(c.id);
        count++;
      } catch (err) {
        this.logger.warn(`Error sincronizando llamada ${c.id}: ${err}`);
      }
    }
    return { synced: count };
  }

  /**
   * Stream call recording audio directly to the browser to prevent 401 and CORS errors
   */
  async streamCallRecording(callIdOrDbId: string, res: any): Promise<void> {
    const acc = await this.getAccount();
    const apiKey = this.getEffectiveApiKey(acc);

    const call = await this.callsRepo.findOne({
      where: [{ id: callIdOrDbId }, { vapiCallId: callIdOrDbId }],
    });

    if (!call) {
      throw new NotFoundException('Llamada no encontrada.');
    }

    let targetUrl = call.recordingUrl;

    // If recordingUrl is not saved yet, use VAPI mono-recording endpoint
    if (!targetUrl && call.vapiCallId) {
      targetUrl = `${VAPI_BASE_URL}/call/${call.vapiCallId}/mono-recording`;
    }

    if (!targetUrl) {
      throw new NotFoundException('No hay grabación de audio disponible para esta llamada.');
    }

    try {
      let audioRes = await fetch(targetUrl, {
        headers: targetUrl.includes('api.vapi.ai')
          ? { Authorization: `Bearer ${apiKey}` }
          : {},
        redirect: 'follow',
      });

      // Fallback to mono-recording or stereo-recording if needed
      if (!audioRes.ok && call.vapiCallId) {
        const altUrl = `${VAPI_BASE_URL}/call/${call.vapiCallId}/mono-recording`;
        if (targetUrl !== altUrl) {
          audioRes = await fetch(altUrl, {
            headers: { Authorization: `Bearer ${apiKey}` },
            redirect: 'follow',
          });
        }
      }

      if (!audioRes.ok) {
        throw new NotFoundException(`La grabación no está disponible en VAPI (${audioRes.status}).`);
      }

      const contentType = audioRes.headers.get('content-type') || 'audio/mpeg';
      const contentLength = audioRes.headers.get('content-length');

      res.setHeader('Content-Type', contentType);
      if (contentLength) {
        res.setHeader('Content-Length', contentLength);
      }
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Cache-Control', 'private, max-age=3600');

      const arrayBuffer = await audioRes.arrayBuffer();
      res.end(Buffer.from(arrayBuffer));
    } catch (err: any) {
      if (err instanceof NotFoundException) throw err;
      this.logger.error(`Error transmitiendo audio de llamada ${call.vapiCallId}: ${err?.message || err}`);
      throw new NotFoundException('Error al recuperar el archivo de audio de la llamada.');
    }
  }

  /**
   * Automatically create a BYO SIP Trunk credential in VAPI and link it to the configured phone number
   */
  async connectSipTrunkToPhoneNumber(dto: {
    authUsername: string;
    authPassword: string;
    gateway?: string;
  }): Promise<{ ok: boolean; credentialId: string; message: string }> {
    const acc = await this.getAccount();
    const apiKey = this.getEffectiveApiKey(acc);

    if (!dto.authUsername?.trim() || !dto.authPassword?.trim()) {
      throw new BadRequestException('Debes indicar el usuario y la contraseña SIP de Zadarma.');
    }

    const gateway = dto.gateway?.trim() || 'sip.zadarma.com';

    // 1. Create credential in VAPI
    const credPayload = {
      provider: 'byo-sip-trunk',
      name: `Zadarma-${dto.authUsername.trim()}`,
      gateways: [
        {
          ip: gateway,
          inboundEnabled: false,
        },
      ],
      outboundLeadingPlusEnabled: true,
      outboundAuthenticationPlan: {
        authUsername: dto.authUsername.trim(),
        authPassword: dto.authPassword.trim(),
      },
    };

    const credRes = await fetch(`${VAPI_BASE_URL}/credential`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(credPayload),
    });

    if (!credRes.ok) {
      const err = await credRes.text();
      this.logger.error(`Error creando credencial SIP en VAPI: ${err}`);
      throw new BadRequestException(`Error en VAPI al registrar la credencial SIP (${credRes.status}): ${err}`);
    }

    const credData = await credRes.json();
    const credentialId = credData.id;

    // 2. Resolve target phone number if not set or not UUID
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    let phoneId = acc.phoneNumberId;

    if (!phoneId || !UUID_REGEX.test(phoneId)) {
      const phoneList = await this.listPhoneNumbersFromVapi();
      if (phoneList.length > 0) {
        phoneId = phoneList[0].id;
        acc.phoneNumberId = phoneId;
        acc.phoneNumber = phoneList[0].number;
      }
    }

    // 3. Link credential to phone number in VAPI
    if (phoneId && UUID_REGEX.test(phoneId)) {
      const patchRes = await fetch(`${VAPI_BASE_URL}/phone-number/${phoneId}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          credentialId: credentialId,
        }),
      });

      if (!patchRes.ok) {
        const err = await patchRes.text();
        this.logger.warn(`Could not link credential to phone number in VAPI: ${err}`);
      } else {
        this.logger.log(`Linked credential ${credentialId} to phone number ${phoneId}`);
      }
    }

    acc.serverCredentialId = credentialId;
    await this.vapiAccountRepo.save(acc);

    return {
      ok: true,
      credentialId,
      message: 'Línea SIP de Zadarma vinculada correctamente con VAPI para llamadas salientes.',
    };
  }

  /**
   * Send an echo test SIP call to Zadarma (sip:4444@sip.zadarma.com)
   * to automatically confirm the IP in Zadarma.
   */
  async sendEchoTestCallToZadarma(): Promise<{ ok: boolean; message: string; callId?: string }> {
    const acc = await this.getAccount();
    const apiKey = this.getEffectiveApiKey(acc);

    if (!acc.assistantId) {
      throw new BadRequestException('El asistente aún no está publicado en VAPI. Pulsa «Publicar Asistente» primero.');
    }

    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    let phoneId = acc.phoneNumberId;

    if (!phoneId || !UUID_REGEX.test(phoneId)) {
      const list = await this.listPhoneNumbersFromVapi();
      if (list.length > 0) {
        phoneId = list[0].id;
        acc.phoneNumberId = phoneId;
        await this.vapiAccountRepo.save(acc).catch(() => null);
      }
    }

    const targets = ['sip:4444@sip.zadarma.com', 'sip:8888@sip.zadarma.com'];
    let lastCallId: string | undefined;
    const errors: string[] = [];

    for (const target of targets) {
      try {
        const payload = {
          assistantId: acc.assistantId,
          phoneNumberId: phoneId,
          customer: {
            sipUri: target,
          },
        };

        const res = await fetch(`${VAPI_BASE_URL}/call`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });

        if (res.ok) {
          const data = await res.json();
          lastCallId = data.id;
          this.logger.log(`Echo test call sent to ${target}: ${data.id}`);
        } else {
          const err = await res.text();
          this.logger.warn(`Echo test to ${target} returned (${res.status}): ${err}`);
          errors.push(`${target}: ${err}`);
        }
      } catch (e: any) {
        this.logger.warn(`Error sending echo test call to ${target}: ${e?.message || e}`);
      }
    }

    if (!lastCallId && errors.length > 0) {
      throw new BadRequestException(`Error enviando llamada de eco a Zadarma: ${errors.join(', ')}`);
    }

    return {
      ok: true,
      callId: lastCallId,
      message: 'Llamada de eco enviada a Zadarma desde VAPI (4444 y 8888). En 15 segundos recarga tu panel de Zadarma.',
    };
  }
}
