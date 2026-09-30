import { MigrationInterface, QueryRunner } from "typeorm";

export class EventEditionsAndServiceMedia1782911000000 implements MigrationInterface {
    name = 'EventEditionsAndServiceMedia1782911000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        // 1. Service media & specific text columns
        await queryRunner.query(`ALTER TABLE "services" ADD COLUMN IF NOT EXISTS "videoUrl" text`);
        await queryRunner.query(`ALTER TABLE "services" ADD COLUMN IF NOT EXISTS "videoPath" text`);
        await queryRunner.query(`ALTER TABLE "services" ADD COLUMN IF NOT EXISTS "textoespecifico" text`);

        // 2. Appointment edition & provisional reservation columns
        await queryRunner.query(`ALTER TABLE "appointments" ADD COLUMN IF NOT EXISTS "editionId" uuid`);
        await queryRunner.query(`ALTER TABLE "appointments" ADD COLUMN IF NOT EXISTS "isProvisional" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_appointments_editionId" ON "appointments" ("editionId")`);

        // 3. Create event_editions table
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "event_editions" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "serviceId" uuid NOT NULL,
                "title" character varying(255) NOT NULL,
                "isDateDefinite" boolean NOT NULL DEFAULT false,
                "tentativeDateText" text,
                "startsAt" TIMESTAMP WITH TIME ZONE,
                "endsAt" TIMESTAMP WITH TIME ZONE,
                "isPriceDefinite" boolean NOT NULL DEFAULT false,
                "tentativePriceText" text,
                "price" numeric(10,2),
                "minParticipants" integer NOT NULL DEFAULT 1,
                "maxCapacity" integer,
                "quorumDeadline" TIMESTAMP WITH TIME ZONE,
                "conditionsText" text,
                "status" character varying(50) NOT NULL DEFAULT 'provisional',
                "flyerParticularUrl" text,
                "videoParticularUrl" text,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_event_editions_id" PRIMARY KEY ("id"),
                CONSTRAINT "FK_event_editions_serviceId" FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE NO ACTION
            )
        `);

        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_event_editions_serviceId" ON "event_editions" ("serviceId")`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_event_editions_status" ON "event_editions" ("status")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE IF EXISTS "event_editions"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_appointments_editionId"`);
        await queryRunner.query(`ALTER TABLE "appointments" DROP COLUMN IF EXISTS "isProvisional"`);
        await queryRunner.query(`ALTER TABLE "appointments" DROP COLUMN IF EXISTS "editionId"`);
        await queryRunner.query(`ALTER TABLE "services" DROP COLUMN IF EXISTS "textoespecifico"`);
        await queryRunner.query(`ALTER TABLE "services" DROP COLUMN IF EXISTS "videoPath"`);
        await queryRunner.query(`ALTER TABLE "services" DROP COLUMN IF EXISTS "videoUrl"`);
    }
}
