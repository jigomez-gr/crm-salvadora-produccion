import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

export interface ServiceConfig {
  name: string;
  durationMinutes: number;
}

export interface WorkingHourSlot {
  day: number; // 0=Sunday, 1=Monday...6=Saturday
  open: string; // "09:00"
  close: string; // "18:00"
}

export type WhatsappProviderType = 'ycloud' | 'evolution' | 'meta';

@Entity('agent_configs')
export class AgentConfig {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  agentKey: string;

  @Column()
  businessName: string;

  @Column({ type: 'text' })
  businessDescription: string;

  // Free-text behaviour instructions the business owner writes from the UI. Layered
  // ON TOP of the internal hardened prompt as a subordinate section (the mandatory
  // guardrails in booking-agent.ts always take precedence). Distinct from
  // businessDescription (what the business IS) — this is HOW the agent should act.
  @Column({ type: 'text', nullable: true })
  customInstructions: string | null;

  // Communication channel this agent is connected to. Only 'whatsapp' in v1.
  @Column({ default: 'whatsapp' })
  channel: string;

  @Column({ type: 'jsonb', default: '[]' })
  services: ServiceConfig[];

  @Column({ type: 'jsonb', default: '[]' })
  workingHours: WorkingHourSlot[];

  @Column({ default: 'professional' })
  tone: string;

  // IANA timezone the business operates in; workingHours are local to it
  @Column({ default: 'Europe/Madrid' })
  timezone: string;

  // ─── AI model (OpenRouter) ───
  // OpenRouter model id, e.g. 'openai/gpt-4o-mini'. Resolved per request.
  @Column({ default: 'openai/gpt-4o-mini' })
  model: string;

  // OpenRouter API key for this agent. Falls back to OPENROUTER_API_KEY env when empty.
  @Column({ nullable: true })
  openrouterApiKey: string;

  // ─── WhatsApp provider & connection ───
  // Active WhatsApp provider ('ycloud' | 'evolution' | 'meta'). Defaults to 'ycloud'.
  @Column({ type: 'varchar', length: 20, default: 'ycloud' })
  whatsappProvider: WhatsappProviderType;

  // Business WhatsApp number this agent sends from (E.164). Falls back to
  // YCLOUD_WHATSAPP_NUMBER env when empty.
  @Column({ nullable: true })
  whatsappNumber: string;

  // YCloud API key used to send messages. Falls back to YCLOUD_API_KEY env when empty.
  @Column({ nullable: true })
  ycloudApiKey: string;

  // YCloud webhook signing secret, to verify inbound webhooks for this agent.
  // Falls back to YCLOUD_WEBHOOK_SECRET env when empty.
  @Column({ nullable: true })
  ycloudWebhookSecret: string;

  // ─── Evolution API connection (prepared & configurable per agent) ───
  @Column({ nullable: true })
  evolutionApiUrl: string;

  @Column({ nullable: true })
  evolutionInstanceName: string;

  @Column({ nullable: true })
  evolutionApiKey: string;

  @Column({ nullable: true })
  evolutionWebhookSecret: string;

  // ─── Meta WhatsApp Cloud API connection (prepared for future activation) ───
  @Column({ nullable: true })
  metaPhoneNumberId: string;

  @Column({ nullable: true })
  metaWabaId: string;

  @Column({ nullable: true })
  metaAccessToken: string;

  @Column({ nullable: true })
  metaAppSecret: string;

  @Column({ nullable: true })
  metaVerifyToken: string;

  @Column({ nullable: true, default: 'v21.0' })
  metaGraphVersion: string;

  @Column({ default: true })
  enabled: boolean;

  // ─── Appointment reminders (WhatsApp HSM template) ───
  // Off by default: reminders need an approved template, so a deployment opts in.
  @Column({ default: false })
  remindersEnabled: boolean;

  // Approved YCloud/WhatsApp template name to send as the reminder. The template
  // is expected to take 3 body params: {{1}} name, {{2}} service, {{3}} date+time.
  @Column({ nullable: true })
  reminderTemplateName: string;

  // BCP-47/WhatsApp language code of that template (e.g. 'es', 'es_ES').
  @Column({ default: 'es' })
  reminderTemplateLanguage: string;

  // ─── Presencia Digital, Redes y Personalización SEO ───
  @Column({ type: 'text', nullable: true })
  websiteUrl: string | null;

  @Column({ type: 'text', nullable: true })
  instagramUrl: string | null;

  @Column({ type: 'text', nullable: true })
  facebookUrl: string | null;

  @Column({ type: 'text', nullable: true })
  googleReviewUrl: string | null;

  @Column({ type: 'text', nullable: true })
  seoDescription: string | null;

  // ─── Límites Multimedia y Transcripción (WhatsApp / Inbound Media) ───
  @Column({ type: 'int', default: 100 })
  maxAudioSizeMb: number;

  @Column({ type: 'int', default: 100 })
  maxDocSizeMb: number;

  @Column({ type: 'int', default: 100 })
  maxVideoSizeMb: number;

  @Column({ type: 'varchar', length: 50, default: 'auto' })
  transcriptionProvider: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  transcriptionApiKey: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
