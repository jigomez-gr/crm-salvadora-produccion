import { MigrationInterface, QueryRunner } from 'typeorm';

export class Phase9ZadarmaSms1782908000000 implements MigrationInterface {
  name = 'Phase9ZadarmaSms1782908000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "zadarma_sms_respuesta" (` +
        `"id" SERIAL PRIMARY KEY, ` +
        `"fecha" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP, ` +
        `"fecharegistro" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP, ` +
        `"httpstatuscode" integer, ` +
        `"status" character varying(50) NOT NULL, ` +
        `"messages" integer DEFAULT 1, ` +
        `"cost" numeric(10, 4) DEFAULT 0, ` +
        `"costtotal" numeric(10, 4) DEFAULT 0, ` +
        `"currency" character varying(10) DEFAULT 'EUR', ` +
        `"callerid" character varying(50) DEFAULT 'Teamsale', ` +
        `"phone" character varying(64) NOT NULL, ` +
        `"numerodestino" character varying(64), ` +
        `"costmin" numeric(10, 4) DEFAULT 0, ` +
        `"costmax" numeric(10, 4) DEFAULT 0, ` +
        `"message" text NOT NULL, ` +
        `"mensaje" text, ` +
        `"parts" integer DEFAULT 1, ` +
        `"raw_response" text, ` +
        `"rawjsonrespuesta" text, ` +
        `"contact_id" uuid, ` +
        `"call_id" uuid, ` +
        `"appointment_id" uuid, ` +
        `CONSTRAINT "FK_zadarmasms_contact" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL, ` +
        `CONSTRAINT "FK_zadarmasms_call" FOREIGN KEY ("call_id") REFERENCES "calls"("id") ON DELETE SET NULL, ` +
        `CONSTRAINT "FK_zadarmasms_appointment" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE SET NULL` +
      `)`,
    );

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_zadarmasms_phone" ON "zadarma_sms_respuesta" ("phone")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_zadarmasms_fecha" ON "zadarma_sms_respuesta" ("fecha" DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_zadarmasms_contact" ON "zadarma_sms_respuesta" ("contact_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_zadarmasms_call" ON "zadarma_sms_respuesta" ("call_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_zadarmasms_appointment" ON "zadarma_sms_respuesta" ("appointment_id")`,
    );

    // Compatibility view for C# scripts or older queries
    await queryRunner.query(
      `DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_views WHERE viewname = 'zadarmasmsrespuesta') 
           AND NOT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'zadarmasmsrespuesta') THEN
          CREATE VIEW "zadarmasmsrespuesta" AS SELECT * FROM "zadarma_sms_respuesta";
        END IF;
      END $$;`,
    );

    // Add Zadarma SMS columns to vapi_accounts
    await queryRunner.query(
      `ALTER TABLE "vapi_accounts" ADD COLUMN IF NOT EXISTS "zadarmaApiKey" character varying(100)`,
    );
    await queryRunner.query(
      `ALTER TABLE "vapi_accounts" ADD COLUMN IF NOT EXISTS "zadarmaApiSecret" character varying(100)`,
    );
    await queryRunner.query(
      `ALTER TABLE "vapi_accounts" ADD COLUMN IF NOT EXISTS "zadarmaSenderId" character varying(50) DEFAULT 'Teamsale'`,
    );
    await queryRunner.query(
      `ALTER TABLE "vapi_accounts" ADD COLUMN IF NOT EXISTS "zadarmaSmsEnabled" boolean NOT NULL DEFAULT true`,
    );
    await queryRunner.query(
      `ALTER TABLE "vapi_accounts" ADD COLUMN IF NOT EXISTS "smsAutoConfirmation" boolean NOT NULL DEFAULT true`,
    );
    await queryRunner.query(
      `ALTER TABLE "vapi_accounts" ADD COLUMN IF NOT EXISTS "smsConfirmationTemplate" text`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP VIEW IF EXISTS "zadarmasmsrespuesta"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "zadarma_sms_respuesta"`);
    await queryRunner.query(
      `ALTER TABLE "vapi_accounts" ` +
        `DROP COLUMN IF EXISTS "zadarmaApiKey", ` +
        `DROP COLUMN IF EXISTS "zadarmaApiSecret", ` +
        `DROP COLUMN IF EXISTS "zadarmaSenderId", ` +
        `DROP COLUMN IF EXISTS "zadarmaSmsEnabled", ` +
        `DROP COLUMN IF EXISTS "smsAutoConfirmation", ` +
        `DROP COLUMN IF EXISTS "smsConfirmationTemplate"`,
    );
  }
}
