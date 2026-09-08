import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixThursdayYogaSchedule16001782909000000 implements MigrationInterface {
  name = 'FixThursdayYogaSchedule16001782909000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Sanitize services table
    await queryRunner.query(`
      UPDATE services 
      SET description = replace(description, '16:30', '16:00'),
          "scheduleText" = replace("scheduleText", '16:30', '16:00')
      WHERE description LIKE '%16:30%' OR "scheduleText" LIKE '%16:30%'
    `);

    await queryRunner.query(`
      UPDATE services
      SET "weeklySchedule" = jsonb_set("weeklySchedule", '{4}', '["09:45", "11:15", "16:00", "17:30", "19:00"]'::jsonb)
      WHERE name ILIKE '%yoga%' AND "weeklySchedule" ? '4'
    `);

    // 2. Sanitize agent_configs table
    await queryRunner.query(`
      UPDATE agent_configs
      SET "customInstructions" = replace("customInstructions", '16:30', '16:00')
      WHERE "customInstructions" LIKE '%16:30%'
    `);

    await queryRunner.query(`
      UPDATE agent_configs
      SET services = replace(services::text, '16:30', '16:00')::jsonb
      WHERE services::text LIKE '%16:30%'
    `);

    // 3. Sanitize knowledge documents and chunks
    await queryRunner.query(`
      UPDATE knowledge_documents
      SET content = replace(content, '16:30', '16:00')
      WHERE content LIKE '%16:30%'
    `);

    await queryRunner.query(`
      UPDATE knowledge_chunks
      SET content = replace(content, '16:30', '16:00')
      WHERE content LIKE '%16:30%'
    `);

    // 4. Sanitize past bot messages in threads/sessions
    await queryRunner.query(`
      DO $$ 
      BEGIN
        IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'mastra_messages') THEN
          UPDATE mastra_messages SET content = replace(content, '16:30', '16:00') WHERE content LIKE '%16:30%';
        END IF;
        IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'messages') THEN
          UPDATE messages SET body = replace(body, '16:30', '16:00') WHERE body LIKE '%16:30%';
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // No-op rollback to preserve schedule correctness
  }
}
