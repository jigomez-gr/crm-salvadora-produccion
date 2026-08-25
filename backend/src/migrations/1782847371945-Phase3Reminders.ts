import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Phase 3 — scheduled WhatsApp appointment reminders.
 *
 * Adds `appointment_reminders` (the idempotency record: unique
 * (appointmentId, offsetLabel) so the cron never double-sends) and the per-agent
 * reminder config on `agent_configs` (off by default — reminders need an approved
 * HSM template). All new; no backfill required.
 */
export class Phase3Reminders1782847371945 implements MigrationInterface {
    name = 'Phase3Reminders1782847371945'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."appointment_reminders_status_enum" AS ENUM('pending', 'sent', 'failed')`);
        await queryRunner.query(`CREATE TABLE "appointment_reminders" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "appointmentId" uuid NOT NULL, "offsetLabel" character varying NOT NULL, "status" "public"."appointment_reminders_status_enum" NOT NULL DEFAULT 'pending', "providerMessageId" character varying, "sentAt" TIMESTAMP WITH TIME ZONE, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_a2a304e63cdbacfacf60091a70c" UNIQUE ("appointmentId", "offsetLabel"), CONSTRAINT "PK_a6128daa14ae7146de0a1ec4119" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_9ef20d38621f9cb5ba2a19e710" ON "appointment_reminders" ("appointmentId") `);
        await queryRunner.query(`ALTER TABLE "agent_configs" ADD "remindersEnabled" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`ALTER TABLE "agent_configs" ADD "reminderTemplateName" character varying`);
        await queryRunner.query(`ALTER TABLE "agent_configs" ADD "reminderTemplateLanguage" character varying NOT NULL DEFAULT 'es'`);
        await queryRunner.query(`ALTER TABLE "appointment_reminders" ADD CONSTRAINT "FK_9ef20d38621f9cb5ba2a19e710d" FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "appointment_reminders" DROP CONSTRAINT "FK_9ef20d38621f9cb5ba2a19e710d"`);
        await queryRunner.query(`ALTER TABLE "agent_configs" DROP COLUMN "reminderTemplateLanguage"`);
        await queryRunner.query(`ALTER TABLE "agent_configs" DROP COLUMN "reminderTemplateName"`);
        await queryRunner.query(`ALTER TABLE "agent_configs" DROP COLUMN "remindersEnabled"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_9ef20d38621f9cb5ba2a19e710"`);
        await queryRunner.query(`DROP TABLE "appointment_reminders"`);
        await queryRunner.query(`DROP TYPE "public"."appointment_reminders_status_enum"`);
    }

}
