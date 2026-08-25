import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 4 — account security. Adds two columns to `users`:
 *  - `mustChangePassword` (NOT NULL DEFAULT false): forces a password change
 *    before the user can do anything else (admin reset / bootstrap on the
 *    default password). Existing rows default to false → no forced change.
 *  - `passwordChangedAt` (nullable timestamptz): when the password last changed.
 *    JwtAuthGuard rejects any token issued before it, so a change/reset logs out
 *    other sessions. Null for existing rows → their current sessions stay valid.
 *
 * Purely additive, no backfill — safe on a populated `users` table.
 */
export class Phase4AccountSecurity1782855404999 implements MigrationInterface {
    name = 'Phase4AccountSecurity1782855404999'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" ADD "mustChangePassword" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`ALTER TABLE "users" ADD "passwordChangedAt" TIMESTAMP WITH TIME ZONE`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "passwordChangedAt"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "mustChangePassword"`);
    }

}
