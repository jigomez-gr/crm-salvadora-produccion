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
    const host = process.env.APP_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
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
    const toolDefs = buildVapiToolDefinitions(webhookUrl, acc.serverCredentialId || undefined);

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
    for (const t of existingTools) {
      if (t.function?.name) {
        existingByName.set(t.function.name, t);
      }
    }

    const results: Array<{ name: string; id: string; action: string }> = [];

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
          continue;
        }
        const created = await createRes.json();
        results.push({ name, id: created.id, action: 'creada' });
      } else {
        // Update tool
        const updateRes = await fetch(`${VAPI_BASE_URL}/tool/${existing.id}`, {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(def),
        });
        if (!updateRes.ok) {
          const err = await updateRes.text();
          this.logger.error(`Error actualizando herramienta ${name}: ${err}`);
          continue;
        }
        const updated = await updateRes.json();
        results.push({ name, id: updated.id, action: 'actualizada' });
      }
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
      ...(acc.serverCredentialId ? { serverUrlSecret: acc.serverCredentialId } : {}),
      maxDurationSeconds: acc.maxDurationSeconds || 900,
      recordingEnabled: true,
      silenceTimeoutSeconds: 30,
      responseDelaySeconds: 0.4,
      llmRequestDelaySeconds: 0.1,
      endCallMessage: 'Gracias por llamar. ¡Que tengas un excelente día!',
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

    return { assistantId: assistantId!, status: 'publicado_y_sincronizado' };
  }

  /**
   * Launch an Outbound Call to a contact or test phone number
   */
  async startOutboundCall(targetPhone: string, contactId?: string): Promise<{ ok: boolean; callId?: string; error?: string }> {
    const acc = await this.getAccount();
    const apiKey = this.getEffectiveApiKey(acc);

    if (!acc.assistantId) {
      throw new BadRequestException('El asistente aún no está publicado en VAPI. Pulsa «Publicar Asistente» primero.');
    }
    if (!acc.phoneNumberId) {
      throw new BadRequestException('Falta configurar el Phone Number ID de VAPI en los ajustes.');
    }

    let contact: Contact | null = null;
    if (contactId) {
      contact = await this.contactsRepo.findOne({ where: { id: contactId } });
    }

    const payload = {
      assistantId: acc.assistantId,
      phoneNumberId: acc.phoneNumberId,
      customer: {
        number: targetPhone,
        name: contact?.name || undefined,
      },
      metadata: {
        contactId: contact?.id || null,
        direction: 'outbound',
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
}
