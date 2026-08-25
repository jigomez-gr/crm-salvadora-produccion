import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 4 — consent & GDPR on contacts. Adds `optedOut` (NOT NULL default false
 * — STOP/BAJA suppresses proactive messages), `optedOutAt`, and `anonymizedAt`
 * (GDPR erasure marker). Purely additive, no backfill.
 */
export class Phase4ContactConsent1782859129592 implements MigrationInterface {
    name = 'Phase4ContactConsent1782859129592'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "contacts" ADD "optedOut" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`ALTER TABLE "contacts" ADD "optedOutAt" TIMESTAMP WITH TIME ZONE`);
        await queryRunner.query(`ALTER TABLE "contacts" ADD "anonymizedAt" TIMESTAMP WITH TIME ZONE`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "contacts" DROP COLUMN "anonymizedAt"`);
        await queryRunner.query(`ALTER TABLE "contacts" DROP COLUMN "optedOutAt"`);
        await queryRunner.query(`ALTER TABLE "contacts" DROP COLUMN "optedOut"`);
    }

}
