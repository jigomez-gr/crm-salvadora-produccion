import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 6 — CRM lead pipeline (Kanban board).
 *
 * Adds the sales-funnel dimension to contacts, distinct from `status`:
 * - `pipelineStage` (varchar, default 'new'): the funnel stage
 *   (new/contacted/qualified/booked/won/lost). Varchar, not a PG enum, so stages
 *   can become owner-configurable later without an ALTER TYPE. Indexed for the
 *   board's group-by-stage.
 * - `boardPosition` (double precision, default 0): manual ordering within a
 *   column (higher = top).
 *
 * Backfills existing contacts so the board is meaningful on day one: an ACTIVE
 * customer starts as WON, an INACTIVE one as LOST, a LEAD stays NEW (the column
 * default). Board position is seeded from creation time (newer nearer the top).
 *
 * Purely additive; safe under `migrationsRun` on boot. Not idempotent (only the
 * initial migration must be).
 */
export class Phase6Pipeline1782905000000 implements MigrationInterface {
  name = 'Phase6Pipeline1782905000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "contacts" ADD "pipelineStage" character varying NOT NULL DEFAULT 'new'`,
    );
    await queryRunner.query(
      `ALTER TABLE "contacts" ADD "boardPosition" double precision NOT NULL DEFAULT 0`,
    );

    // Seed the funnel from the existing lifecycle status.
    await queryRunner.query(
      `UPDATE "contacts" SET "pipelineStage" = 'won' WHERE "status" = 'active'`,
    );
    await queryRunner.query(
      `UPDATE "contacts" SET "pipelineStage" = 'lost' WHERE "status" = 'inactive'`,
    );
    // Deterministic initial ordering: newest contacts nearest the top of a column.
    await queryRunner.query(
      `UPDATE "contacts" SET "boardPosition" = EXTRACT(EPOCH FROM "createdAt") * 1000`,
    );

    await queryRunner.query(
      `CREATE INDEX "IDX_contacts_pipelineStage" ON "contacts" ("pipelineStage")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_contacts_pipelineStage"`,
    );
    await queryRunner.query(
      `ALTER TABLE "contacts" DROP COLUMN "boardPosition"`,
    );
    await queryRunner.query(
      `ALTER TABLE "contacts" DROP COLUMN "pipelineStage"`,
    );
  }
}
