import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { AgentConfig } from '../../common/entities/agent-config.entity';
import { normalizePhoneLoose } from '../../common/phone';
import {
  WhatsappConnectionStatus,
  WhatsappProvider,
  WhatsappSendResult,
  WhatsappSendTemplateParams,
  WhatsappSendTextParams,
} from './whatsapp-provider.interface';

const DEFAULT_TIMEOUT_MS = 15_000;

export const EVOLUTION_WEBHOOK_EVENTS = [
  'MESSAGES_UPSERT',
  'MESSAGES_UPDATE',
  'CONNECTION_UPDATE',
  'QRCODE_UPDATED',
] as const;

export interface EvolutionHttpResult {
  ok: boolean;
  status: number;
  data: any;
  errorMessage?: string;
}

@Injectable()
export class EvolutionProvider implements WhatsappProvider {
  readonly type = 'evolution' as const;
  private readonly logger = new Logger(EvolutionProvider.name);

  /**
   * Normalizes a recipient phone number for Evolution API v2 (`34600112233` digits).
   * Never hardcodes any phone number.
   */
  normalizeRecipientNumber(phone: string): string {
    if (!phone) return '';
    const e164 = normalizePhoneLoose(phone);
    return e164.replace(/\D/g, '');
  }

  /**
   * Normalizes and validates the configured Evolution API base URL.
   */
  normalizeBaseUrl(rawUrl?: string | null): string | null {
    if (!rawUrl || typeof rawUrl !== 'string') return null;
    const trimmed = rawUrl.trim().replace(/\/+$/, '');
    if (!trimmed) return null;
    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return null;
      }
      return trimmed;
    } catch {
      return null;
    }
  }

  /**
   * Sends a plain text WhatsApp message via Evolution API v2.3.7:
   * POST /message/sendText/{instance}
   */
  async sendTextMessage(params: WhatsappSendTextParams): Promise<WhatsappSendResult> {
    const config = params.config;
    const baseUrl = this.normalizeBaseUrl(config?.evolutionApiUrl);
    const instanceName = config?.evolutionInstanceName?.trim();
    const apiKey = (params.apiKeyOverride ?? config?.evolutionApiKey)?.trim();

    if (!baseUrl || !instanceName || !apiKey) {
      const error =
        'Evolution API no está completamente configurado en el agente (URL, instancia o API Key).';
      this.logger.warn(`[Evolution] Cannot send text: ${error}`);
      return { ok: false, error };
    }

    const toDigits = this.normalizeRecipientNumber(params.to);
    if (!toDigits) {
      return { ok: false, error: 'Número de destino inválido para Evolution API.' };
    }

    const res = await this.requestEvolution(
      baseUrl,
      apiKey,
      'POST',
      `/message/sendText/${encodeURIComponent(instanceName)}`,
      {
        number: toDigits,
        text: params.body,
      },
    );

    if (!res.ok) {
      this.logger.error(
        `[Evolution] sendText failed for instance '${instanceName}' (${res.status}): ${res.errorMessage ?? 'unknown error'}`,
      );
      return {
        ok: false,
        error: res.errorMessage || `Evolution HTTP ${res.status}`,
      };
    }

    const providerMessageId: string | undefined =
      res.data?.key?.id ??
      res.data?.message?.key?.id ??
      res.data?.data?.key?.id ??
      res.data?.id;
    const status: string | undefined =
      res.data?.status ?? res.data?.data?.status ?? 'PENDING';

    return {
      ok: true,
      providerMessageId,
      status,
    };
  }

  /**
   * Evolution API uses WhatsApp Web/Baileys and does not require HSM templates.
   * If a caller provides `fallbackText` (or template body parameters), it sends direct text.
   */
  async sendTemplateMessage(
    params: WhatsappSendTemplateParams,
  ): Promise<WhatsappSendResult> {
    if (params.fallbackText && params.fallbackText.trim().length > 0) {
      return this.sendTextMessage({
        config: params.config,
        from: params.from,
        to: params.to,
        body: params.fallbackText,
        apiKeyOverride: params.apiKeyOverride,
      });
    }

    // Build readable text if body parameters were passed
    const bodyComp = params.components?.find((c) => c.type === 'body');
    const values = bodyComp?.parameters?.map((p) => p.text).filter(Boolean) ?? [];
    if (values.length >= 3) {
      const [contactName, serviceName, whenStr] = values;
      const synthesized = `Hola ${contactName}, te recordamos tu cita de ${serviceName} programada para el ${whenStr}. Centro de Yoga Salvadora Conesa.`;
      return this.sendTextMessage({
        config: params.config,
        from: params.from,
        to: params.to,
        body: synthesized,
        apiKeyOverride: params.apiKeyOverride,
      });
    }

    return {
      ok: false,
      error:
        'Evolution API envía recordatorios como texto directo y requiere fallbackText o parámetros de cita.',
    };
  }

  /**
   * Queries live connection state from Evolution API:
   * GET /instance/connectionState/{instance}
   */
  async getConnectionStatus(
    config: AgentConfig | null | undefined,
  ): Promise<WhatsappConnectionStatus> {
    const baseUrl = this.normalizeBaseUrl(config?.evolutionApiUrl);
    const instanceName = config?.evolutionInstanceName?.trim() || null;
    const apiKey = config?.evolutionApiKey?.trim();

    if (!baseUrl || !instanceName || !apiKey) {
      return {
        provider: 'evolution',
        state: 'unconfigured',
        instanceName,
        detail:
          'Falta configurar URL de Evolution API, nombre de instancia o API Key.',
      };
    }

    const res = await this.requestEvolution(
      baseUrl,
      apiKey,
      'GET',
      `/instance/connectionState/${encodeURIComponent(instanceName)}`,
    );

    if (res.status === 404) {
      return {
        provider: 'evolution',
        state: 'close',
        instanceName,
        detail:
          'La instancia aún no está creada en Evolution API. Pulsa "Crear / Conectar" para inicializarla.',
      };
    }

    if (!res.ok) {
      return {
        provider: 'evolution',
        state: 'unknown',
        instanceName,
        detail:
          res.errorMessage || `Error al consultar estado en Evolution (HTTP ${res.status})`,
      };
    }

    const rawState = String(
      res.data?.instance?.state ?? res.data?.state ?? 'unknown',
    ).toLowerCase();

    const state: WhatsappConnectionStatus['state'] =
      rawState === 'open' || rawState === 'connecting' || rawState === 'close'
        ? rawState
        : 'unknown';

    return {
      provider: 'evolution',
      state,
      instanceName,
    };
  }

  /**
   * Ensures the configured instance exists in Evolution API.
   * Checks GET /instance/connectionState/{instance}; if 404, calls POST /instance/create.
   */
  async ensureInstance(config: AgentConfig): Promise<{
    created: boolean;
    instanceName: string;
    state: 'open' | 'connecting' | 'close' | 'unknown';
    qrBase64?: string | null;
    pairingCode?: string | null;
  }> {
    const { baseUrl, instanceName, apiKey } = this.requireCredentials(config);

    const stateRes = await this.requestEvolution(
      baseUrl,
      apiKey,
      'GET',
      `/instance/connectionState/${encodeURIComponent(instanceName)}`,
    );

    if (stateRes.ok) {
      const rawState = String(
        stateRes.data?.instance?.state ?? stateRes.data?.state ?? 'close',
      ).toLowerCase();
      const state =
        rawState === 'open' || rawState === 'connecting' || rawState === 'close'
          ? rawState
          : 'unknown';
      return {
        created: false,
        instanceName,
        state,
      };
    }

    if (stateRes.status !== 404) {
      throw new HttpException(
        stateRes.errorMessage ||
          `No se pudo verificar la instancia '${instanceName}' en Evolution API (HTTP ${stateRes.status}).`,
        HttpStatus.BAD_GATEWAY,
      );
    }

    // 404 -> Create the instance in Evolution API v2.3.7
    const createPayload: Record<string, unknown> = {
      instanceName,
      integration: 'WHATSAPP-BAILEYS',
      qrcode: true,
    };

    if (config.whatsappNumber) {
      const senderDigits = this.normalizeRecipientNumber(config.whatsappNumber);
      if (senderDigits) {
        createPayload.number = senderDigits;
      }
    }

    const createRes = await this.requestEvolution(
      baseUrl,
      apiKey,
      'POST',
      '/instance/create',
      createPayload,
    );

    if (!createRes.ok) {
      throw new HttpException(
        createRes.errorMessage ||
          `No se pudo crear la instancia '${instanceName}' en Evolution API (HTTP ${createRes.status}).`,
        HttpStatus.BAD_GATEWAY,
      );
    }

    const qrBase64: string | null =
      createRes.data?.qrcode?.base64 ?? createRes.data?.base64 ?? null;
    const pairingCode: string | null =
      createRes.data?.qrcode?.pairingCode ?? createRes.data?.pairingCode ?? null;

    return {
      created: true,
      instanceName,
      state: 'connecting',
      qrBase64,
      pairingCode,
    };
  }

  /**
   * Ensures the instance exists, configures its webhook if evolutionWebhookSecret is present,
   * and requests connection / QR code from Evolution API.
   */
  async connectInstance(
    config: AgentConfig,
    webhookBaseUrlOverride?: string,
  ): Promise<WhatsappConnectionStatus & { created?: boolean; webhookConfigured?: boolean }> {
    const ensured = await this.ensureInstance(config);

    let webhookConfigured = false;
    if (config.evolutionWebhookSecret?.trim()) {
      try {
        await this.configureWebhook(config, webhookBaseUrlOverride);
        webhookConfigured = true;
      } catch (err) {
        this.logger.warn(
          `[Evolution] Could not auto-configure webhook during connect for '${ensured.instanceName}': ${(err as Error)?.message ?? err}`,
        );
      }
    }

    if (ensured.state === 'open') {
      return {
        provider: 'evolution',
        state: 'open',
        instanceName: ensured.instanceName,
        qrBase64: null,
        pairingCode: null,
        created: ensured.created,
        webhookConfigured,
      };
    }

    if (ensured.created && ensured.qrBase64) {
      return {
        provider: 'evolution',
        state: 'connecting',
        instanceName: ensured.instanceName,
        qrBase64: ensured.qrBase64,
        pairingCode: ensured.pairingCode ?? null,
        created: true,
        webhookConfigured,
      };
    }

    const qrStatus = await this.getQr(config);
    return {
      ...qrStatus,
      created: ensured.created,
      webhookConfigured,
    };
  }

  /**
   * Fetches the current QR code / pairing code from Evolution API:
   * GET /instance/connect/{instance}
   */
  async getQr(config: AgentConfig): Promise<WhatsappConnectionStatus> {
    const { baseUrl, instanceName, apiKey } = this.requireCredentials(config);

    const res = await this.requestEvolution(
      baseUrl,
      apiKey,
      'GET',
      `/instance/connect/${encodeURIComponent(instanceName)}`,
    );

    if (!res.ok) {
      throw new HttpException(
        res.errorMessage ||
          `No se pudo obtener el código QR de Evolution API (HTTP ${res.status}).`,
        res.status === 404 ? HttpStatus.NOT_FOUND : HttpStatus.BAD_GATEWAY,
      );
    }

    const qrBase64: string | null =
      res.data?.base64 ?? res.data?.qrcode?.base64 ?? null;
    const pairingCode: string | null =
      res.data?.pairingCode ?? res.data?.qrcode?.pairingCode ?? null;
    const rawState = String(
      res.data?.instance?.state ??
        res.data?.state ??
        (qrBase64 ? 'connecting' : 'close'),
    ).toLowerCase();

    const state: WhatsappConnectionStatus['state'] =
      rawState === 'open' || rawState === 'connecting' || rawState === 'close'
        ? rawState
        : qrBase64
          ? 'connecting'
          : 'unknown';

    return {
      provider: 'evolution',
      state,
      instanceName,
      qrBase64,
      pairingCode,
    };
  }

  /**
   * Configures the instance webhook in Evolution API v2.3.7:
   * POST /webhook/set/{instance}
   */
  async configureWebhook(
    config: AgentConfig,
    webhookBaseUrlOverride?: string,
  ): Promise<{
    ok: boolean;
    instanceName: string;
    webhookUrl: string;
    events: string[];
  }> {
    const { baseUrl, instanceName, apiKey } = this.requireCredentials(config);
    const webhookSecret = config.evolutionWebhookSecret?.trim();

    if (!webhookSecret) {
      throw new BadRequestException(
        'Debes configurar y guardar primero el Webhook Secret de Evolution en el agente.',
      );
    }

    const resolvedBase = this.resolveWebhookBaseUrl(webhookBaseUrlOverride);
    const webhookUrl = `${resolvedBase}/api/webhooks/evolution/${encodeURIComponent(
      config.agentKey,
    )}`;

    const res = await this.requestEvolution(
      baseUrl,
      apiKey,
      'POST',
      `/webhook/set/${encodeURIComponent(instanceName)}`,
      {
        webhook: {
          enabled: true,
          url: webhookUrl,
          byEvents: false,
          base64: false,
          headers: {
            'x-evolution-secret': webhookSecret,
          },
          events: [...EVOLUTION_WEBHOOK_EVENTS],
        },
      },
    );

    if (!res.ok) {
      throw new HttpException(
        res.errorMessage ||
          `No se pudo configurar el webhook en Evolution API (HTTP ${res.status}).`,
        HttpStatus.BAD_GATEWAY,
      );
    }

    return {
      ok: true,
      instanceName,
      webhookUrl,
      events: [...EVOLUTION_WEBHOOK_EVENTS],
    };
  }

  /**
   * Restarts the Evolution API instance:
   * POST /instance/restart/{instance} (verified on Evolution API v2.3.7; falls back to PUT if needed).
   */
  async restartInstance(config: AgentConfig): Promise<{
    ok: boolean;
    instanceName: string;
    state: string;
  }> {
    const { baseUrl, instanceName, apiKey } = this.requireCredentials(config);
    const path = `/instance/restart/${encodeURIComponent(instanceName)}`;

    let res = await this.requestEvolution(baseUrl, apiKey, 'POST', path);
    if (
      res.status === 404 &&
      typeof res.errorMessage === 'string' &&
      res.errorMessage.includes('Cannot POST')
    ) {
      res = await this.requestEvolution(baseUrl, apiKey, 'PUT', path);
    }

    if (!res.ok) {
      throw new HttpException(
        res.errorMessage ||
          `No se pudo reiniciar la instancia '${instanceName}' en Evolution API (HTTP ${res.status}).`,
        HttpStatus.BAD_GATEWAY,
      );
    }

    const state = String(
      res.data?.instance?.state ?? res.data?.state ?? 'connecting',
    ).toLowerCase();

    return {
      ok: true,
      instanceName,
      state,
    };
  }

  /**
   * Disconnects / logs out the Evolution API instance:
   * DELETE /instance/logout/{instance}
   */
  async logoutInstance(config: AgentConfig): Promise<{
    ok: boolean;
    instanceName: string;
    state: 'close';
  }> {
    const { baseUrl, instanceName, apiKey } = this.requireCredentials(config);

    const res = await this.requestEvolution(
      baseUrl,
      apiKey,
      'DELETE',
      `/instance/logout/${encodeURIComponent(instanceName)}`,
    );

    if (!res.ok) {
      throw new HttpException(
        res.errorMessage ||
          `No se pudo desconectar la instancia '${instanceName}' en Evolution API (HTTP ${res.status}).`,
        HttpStatus.BAD_GATEWAY,
      );
    }

    return {
      ok: true,
      instanceName,
      state: 'close',
    };
  }

  private requireCredentials(config: AgentConfig | null | undefined): {
    baseUrl: string;
    instanceName: string;
    apiKey: string;
  } {
    const baseUrl = this.normalizeBaseUrl(config?.evolutionApiUrl);
    const instanceName = config?.evolutionInstanceName?.trim();
    const apiKey = config?.evolutionApiKey?.trim();

    if (!baseUrl || !instanceName || !apiKey) {
      throw new BadRequestException(
        'Configura y guarda primero la URL de Evolution API, la API Key y el nombre de instancia en el agente.',
      );
    }

    return { baseUrl, instanceName, apiKey };
  }

  private resolveWebhookBaseUrl(override?: string): string {
    const candidate = (
      override ||
      process.env.EVOLUTION_WEBHOOK_BASE_URL ||
      process.env.APP_URL ||
      process.env.PUBLIC_URL ||
      ''
    )
      .trim()
      .replace(/\/+$/, '');

    if (!candidate) {
      throw new BadRequestException(
        'Falta configurar EVOLUTION_WEBHOOK_BASE_URL (o APP_URL) en el entorno del servidor para registrar el webhook.',
      );
    }

    return candidate;
  }

  private async requestEvolution(
    baseUrl: string,
    apiKey: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    body?: unknown,
  ): Promise<EvolutionHttpResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

    try {
      const headers: Record<string, string> = {
        apikey: apiKey,
      };
      if (body !== undefined) {
        headers['Content-Type'] = 'application/json';
      }

      const res = await fetch(`${baseUrl}${path}`, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      const rawText = await res.text();
      let data: any = null;
      if (rawText) {
        try {
          data = JSON.parse(rawText);
        } catch {
          data = rawText;
        }
      }

      if (!res.ok) {
        const msg = this.extractErrorMessage(data, res.status);
        return {
          ok: false,
          status: res.status,
          data,
          errorMessage: msg,
        };
      }

      return {
        ok: true,
        status: res.status,
        data,
      };
    } catch (err) {
      const isTimeout = (err as Error)?.name === 'AbortError';
      const errorMessage = isTimeout
        ? 'Tiempo de espera agotado al conectar con Evolution API'
        : `Error de red al conectar con Evolution API: ${(err as Error)?.message ?? String(err)}`;
      this.logger.warn(`[Evolution] ${method} ${path} failed: ${errorMessage}`);
      return {
        ok: false,
        status: 0,
        data: null,
        errorMessage,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  private extractErrorMessage(data: any, status: number): string {
    if (!data) return `Evolution API respondió con HTTP ${status}`;
    if (typeof data === 'string') return data.slice(0, 200);
    const messages = data?.response?.message ?? data?.message ?? data?.error;
    if (Array.isArray(messages)) {
      return messages.map(String).join(', ');
    }
    if (typeof messages === 'string') {
      return messages;
    }
    return `Evolution API respondió con HTTP ${status}`;
  }
}
