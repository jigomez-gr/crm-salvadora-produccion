import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { YCloudClient } from '../ycloud-client.service';
import {
  WhatsappFetchInboundMediaParams,
  WhatsappInboundMediaResult,
  WhatsappProvider,
  WhatsappSendResult,
  WhatsappSendTemplateParams,
  WhatsappSendTextParams,
} from './whatsapp-provider.interface';

@Injectable()
export class YCloudProvider implements WhatsappProvider {
  readonly type = 'ycloud' as const;
  private readonly logger = new Logger(YCloudProvider.name);

  constructor(private readonly ycloudClient: YCloudClient) {}

  async sendTextMessage(params: WhatsappSendTextParams): Promise<WhatsappSendResult> {
    const from =
      params.from ||
      params.config?.whatsappNumber ||
      process.env.YCLOUD_WHATSAPP_NUMBER ||
      process.env.YCLOUD_FROM_PHONE ||
      '';
    const apiKey = params.apiKeyOverride ?? params.config?.ycloudApiKey;
    return this.ycloudClient.sendTextMessage(from, params.to, params.body, apiKey);
  }

  async sendTemplateMessage(
    params: WhatsappSendTemplateParams,
  ): Promise<WhatsappSendResult> {
    const from =
      params.from ||
      params.config?.whatsappNumber ||
      process.env.YCLOUD_WHATSAPP_NUMBER ||
      process.env.YCLOUD_FROM_PHONE ||
      '';
    const apiKey = params.apiKeyOverride ?? params.config?.ycloudApiKey;
    return this.ycloudClient.sendTemplateMessage(
      from,
      params.to,
      params.templateName,
      params.languageCode,
      params.components ?? [],
      apiKey,
    );
  }

  async fetchInboundMedia(
    params: WhatsappFetchInboundMediaParams,
  ): Promise<WhatsappInboundMediaResult> {
    const apiKey = params.config?.ycloudApiKey;
    const upstream = await fetch(params.mediaUrl, {
      signal: params.signal,
      headers: apiKey ? { 'X-API-Key': apiKey } : undefined,
    });
    if (!upstream.ok) {
      this.logger.warn(`YCloud media fetch failed: ${upstream.status}`);
      throw new HttpException(
        'No se pudo obtener el archivo del proveedor',
        HttpStatus.BAD_GATEWAY,
      );
    }
    const buffer = Buffer.from(await upstream.arrayBuffer());
    const contentType =
      upstream.headers.get('content-type') || 'application/octet-stream';
    return { buffer, contentType };
  }
}
