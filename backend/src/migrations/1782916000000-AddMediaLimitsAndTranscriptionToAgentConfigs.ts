import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMediaLimitsAndTranscriptionToAgentConfigs1782916000000 implements MigrationInterface {
  name = 'AddMediaLimitsAndTranscriptionToAgentConfigs1782916000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "agent_configs" ADD COLUMN IF NOT EXISTS "maxAudioSizeMb" integer NOT NULL DEFAULT 100;
      ALTER TABLE "agent_configs" ADD COLUMN IF NOT EXISTS "maxDocSizeMb" integer NOT NULL DEFAULT 100;
      ALTER TABLE "agent_configs" ADD COLUMN IF NOT EXISTS "maxVideoSizeMb" integer NOT NULL DEFAULT 100;
      ALTER TABLE "agent_configs" ADD COLUMN IF NOT EXISTS "transcriptionProvider" character varying(50) NOT NULL DEFAULT 'auto';
      ALTER TABLE "agent_configs" ADD COLUMN IF NOT EXISTS "transcriptionApiKey" character varying;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "agent_configs" DROP COLUMN IF EXISTS "transcriptionApiKey";
      ALTER TABLE "agent_configs" DROP COLUMN IF EXISTS "transcriptionProvider";
      ALTER TABLE "agent_configs" DROP COLUMN IF EXISTS "maxVideoSizeMb";
      ALTER TABLE "agent_configs" DROP COLUMN IF EXISTS "maxDocSizeMb";
      ALTER TABLE "agent_configs" DROP COLUMN IF EXISTS "maxAudioSizeMb";
    `);
  }
}
