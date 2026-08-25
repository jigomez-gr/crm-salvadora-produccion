import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 4 — audit trail. New `audit_logs` table (append-only): actor snapshot
 * (id + email), action key, target, Spanish summary, ip and optional jsonb
 * metadata, indexed on `action` and `createdAt`. Standalone table, no FKs (the
 * actor is snapshotted so an entry survives the user's deletion).
 */
export class Phase4AuditLog1782857160174 implements MigrationInterface {
    name = 'Phase4AuditLog1782857160174'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "audit_logs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "actorId" uuid, "actorEmail" character varying, "action" character varying NOT NULL, "targetType" character varying, "targetId" character varying, "summary" text NOT NULL, "ip" character varying, "metadata" jsonb, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_1bb179d048bbc581caa3b013439" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_cee5459245f652b75eb2759b4c" ON "audit_logs" ("action") `);
        await queryRunner.query(`CREATE INDEX "IDX_c69efb19bf127c97e6740ad530" ON "audit_logs" ("createdAt") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_c69efb19bf127c97e6740ad530"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_cee5459245f652b75eb2759b4c"`);
        await queryRunner.query(`DROP TABLE "audit_logs"`);
    }

}
