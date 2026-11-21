import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTelegramIntegration1782925000000 implements MigrationInterface {
  name = 'AddTelegramIntegration1782925000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Contacts: conectadotelegram and Telegram identity columns
    await queryRunner.query(`
      ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "conectadotelegram" character varying(1) NOT NULL DEFAULT 'N';
      ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "telegramUserId" character varying;
      ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "telegramChatId" character varying;
      ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "telegramUsername" character varying;
      ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "telegramConnectedAt" TIMESTAMP WITH TIME ZONE;
      ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "telegramLinkStatus" character varying(32) NOT NULL DEFAULT 'unlinked';
      ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "telegramBlocked" boolean NOT NULL DEFAULT false;
      CREATE INDEX IF NOT EXISTS "IDX_contacts_telegramUserId" ON "contacts" ("telegramUserId");
      CREATE INDEX IF NOT EXISTS "IDX_contacts_telegramChatId" ON "contacts" ("telegramChatId");
    `);

    // 2. Services: notifyByTelegram and reminderTelegram
    await queryRunner.query(`
      ALTER TABLE "services" ADD COLUMN IF NOT EXISTS "notifyByTelegram" boolean NOT NULL DEFAULT false;
      ALTER TABLE "services" ADD COLUMN IF NOT EXISTS "reminderTelegram" boolean NOT NULL DEFAULT false;
    `);

    // 3. AgentConfig: Telegram Bot API configuration
    await queryRunner.query(`
      ALTER TABLE "agent_configs" ADD COLUMN IF NOT EXISTS "telegramEnabled" boolean NOT NULL DEFAULT true;
      ALTER TABLE "agent_configs" ADD COLUMN IF NOT EXISTS "telegramBotToken" character varying(500);
      ALTER TABLE "agent_configs" ADD COLUMN IF NOT EXISTS "telegramWebhookSecret" character varying(256);
      ALTER TABLE "agent_configs" ADD COLUMN IF NOT EXISTS "telegramBotUsername" character varying(128);
      ALTER TABLE "agent_configs" ADD COLUMN IF NOT EXISTS "telegramBotName" character varying(256);
      ALTER TABLE "agent_configs" ADD COLUMN IF NOT EXISTS "telegramBotId" character varying(64);
      ALTER TABLE "agent_configs" ADD COLUMN IF NOT EXISTS "telegramLastError" text;
      ALTER TABLE "agent_configs" ADD COLUMN IF NOT EXISTS "telegramConnectedAt" TIMESTAMP WITH TIME ZONE;
    `);

    // 4. Messages: add 'telegram' to messages_channel_enum if present
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'messages_channel_enum') THEN
          IF NOT EXISTS (
            SELECT 1 FROM pg_enum e
            JOIN pg_type t ON e.enumtypid = t.oid
            WHERE t.typname = 'messages_channel_enum' AND e.enumlabel = 'telegram'
          ) THEN
            ALTER TYPE "public"."messages_channel_enum" ADD VALUE 'telegram';
          END IF;
        END IF;
      EXCEPTION
        WHEN others THEN NULL;
      END $$;
    `);

    // 5. Telegram link tokens table for secure landing -> bot deep-linking
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "telegram_link_tokens" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "token" character varying(128) NOT NULL,
        "contactId" uuid REFERENCES "contacts"("id") ON DELETE CASCADE,
        "agentKey" character varying NOT NULL DEFAULT 'booking',
        "sessionId" character varying,
        "serviceName" character varying,
        "note" text,
        "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "usedAt" TIMESTAMP WITH TIME ZONE,
        "usedByTelegramUserId" character varying,
        "usedByTelegramChatId" character varying,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_telegram_link_tokens_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_telegram_link_tokens_token" UNIQUE ("token")
      );
      CREATE INDEX IF NOT EXISTS "IDX_telegram_link_tokens_contactId" ON "telegram_link_tokens" ("contactId");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "telegram_link_tokens";`);
    await queryRunner.query(`
      ALTER TABLE "agent_configs" DROP COLUMN IF EXISTS "telegramConnectedAt";
      ALTER TABLE "agent_configs" DROP COLUMN IF EXISTS "telegramLastError";
      ALTER TABLE "agent_configs" DROP COLUMN IF EXISTS "telegramBotId";
      ALTER TABLE "agent_configs" DROP COLUMN IF EXISTS "telegramBotName";
      ALTER TABLE "agent_configs" DROP COLUMN IF EXISTS "telegramBotUsername";
      ALTER TABLE "agent_configs" DROP COLUMN IF EXISTS "telegramWebhookSecret";
      ALTER TABLE "agent_configs" DROP COLUMN IF EXISTS "telegramBotToken";
      ALTER TABLE "agent_configs" DROP COLUMN IF EXISTS "telegramEnabled";
    `);
    await queryRunner.query(`
      ALTER TABLE "services" DROP COLUMN IF EXISTS "reminderTelegram";
      ALTER TABLE "services" DROP COLUMN IF EXISTS "notifyByTelegram";
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_contacts_telegramChatId";
      DROP INDEX IF EXISTS "IDX_contacts_telegramUserId";
      ALTER TABLE "contacts" DROP COLUMN IF EXISTS "telegramBlocked";
      ALTER TABLE "contacts" DROP COLUMN IF EXISTS "telegramLinkStatus";
      ALTER TABLE "contacts" DROP COLUMN IF EXISTS "telegramConnectedAt";
      ALTER TABLE "contacts" DROP COLUMN IF EXISTS "telegramUsername";
      ALTER TABLE "contacts" DROP COLUMN IF EXISTS "telegramChatId";
      ALTER TABLE "contacts" DROP COLUMN IF EXISTS "telegramUserId";
      ALTER TABLE "contacts" DROP COLUMN IF EXISTS "conectadotelegram";
    `);
  }
}
