import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 7 — business email (SMTP) + per-contact sent-mail history.
 *
 * - `email_account`: single-row SMTP account (host/port/secure/user/password +
 *   sender identity). Separate from `app_settings` so the secret never rides the
 *   public/authed settings responses.
 * - `email_messages`: one row per email sent to a contact (sent/failed), shown on
 *   the contact's detail page. Cascade-deletes with its contact.
 *
 * Purely additive; safe under `migrationsRun` on boot. Not idempotent.
 */
export class Phase7Email1782906000000 implements MigrationInterface {
  name = 'Phase7Email1782906000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "email_account" (` +
        `"id" uuid NOT NULL DEFAULT uuid_generate_v4(), ` +
        `"fromName" character varying, ` +
        `"fromAddress" character varying, ` +
        `"smtpHost" character varying, ` +
        `"smtpPort" integer NOT NULL DEFAULT 587, ` +
        `"smtpSecure" boolean NOT NULL DEFAULT false, ` +
        `"smtpUser" character varying, ` +
        `"smtpPassword" character varying, ` +
        `"createdAt" TIMESTAMP NOT NULL DEFAULT now(), ` +
        `"updatedAt" TIMESTAMP NOT NULL DEFAULT now(), ` +
        `CONSTRAINT "PK_email_account" PRIMARY KEY ("id"))`,
    );

    await queryRunner.query(
      `CREATE TABLE "email_messages" (` +
        `"id" uuid NOT NULL DEFAULT uuid_generate_v4(), ` +
        `"contactId" uuid NOT NULL, ` +
        `"toAddress" character varying NOT NULL, ` +
        `"subject" character varying NOT NULL, ` +
        `"body" text NOT NULL, ` +
        `"status" character varying NOT NULL DEFAULT 'sent', ` +
        `"error" text, ` +
        `"sentByEmail" character varying, ` +
        `"providerMessageId" character varying, ` +
        `"createdAt" TIMESTAMP NOT NULL DEFAULT now(), ` +
        `CONSTRAINT "PK_email_messages" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_email_messages_contactId" ON "email_messages" ("contactId")`,
    );
    await queryRunner.query(
      `ALTER TABLE "email_messages" ADD CONSTRAINT "FK_email_messages_contact" ` +
        `FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "email_messages" DROP CONSTRAINT "FK_email_messages_contact"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_email_messages_contactId"`,
    );
    await queryRunner.query(`DROP TABLE "email_messages"`);
    await queryRunner.query(`DROP TABLE "email_account"`);
  }
}
