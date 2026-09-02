import { MigrationInterface, QueryRunner } from 'typeorm';

export class Phase8VapiAndCalls1782907000000 implements MigrationInterface {
  name = 'Phase8VapiAndCalls1782907000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "vapi_accounts" (` +
        `"id" uuid NOT NULL DEFAULT uuid_generate_v4(), ` +
        `"apiKey" character varying, ` +
        `"webhookToken" character varying, ` +
        `"assistantId" character varying, ` +
        `"phoneNumberId" character varying, ` +
        `"phoneNumber" character varying, ` +
        `"serverCredentialId" character varying, ` +
        `"customWebhookUrl" character varying, ` +
        `"handoffNumber" character varying, ` +
        `"handoffMessage" character varying, ` +
        `"smsWebhookUrl" text, ` +
        `"voiceProvider" character varying NOT NULL DEFAULT '11labs', ` +
        `"voiceId" character varying NOT NULL DEFAULT 'UOIqAnmS11Reiei1Ytkc', ` +
        `"voiceModel" character varying NOT NULL DEFAULT 'eleven_turbo_v2_5', ` +
        `"voiceLanguage" character varying NOT NULL DEFAULT 'es', ` +
        `"transcriberProvider" character varying NOT NULL DEFAULT 'deepgram', ` +
        `"transcriberModel" character varying NOT NULL DEFAULT 'nova-3-general', ` +
        `"transcriberLanguage" character varying NOT NULL DEFAULT 'es', ` +
        `"llmProvider" character varying NOT NULL DEFAULT 'openai', ` +
        `"llmModel" character varying NOT NULL DEFAULT 'gpt-5.6-luna', ` +
        `"systemPromptOverride" text, ` +
        `"tone" character varying NOT NULL DEFAULT 'professional', ` +
        `"maxDurationSeconds" integer NOT NULL DEFAULT 900, ` +
        `"isActive" boolean NOT NULL DEFAULT true, ` +
        `"createdAt" TIMESTAMP NOT NULL DEFAULT now(), ` +
        `"updatedAt" TIMESTAMP NOT NULL DEFAULT now(), ` +
        `CONSTRAINT "PK_vapi_accounts" PRIMARY KEY ("id"))`,
    );

    await queryRunner.query(
      `ALTER TABLE "vapi_accounts" ADD COLUMN IF NOT EXISTS "smsWebhookUrl" text`,
    );

    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "calls" (` +
        `"id" uuid NOT NULL DEFAULT uuid_generate_v4(), ` +
        `"vapiCallId" character varying(255) NOT NULL, ` +
        `"direction" character varying(32) NOT NULL DEFAULT 'inbound', ` +
        `"fromNumber" character varying(64), ` +
        `"toNumber" character varying(64), ` +
        `"status" character varying(32) NOT NULL DEFAULT 'in-progress', ` +
        `"startedAt" TIMESTAMP WITH TIME ZONE, ` +
        `"endedAt" TIMESTAMP WITH TIME ZONE, ` +
        `"durationSeconds" integer, ` +
        `"costCents" integer, ` +
        `"recordingUrl" character varying(1024), ` +
        `"stereoRecordingUrl" character varying(1024), ` +
        `"transcript" text, ` +
        `"summary" text, ` +
        `"needsReview" boolean NOT NULL DEFAULT false, ` +
        `"reviewReason" text, ` +
        `"metadata" jsonb, ` +
        `"contactId" uuid, ` +
        `"createdAt" TIMESTAMP NOT NULL DEFAULT now(), ` +
        `"updatedAt" TIMESTAMP NOT NULL DEFAULT now(), ` +
        `CONSTRAINT "PK_calls" PRIMARY KEY ("id"), ` +
        `CONSTRAINT "UQ_calls_vapiCallId" UNIQUE ("vapiCallId"))`,
    );

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_calls_fromNumber" ON "calls" ("fromNumber")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_calls_contactId" ON "calls" ("contactId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "calls"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "vapi_accounts"`);
  }
}
