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
  WhatsappFetchInboundMediaParams,
  WhatsappInboundMediaResult,
  WhatsappProvider,
  WhatsappSendMediaParams,
  WhatsappSendResult,
  WhatsappSendTemplateParams,
  WhatsappSendTextParams,
} from './whatsapp-provider.interface';

const DEFAULT_GRAPH_VERSION = 'v21.0';
const DEFAULT_TIMEOUT_MS = 20_000;

@Injectable()
export class MetaProvider implements WhatsappProvider {
  readonly type = 'meta' as const;
  private readonly logger = new Logger(MetaProvider.name);

  /**
   * Normalizes a phone number to WhatsApp digits (E.164 without '+').
   */
  normalizeRecipientNumber(phone: string): string {
    if (!phone) return '';
    const e164 = normalizePhoneLoose(phone);
    return e164.replace(/\D/g, '');
  }

  private resolveCredentials(config?: AgentConfig | null, apiKeyOverride?: string) {
    const phoneNumberId = config?.metaPhoneNumberId?.trim();
    const accessToken = (apiKeyOverride ?? config?.metaAccessToken)?.trim();
    const graphVersion = config?.metaGraphVersion?.trim() || DEFAULT_GRAPH_VERSION;
    return { phoneNumberId, accessToken, graphVersion };
  }

  async sendTextMessage(params: WhatsappSendTextParams): Promise<WhatsappSendResult> {
    const { phoneNumberId, accessToken, graphVersion } = this.resolveCredentials(
      params.config,
      params.apiKeyOverride,
    );

    if (!phoneNumberId || !accessToken) {
      const error =
        'Meta WhatsApp Cloud API no está completamente configurado (falta metaPhoneNumberId o metaAccessToken).';
      this.logger.warn(`[MetaProvider] Cannot send text: ${error}`);
      return { ok: false, error };
    }

    const toDigits = this.normalizeRecipientNumber(params.to);
    if (!toDigits) {
      return { ok: false, error: 'Número de teléfono inválido para Meta Cloud API.' };
    }

    const url = `https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`;
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: toDigits,
      type: 'text',
      text: {
        preview_url: false,
        body: params.body,
      },
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        const errorMsg =
          data?.error?.message || `Error HTTP ${response.status} de Meta Cloud API`;
        this.logger.error(`[MetaProvider] sendTextMessage failed: ${errorMsg}`);
        return { ok: false, error: errorMsg, status: String(response.status) };
      }

      const providerMessageId = data?.messages?.[0]?.id;
      return { ok: true, providerMessageId, status: 'sent' };
    } catch (err: any) {
      this.logger.error(`[MetaProvider] sendTextMessage exception: ${err.message}`);
      return { ok: false, error: err.message };
    }
  }

  async sendTemplateMessage(
    params: WhatsappSendTemplateParams,
  ): Promise<WhatsappSendResult> {
    const { phoneNumberId, accessToken, graphVersion } = this.resolveCredentials(
      params.config,
      params.apiKeyOverride,
    );

    if (!phoneNumberId || !accessToken) {
      const error =
        'Meta WhatsApp Cloud API no está configurado (falta metaPhoneNumberId o metaAccessToken).';
      this.logger.warn(`[MetaProvider] Cannot send template: ${error}`);
      return { ok: false, error };
    }

    const toDigits = this.normalizeRecipientNumber(params.to);
    if (!toDigits) {
      return { ok: false, error: 'Número de teléfono inválido.' };
    }

    const url = `https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`;
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: toDigits,
      type: 'template',
      template: {
        name: params.templateName,
        language: { code: params.languageCode || 'es' },
        components: params.components ?? [],
      },
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        const errorMsg =
          data?.error?.message || `Error HTTP ${response.status} de Meta Cloud API`;
        this.logger.error(`[MetaProvider] sendTemplateMessage failed: ${errorMsg}`);
        return { ok: false, error: errorMsg, status: String(response.status) };
      }

      const providerMessageId = data?.messages?.[0]?.id;
      return { ok: true, providerMessageId, status: 'sent' };
    } catch (err: any) {
      this.logger.error(`[MetaProvider] sendTemplateMessage exception: ${err.message}`);
      return { ok: false, error: err.message };
    }
  }

  async fetchInboundMedia(
    params: WhatsappFetchInboundMediaParams,
  ): Promise<WhatsappInboundMediaResult> {
    const { accessToken, graphVersion } = this.resolveCredentials(params.config);

    if (!accessToken) {
      throw new HttpException(
        'Meta Access Token no configurado para descargar multimedia',
        HttpStatus.BAD_GATEWAY,
      );
    }

    let downloadUrl = params.mediaUrl;

    // If mediaUrl is just a Meta Media ID (digits only), query Graph API to obtain download URL
    if (/^\d+$/.test(params.mediaUrl.trim())) {
      const mediaId = params.mediaUrl.trim();
      const metaLookupUrl = `https://graph.facebook.com/${graphVersion}/${mediaId}`;
      const lookupRes = await fetch(metaLookupUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: params.signal ?? AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
      });

      if (!lookupRes.ok) {
        this.logger.warn(`[MetaProvider] Media lookup failed (${lookupRes.status}) for ID ${mediaId}`);
        throw new HttpException('No se pudo resolver el ID de multimedia en Meta', HttpStatus.BAD_GATEWAY);
      }

      const lookupData = await lookupRes.json();
      if (!lookupData?.url) {
        throw new HttpException('Meta no devolvió URL de descarga para el archivo', HttpStatus.BAD_GATEWAY);
      }
      downloadUrl = lookupData.url;
    }

    const mediaRes = await fetch(downloadUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'User-Agent': 'curl/7.64.1',
      },
      signal: params.signal ?? AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    });

    if (!mediaRes.ok) {
      this.logger.warn(`[MetaProvider] Media download failed: ${mediaRes.status}`);
      throw new HttpException('Fallo al descargar multimedia de Meta WhatsApp', HttpStatus.BAD_GATEWAY);
    }

    const buffer = Buffer.from(await mediaRes.arrayBuffer());
    const contentType = mediaRes.headers.get('content-type') || 'application/octet-stream';
    return { buffer, contentType };
  }

  async getConnectionStatus(config: AgentConfig): Promise<WhatsappConnectionStatus> {
    const isConfigured = Boolean(config.metaPhoneNumberId && config.metaAccessToken);
    return {
      provider: 'meta',
      state: isConfigured ? 'open' : 'unconfigured',
      instanceName: config.metaPhoneNumberId || null,
      detail: isConfigured
        ? 'Meta WhatsApp Cloud API configurado y listo.'
        : 'Falta configurar Phone Number ID o Access Token.',
    };
  }
}
