import { MigrationInterface, QueryRunner } from "typeorm";

export class Phase10WhatsappGatewayAndPause1782912000000 implements MigrationInterface {
    name = 'Phase10WhatsappGatewayAndPause1782912000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        // 1. Global WhatsApp automation pause flag in app_settings
        await queryRunner.query(
            `ALTER TABLE "app_settings" ADD COLUMN IF NOT EXISTS "whatsappAutomationPaused" boolean NOT NULL DEFAULT false`
        );

        // 2. Multi-provider selector in agent_configs
        await queryRunner.query(
            `ALTER TABLE "agent_configs" ADD COLUMN IF NOT EXISTS "whatsappProvider" character varying(20) NOT NULL DEFAULT 'ycloud'`
        );

        // 3. Evolution API configuration fields in agent_configs (no ephemeral connection status columns)
        await queryRunner.query(
            `ALTER TABLE "agent_configs" ADD COLUMN IF NOT EXISTS "evolutionApiUrl" character varying`
        );
        await queryRunner.query(
            `ALTER TABLE "agent_configs" ADD COLUMN IF NOT EXISTS "evolutionInstanceName" character varying`
        );
        await queryRunner.query(
            `ALTER TABLE "agent_configs" ADD COLUMN IF NOT EXISTS "evolutionApiKey" character varying`
        );
        await queryRunner.query(
            `ALTER TABLE "agent_configs" ADD COLUMN IF NOT EXISTS "evolutionWebhookSecret" character varying`
        );

        // 4. Prepared Meta WhatsApp Cloud API fields in agent_configs
        await queryRunner.query(
            `ALTER TABLE "agent_configs" ADD COLUMN IF NOT EXISTS "metaPhoneNumberId" character varying`
        );
        await queryRunner.query(
            `ALTER TABLE "agent_configs" ADD COLUMN IF NOT EXISTS "metaWabaId" character varying`
        );
        await queryRunner.query(
            `ALTER TABLE "agent_configs" ADD COLUMN IF NOT EXISTS "metaAccessToken" character varying`
        );
        await queryRunner.query(
            `ALTER TABLE "agent_configs" ADD COLUMN IF NOT EXISTS "metaAppSecret" character varying`
        );
        await queryRunner.query(
            `ALTER TABLE "agent_configs" ADD COLUMN IF NOT EXISTS "metaVerifyToken" character varying`
        );
        await queryRunner.query(
            `ALTER TABLE "agent_configs" ADD COLUMN IF NOT EXISTS "metaGraphVersion" character varying DEFAULT 'v21.0'`
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "agent_configs" DROP COLUMN IF EXISTS "metaGraphVersion"`);
        await queryRunner.query(`ALTER TABLE "agent_configs" DROP COLUMN IF EXISTS "metaVerifyToken"`);
        await queryRunner.query(`ALTER TABLE "agent_configs" DROP COLUMN IF EXISTS "metaAppSecret"`);
        await queryRunner.query(`ALTER TABLE "agent_configs" DROP COLUMN IF EXISTS "metaAccessToken"`);
        await queryRunner.query(`ALTER TABLE "agent_configs" DROP COLUMN IF EXISTS "metaWabaId"`);
        await queryRunner.query(`ALTER TABLE "agent_configs" DROP COLUMN IF EXISTS "metaPhoneNumberId"`);
        await queryRunner.query(`ALTER TABLE "agent_configs" DROP COLUMN IF EXISTS "evolutionWebhookSecret"`);
        await queryRunner.query(`ALTER TABLE "agent_configs" DROP COLUMN IF EXISTS "evolutionApiKey"`);
        await queryRunner.query(`ALTER TABLE "agent_configs" DROP COLUMN IF EXISTS "evolutionInstanceName"`);
        await queryRunner.query(`ALTER TABLE "agent_configs" DROP COLUMN IF EXISTS "evolutionApiUrl"`);
        await queryRunner.query(`ALTER TABLE "agent_configs" DROP COLUMN IF EXISTS "whatsappProvider"`);
        await queryRunner.query(`ALTER TABLE "app_settings" DROP COLUMN IF EXISTS "whatsappAutomationPaused"`);
    }
}
