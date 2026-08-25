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

  // ─── WhatsApp connection (YCloud) ───
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

  @CreateDateColumn()
  createdAt: Date;
}
