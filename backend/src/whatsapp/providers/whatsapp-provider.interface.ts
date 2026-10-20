import { AgentConfig, WhatsappProviderType } from '../../common/entities/agent-config.entity';
import { TemplateComponent } from '../ycloud-client.service';

export interface WhatsappSendResult {
  ok: boolean;
  providerMessageId?: string;
  status?: string;
  error?: string;
  skippedByPause?: boolean;
}

export interface WhatsappSendTextParams {
  config?: AgentConfig | null;
  from?: string;
  to: string;
  body: string;
  apiKeyOverride?: string;
}

export interface WhatsappSendTemplateParams {
  config?: AgentConfig | null;
  from?: string;
  to: string;
  templateName: string;
  languageCode: string;
  components?: TemplateComponent[];
  fallbackText?: string;
  apiKeyOverride?: string;
}

export interface WhatsappMediaInput {
  buffer: Buffer;
  filename: string;
  mimeType: string;
  mediaCategory: 'document' | 'audio' | 'video' | 'image';
}

export interface WhatsappSendMediaParams {
  config?: AgentConfig | null;
  from?: string;
  to: string;
  caption?: string;
  media: WhatsappMediaInput;
}

export interface WhatsappInboundMediaResult {
  buffer: Buffer;
  contentType: string;
}

export interface WhatsappFetchInboundMediaParams {
  config?: AgentConfig | null;
  mediaUrl: string;
  signal?: AbortSignal;
}

export interface WhatsappConnectionStatus {
  provider: WhatsappProviderType;
  state: 'open' | 'connecting' | 'close' | 'unconfigured' | 'unknown';
  instanceName?: string | null;
  qrBase64?: string | null;
  pairingCode?: string | null;
  detail?: string;
}

export interface WhatsappProvider {
  readonly type: WhatsappProviderType;

  sendTextMessage(params: WhatsappSendTextParams): Promise<WhatsappSendResult>;

  sendTemplateMessage(params: WhatsappSendTemplateParams): Promise<WhatsappSendResult>;

  sendMediaMessage?(params: WhatsappSendMediaParams): Promise<WhatsappSendResult>;

  fetchInboundMedia?(
    params: WhatsappFetchInboundMediaParams,
  ): Promise<WhatsappInboundMediaResult>;

  getConnectionStatus?(config: AgentConfig): Promise<WhatsappConnectionStatus>;
}
