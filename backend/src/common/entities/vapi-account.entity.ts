import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('vapi_accounts')
export class VapiAccount {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true })
  apiKey: string | null;

  @Column({ nullable: true })
  webhookToken: string | null;

  @Column({ nullable: true })
  assistantId: string | null;

  @Column({ nullable: true })
  phoneNumberId: string | null;

  @Column({ nullable: true })
  phoneNumber: string | null;

  @Column({ nullable: true })
  serverCredentialId: string | null;

  @Column({ nullable: true })
  customWebhookUrl: string | null;

  @Column({ nullable: true })
  handoffNumber: string | null;

  @Column({ nullable: true })
  handoffMessage: string | null;

  // Voice Settings
  @Column({ default: '11labs' })
  voiceProvider: string;

  @Column({ default: 'UOIqAnmS11Reiei1Ytkc' })
  voiceId: string;

  @Column({ default: 'eleven_turbo_v2_5' })
  voiceModel: string;

  @Column({ default: 'es' })
  voiceLanguage: string;

  // Transcriber Settings
  @Column({ default: 'deepgram' })
  transcriberProvider: string;

  @Column({ default: 'nova-3-general' })
  transcriberModel: string;

  @Column({ default: 'es' })
  transcriberLanguage: string;

  // LLM Settings
  @Column({ default: 'openai' })
  llmProvider: string;

  @Column({ default: 'gpt-5.6-luna' })
  llmModel: string;

  // Free-text system prompt override. When null, prompt is composed dynamically.
  @Column({ type: 'text', nullable: true })
  systemPromptOverride: string | null;

  // Tone of the agent
  @Column({ default: 'professional' })
  tone: string;

  // Max call duration in seconds
  @Column({ type: 'integer', default: 900 })
  maxDurationSeconds: number;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
