import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLeidoToZadarmaSms1782918000000 implements MigrationInterface {
  name = 'AddLeidoToZadarmaSms1782918000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "zadarma_sms_respuesta" ADD COLUMN IF NOT EXISTS "leido" boolean NOT NULL DEFAULT false;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "zadarma_sms_respuesta" DROP COLUMN IF EXISTS "leido";
    `);
  }
}
