export interface VapiCustomer {
  number?: string;
  name?: string;
  extension?: string;
}

export interface VapiCall {
  id: string;
  type?: 'inboundPhoneCall' | 'outboundPhoneCall' | 'webCall';
  status?: string;
  customer?: VapiCustomer;
  phoneNumber?: {
    id?: string;
    number?: string;
  };
  assistantId?: string;
  phoneNumberId?: string;
  startedAt?: string;
  endedAt?: string;
}

export interface VapiToolCallItem {
  id: string;
  type?: string;
  function: {
    name: string;
    arguments: Record<string, any> | string;
  };
}

export interface VapiArtifactMessage {
  role: string;
  message: string;
  time?: number;
  secondsFromStart?: number;
}

export interface VapiArtifact {
  messages?: VapiArtifactMessage[];
  transcript?: string;
  recordingUrl?: string;
  recording?: {
    url?: string;
    stereoUrl?: string;
  } | string;
}

export interface VapiAnalysis {
  summary?: string;
  structuredData?: Record<string, any>;
  successEvaluation?: string;
}

export interface VapiWebhookMessage {
  type:
    | 'tool-calls'
    | 'status-update'
    | 'end-of-call-report'
    | 'speech-update'
    | 'transcript'
    | 'hang'
    | 'assistant-request';
  call?: VapiCall;
  toolCalls?: VapiToolCallItem[];
  toolCallList?: VapiToolCallItem[];
  artifact?: VapiArtifact;
  analysis?: VapiAnalysis;
  cost?: number;
  startedAt?: string;
  endedAt?: string;
  endedReason?: string;
  status?: string;
  timestamp?: string;
  [key: string]: any;
}

export interface VapiToolResponseResult {
  toolCallId: string;
  result: string;
}

export interface VapiWebhookResponse {
  results?: VapiToolResponseResult[];
  message?: Record<string, any>;
}

export interface VapiAccountConfigDto {
  apiKey?: string;
  webhookToken?: string;
  assistantId?: string;
  phoneNumberId?: string;
  phoneNumber?: string;
  serverCredentialId?: string;
  customWebhookUrl?: string | null;
  handoffNumber?: string;
  handoffMessage?: string;
  voiceProvider?: string;
  voiceId?: string;
  voiceModel?: string;
  voiceLanguage?: string;
  transcriberProvider?: string;
  transcriberModel?: string;
  transcriberLanguage?: string;
  llmProvider?: string;
  llmModel?: string;
  systemPromptOverride?: string | null;
  tone?: string;
  maxDurationSeconds?: number;
  isActive?: boolean;
}
