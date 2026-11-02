import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddHumanNoticeWhatsappEnabled1782917000000 implements MigrationInterface {
  name = 'AddHumanNoticeWhatsappEnabled1782917000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "app_settings" ADD COLUMN IF NOT EXISTS "humanNoticeWhatsappEnabled" boolean NOT NULL DEFAULT true;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "app_settings" DROP COLUMN IF EXISTS "humanNoticeWhatsappEnabled";
    `);
  }
}
