import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Phase 3 — conversations as a first-class entity + message delivery status.
 *
 * Adds the `conversations` table (the inbox unit: handoff, unread, last-message
 * preview, lastInboundAt for the WhatsApp 24h window) and `messages.status` /
 * `messages.providerMessageId` (delivery lifecycle + correlation id for YCloud
 * status webhooks).
 *
 * The DDL is generated; the two backfills at the end of up() are hand-added so
 * an existing deployment keeps a coherent history:
 *   1. historical messages get a sensible status (inbound→received, else sent),
 *      instead of the column default 'queued'.
 *   2. `conversations` rows are derived from existing `messages` (same logic as
 *      MessagesService.rebuildAllConversations) so prior threads appear in the
 *      inbox immediately after deploy.
 */
export class Phase3Conversations1782846196585 implements MigrationInterface {
    name = 'Phase3Conversations1782846196585'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "conversations" ("threadId" character varying NOT NULL, "agentKey" character varying NOT NULL, "contactId" uuid, "channel" character varying NOT NULL, "handoff" boolean NOT NULL DEFAULT false, "unreadCount" integer NOT NULL DEFAULT '0', "lastMessageAt" TIMESTAMP WITH TIME ZONE, "lastInboundAt" TIMESTAMP WITH TIME ZONE, "lastMessageBody" text, "lastMessageDirection" character varying, "messageCount" integer NOT NULL DEFAULT '0', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_d88b0481628ea95674b333780f7" PRIMARY KEY ("threadId"))`);
        await queryRunner.query(`CREATE INDEX "IDX_b853c3320df7cf06b7bfa413c8" ON "conversations" ("lastMessageAt") `);
        await queryRunner.query(`CREATE TYPE "public"."messages_status_enum" AS ENUM('received', 'queued', 'sent', 'delivered', 'read', 'failed')`);
        await queryRunner.query(`ALTER TABLE "messages" ADD "status" "public"."messages_status_enum" NOT NULL DEFAULT 'queued'`);
        await queryRunner.query(`ALTER TABLE "messages" ADD "providerMessageId" character varying`);
        await queryRunner.query(`CREATE INDEX "IDX_61f6b003677e25bf3376b28328" ON "messages" ("providerMessageId") `);
        await queryRunner.query(`ALTER TABLE "conversations" ADD CONSTRAINT "FK_c6b7bd06b2ed2058982f4572961" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);

        // ── Backfill 1: sensible status for pre-existing messages ──
        await queryRunner.query(`
            UPDATE "messages"
            SET "status" = CASE WHEN "direction" = 'inbound' THEN 'received'::"public"."messages_status_enum"
                                ELSE 'sent'::"public"."messages_status_enum" END
        `);

        // ── Backfill 2: derive conversations from existing messages ──
        await queryRunner.query(`
            INSERT INTO "conversations" (
                "threadId", "agentKey", "contactId", "channel", "handoff",
                "unreadCount", "lastMessageAt", "lastInboundAt", "lastMessageBody",
                "lastMessageDirection", "messageCount", "createdAt", "updatedAt"
            )
            SELECT
                agg."threadId",
                split_part(agg."threadId", ':', 1),
                last_msg."contactId",
                last_msg.channel::text,
                false,
                0,
                agg."lastMessageAt",
                agg."lastInboundAt",
                last_msg.body,
                last_msg.direction::text,
                agg."messageCount",
                agg."firstAt",
                now()
            FROM (
                SELECT
                    "threadId",
                    MAX("createdAt") AS "lastMessageAt",
                    MIN("createdAt") AS "firstAt",
                    COUNT(*)::int AS "messageCount",
                    MAX("createdAt") FILTER (WHERE direction = 'inbound') AS "lastInboundAt"
                FROM "messages"
                GROUP BY "threadId"
            ) agg
            JOIN LATERAL (
                SELECT body, direction, channel, "contactId"
                FROM "messages" m
                WHERE m."threadId" = agg."threadId"
                ORDER BY m."createdAt" DESC, m.id DESC
                LIMIT 1
            ) last_msg ON true
            ON CONFLICT ("threadId") DO NOTHING
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "conversations" DROP CONSTRAINT "FK_c6b7bd06b2ed2058982f4572961"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_61f6b003677e25bf3376b28328"`);
        await queryRunner.query(`ALTER TABLE "messages" DROP COLUMN "providerMessageId"`);
        await queryRunner.query(`ALTER TABLE "messages" DROP COLUMN "status"`);
        await queryRunner.query(`DROP TYPE "public"."messages_status_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_b853c3320df7cf06b7bfa413c8"`);
        await queryRunner.query(`DROP TABLE "conversations"`);
    }

}
