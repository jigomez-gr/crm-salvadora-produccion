import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 4 — app settings & white-label branding. New single-row `app_settings`
 * table (businessName / brandColor / logoUrl / onboardingCompleted). The service
 * get-or-creates the row on first access; no seed needed.
 */
export class Phase4AppSettings1782859674261 implements MigrationInterface {
    name = 'Phase4AppSettings1782859674261'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "app_settings" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "businessName" character varying NOT NULL DEFAULT 'CRM Salvadora', "brandColor" character varying NOT NULL DEFAULT '#4f46e5', "logoUrl" text, "onboardingCompleted" boolean NOT NULL DEFAULT false, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_4800b266ba790931744b3e53a74" PRIMARY KEY ("id"))`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "app_settings"`);
    }

}
