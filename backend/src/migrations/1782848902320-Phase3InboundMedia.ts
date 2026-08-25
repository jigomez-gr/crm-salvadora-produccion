import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Phase 3 — inbound WhatsApp media capture.
 *
 * Adds nullable media columns to `messages`: `mediaType` (enum), `mediaUrl`
 * (YCloud reference / demo `data:` URL — server-side only, streamed via the
 * authenticated media proxy), `mediaId`, `mediaMimeType`, `mediaFilename`. All
 * additive and nullable — existing text messages keep `mediaType = NULL`, so no
 * backfill is required.
 */
export class Phase3InboundMedia1782848902320 implements MigrationInterface {
    name = 'Phase3InboundMedia1782848902320'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."messages_mediatype_enum" AS ENUM('image', 'audio', 'video', 'document', 'sticker')`);
        await queryRunner.query(`ALTER TABLE "messages" ADD "mediaType" "public"."messages_mediatype_enum"`);
        await queryRunner.query(`ALTER TABLE "messages" ADD "mediaUrl" text`);
        await queryRunner.query(`ALTER TABLE "messages" ADD "mediaId" character varying`);
        await queryRunner.query(`ALTER TABLE "messages" ADD "mediaMimeType" character varying`);
        await queryRunner.query(`ALTER TABLE "messages" ADD "mediaFilename" character varying`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "messages" DROP COLUMN "mediaFilename"`);
        await queryRunner.query(`ALTER TABLE "messages" DROP COLUMN "mediaMimeType"`);
        await queryRunner.query(`ALTER TABLE "messages" DROP COLUMN "mediaId"`);
        await queryRunner.query(`ALTER TABLE "messages" DROP COLUMN "mediaUrl"`);
        await queryRunner.query(`ALTER TABLE "messages" DROP COLUMN "mediaType"`);
        await queryRunner.query(`DROP TYPE "public"."messages_mediatype_enum"`);
    }

}
