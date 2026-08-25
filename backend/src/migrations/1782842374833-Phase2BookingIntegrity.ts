import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 2 — booking integrity.
 *
 * Adds audit/cancellation columns + indexes to `appointments` and an `updatedAt`
 * to both tables. Column/index statements use IF [NOT] EXISTS so the migration
 * is safe to re-run and safe on a schema a previous `synchronize` already
 * partially created.
 *
 * Note: the no-overlap (double-booking) guarantee is NOT a DB constraint — it's
 * enforced in AppointmentsService via a transactional advisory lock
 * (pg_advisory_xact_lock) around the overlap check + insert. That serializes
 * concurrent bookings at the database level (so it holds across multiple app
 * instances too) without a schema object TypeORM can't model — which keeps
 * `migration:generate` clean and avoids failing on pre-existing overlaps.
 */
export class Phase2BookingIntegrity1782842374833 implements MigrationInterface {
  name = 'Phase2BookingIntegrity1782842374833';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "appointments" ADD COLUMN IF NOT EXISTS "agentKey" character varying`);
    await queryRunner.query(`ALTER TABLE "appointments" ADD COLUMN IF NOT EXISTS "notes" text`);
    await queryRunner.query(`ALTER TABLE "appointments" ADD COLUMN IF NOT EXISTS "price" numeric(10,2)`);
    await queryRunner.query(`ALTER TABLE "appointments" ADD COLUMN IF NOT EXISTS "cancelledAt" TIMESTAMP WITH TIME ZONE`);
    await queryRunner.query(`ALTER TABLE "appointments" ADD COLUMN IF NOT EXISTS "cancelledBy" character varying`);
    await queryRunner.query(`ALTER TABLE "appointments" ADD COLUMN IF NOT EXISTS "cancellationReason" text`);
    await queryRunner.query(`ALTER TABLE "appointments" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP NOT NULL DEFAULT now()`);
    await queryRunner.query(`ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP NOT NULL DEFAULT now()`);

    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_4ab9e0a344942dd40060cafddb" ON "appointments" ("contactId") `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_9942e87d3bdb73cd4740345b0b" ON "appointments" ("startsAt") `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_5b6ad6160b516d93c45fedb0c9" ON "appointments" ("status", "startsAt") `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_5b6ad6160b516d93c45fedb0c9"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_9942e87d3bdb73cd4740345b0b"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_4ab9e0a344942dd40060cafddb"`);
    await queryRunner.query(`ALTER TABLE "contacts" DROP COLUMN IF EXISTS "updatedAt"`);
    await queryRunner.query(`ALTER TABLE "appointments" DROP COLUMN IF EXISTS "updatedAt"`);
    await queryRunner.query(`ALTER TABLE "appointments" DROP COLUMN IF EXISTS "cancellationReason"`);
    await queryRunner.query(`ALTER TABLE "appointments" DROP COLUMN IF EXISTS "cancelledBy"`);
    await queryRunner.query(`ALTER TABLE "appointments" DROP COLUMN IF EXISTS "cancelledAt"`);
    await queryRunner.query(`ALTER TABLE "appointments" DROP COLUMN IF EXISTS "price"`);
    await queryRunner.query(`ALTER TABLE "appointments" DROP COLUMN IF EXISTS "notes"`);
    await queryRunner.query(`ALTER TABLE "appointments" DROP COLUMN IF EXISTS "agentKey"`);
  }
}
