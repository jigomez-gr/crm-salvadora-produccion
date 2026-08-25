import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Initial schema — baseline migration.
 *
 * This migration is written to be IDEMPOTENT (every statement is guarded with
 * IF NOT EXISTS / existence checks) so it is safe to run against BOTH:
 *   1. a brand-new empty database (fresh install) → it creates the full schema;
 *   2. a database whose schema was already created by `synchronize: true`
 *      (any deployment that predates migrations) → every statement is a no-op
 *      and the migration is simply recorded as applied (a "baseline").
 *
 * Because of (2), upgrading an existing deployment to the migration-based setup
 * requires no manual baseline step: the first boot just records this migration.
 *
 * Subsequent migrations generated with `pnpm migration:generate` do NOT need to
 * be idempotent — they always run on top of this baseline.
 */
export class InitialSchema1782840516067 implements MigrationInterface {
  name = 'InitialSchema1782840516067';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // uuid_generate_v4() default needs the uuid-ossp extension.
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    // ─── enums (CREATE TYPE has no IF NOT EXISTS — guard each one) ───
    await queryRunner.query(`DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'appointments_status_enum') THEN
        CREATE TYPE "public"."appointments_status_enum" AS ENUM('scheduled', 'cancelled', 'completed');
      END IF;
    END $$;`);
    await queryRunner.query(`DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'messages_direction_enum') THEN
        CREATE TYPE "public"."messages_direction_enum" AS ENUM('inbound', 'outbound');
      END IF;
    END $$;`);
    await queryRunner.query(`DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'messages_channel_enum') THEN
        CREATE TYPE "public"."messages_channel_enum" AS ENUM('whatsapp', 'playground');
      END IF;
    END $$;`);
    await queryRunner.query(`DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'users_role_enum') THEN
        CREATE TYPE "public"."users_role_enum" AS ENUM('admin', 'employee');
      END IF;
    END $$;`);

    // ─── tables ───
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS "contacts" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL, "phone" character varying NOT NULL, "email" character varying, "notes" text, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_84cae51c485079bdd8cdf1d828f" UNIQUE ("phone"), CONSTRAINT "PK_b99cd40cfd66a99f1571f4f72e6" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS "appointments" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "contactId" uuid NOT NULL, "service" character varying NOT NULL, "startsAt" TIMESTAMP WITH TIME ZONE NOT NULL, "endsAt" TIMESTAMP WITH TIME ZONE NOT NULL, "status" "public"."appointments_status_enum" NOT NULL DEFAULT 'scheduled', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_4a437a9a27e948726b8bb3e36ad" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS "messages" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "contactId" uuid, "threadId" character varying NOT NULL, "direction" "public"."messages_direction_enum" NOT NULL, "channel" "public"."messages_channel_enum" NOT NULL, "body" text NOT NULL, "externalId" character varying, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_1ec186b83e617b0b8afe592a8c6" UNIQUE ("externalId"), CONSTRAINT "PK_18325f38ae6de43878487eff986" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_15f9bd2bf472ff12b6ee20012d" ON "messages" ("threadId") `);
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS "agent_configs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "agentKey" character varying NOT NULL, "businessName" character varying NOT NULL, "businessDescription" text NOT NULL, "channel" character varying NOT NULL DEFAULT 'whatsapp', "services" jsonb NOT NULL DEFAULT '[]', "workingHours" jsonb NOT NULL DEFAULT '[]', "tone" character varying NOT NULL DEFAULT 'professional', "timezone" character varying NOT NULL DEFAULT 'Europe/Madrid', "model" character varying NOT NULL DEFAULT 'openai/gpt-4o-mini', "openrouterApiKey" character varying, "whatsappNumber" character varying, "ycloudApiKey" character varying, "ycloudWebhookSecret" character varying, "enabled" boolean NOT NULL DEFAULT true, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_fe5ccd63f8f02f608140d37f955" UNIQUE ("agentKey"), CONSTRAINT "PK_25aa11529ad4eedde0691d59192" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS "users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL, "email" character varying NOT NULL, "passwordHash" character varying NOT NULL, "role" "public"."users_role_enum" NOT NULL DEFAULT 'employee', "isActive" boolean NOT NULL DEFAULT true, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email"), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`);

    // ─── foreign keys (ADD CONSTRAINT has no IF NOT EXISTS — guard each one) ───
    await queryRunner.query(`DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_4ab9e0a344942dd40060cafddb6') THEN
        ALTER TABLE "appointments" ADD CONSTRAINT "FK_4ab9e0a344942dd40060cafddb6" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
      END IF;
    END $$;`);
    await queryRunner.query(`DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_435f12bd11014722a707a292763') THEN
        ALTER TABLE "messages" ADD CONSTRAINT "FK_435f12bd11014722a707a292763" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
      END IF;
    END $$;`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "messages" DROP CONSTRAINT "FK_435f12bd11014722a707a292763"`);
    await queryRunner.query(`ALTER TABLE "appointments" DROP CONSTRAINT "FK_4ab9e0a344942dd40060cafddb6"`);
    await queryRunner.query(`DROP TABLE "users"`);
    await queryRunner.query(`DROP TYPE "public"."users_role_enum"`);
    await queryRunner.query(`DROP TABLE "agent_configs"`);
    await queryRunner.query(`DROP TABLE "contacts"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_15f9bd2bf472ff12b6ee20012d"`);
    await queryRunner.query(`DROP TABLE "messages"`);
    await queryRunner.query(`DROP TYPE "public"."messages_channel_enum"`);
    await queryRunner.query(`DROP TYPE "public"."messages_direction_enum"`);
    await queryRunner.query(`DROP TABLE "appointments"`);
    await queryRunner.query(`DROP TYPE "public"."appointments_status_enum"`);
  }
}
