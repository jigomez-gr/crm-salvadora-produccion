import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 4 — richer contacts. Adds CRM fields to `contacts`: `status` (enum
 * lead/active/inactive, default lead), `tags` (text[], default empty), `source`
 * (nullable) and `customFields` (nullable jsonb). Purely additive, no backfill —
 * existing contacts become leads with no tags.
 */
export class Phase4ContactFields1782858105029 implements MigrationInterface {
    name = 'Phase4ContactFields1782858105029'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."contacts_status_enum" AS ENUM('lead', 'active', 'inactive')`);
        await queryRunner.query(`ALTER TABLE "contacts" ADD "status" "public"."contacts_status_enum" NOT NULL DEFAULT 'lead'`);
        await queryRunner.query(`ALTER TABLE "contacts" ADD "tags" text array NOT NULL DEFAULT '{}'`);
        await queryRunner.query(`ALTER TABLE "contacts" ADD "source" character varying`);
        await queryRunner.query(`ALTER TABLE "contacts" ADD "customFields" jsonb`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "contacts" DROP COLUMN "customFields"`);
        await queryRunner.query(`ALTER TABLE "contacts" DROP COLUMN "source"`);
        await queryRunner.query(`ALTER TABLE "contacts" DROP COLUMN "tags"`);
        await queryRunner.query(`ALTER TABLE "contacts" DROP COLUMN "status"`);
        await queryRunner.query(`DROP TYPE "public"."contacts_status_enum"`);
    }

}
