import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddContactadowassapToContacts1782915000000 implements MigrationInterface {
  name = 'AddContactadowassapToContacts1782915000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE contacts ADD COLUMN IF NOT EXISTS "contactadowassap" character varying(1) NOT NULL DEFAULT 'N';
    `);

    await queryRunner.query(`
      UPDATE contacts
      SET "contactadowassap" = 'S'
      WHERE source = 'whatsapp'
         OR tags @> ARRAY['whatsapp']
         OR tags @> ARRAY['lead_whatsapp'];
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE contacts DROP COLUMN IF EXISTS "contactadowassap";
    `);
  }
}
