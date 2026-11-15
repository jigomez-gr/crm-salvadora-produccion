import { MigrationInterface, QueryRunner } from 'typeorm';

export class EnsureHathaYogaCompleteOfficialSchedule1782920000000
  implements MigrationInterface
{
  name = 'EnsureHathaYogaCompleteOfficialSchedule1782920000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const fullSchedule =
      'Martes (9:45, 11:15, 17:00, 18:30, 20:00), Miércoles (20:15) y Jueves (9:45, 11:15, 16:00, 17:30, 19:00)';
    const fullWeeklyJson = JSON.stringify({
      '2': ['09:45', '11:15', '17:00', '18:30', '20:00'],
      '3': ['20:15'],
      '4': ['09:45', '11:15', '16:00', '17:30', '19:00'],
    });

    // 1. Sanitize services table
    await queryRunner.query(`
      UPDATE services 
      SET "weeklySchedule" = '${fullWeeklyJson}'::jsonb,
          "scheduleText" = '${fullSchedule}'
      WHERE name ILIKE '%yoga%' OR name ILIKE '%hatha%';
    `);

    // 2. Sanitize agent_configs table
    await queryRunner.query(`
      UPDATE agent_configs
      SET "customInstructions" = regexp_replace(
        "customInstructions",
        'Hatha Yoga Terapéutico:[^\n]+',
        'Hatha Yoga Terapéutico: Mañanas: Martes y Jueves (9:45 y 11:15). Tardes: Martes (17:00, 18:30, 20:00), Miércoles (20:15), Jueves (16:00, 17:30, 19:00). Clases de 90 min.',
        'gi'
      )
      WHERE "customInstructions" ILIKE '%hatha%yoga%';
    `);

    // 3. Update knowledge chunks and documents
    await queryRunner.query(`
      UPDATE knowledge_documents
      SET content = regexp_replace(
        content,
        'Hatha Yoga Terapéutico:[^\n]+',
        'Hatha Yoga Terapéutico: Mañanas: Martes y Jueves (9:45 y 11:15). Tardes: Martes (17:00, 18:30, 20:00), Miércoles (20:15), Jueves (16:00, 17:30, 19:00). Clases de 90 min.',
        'gi'
      )
      WHERE content ILIKE '%hatha%yoga%';
    `);

    await queryRunner.query(`
      UPDATE knowledge_chunks
      SET content = regexp_replace(
        content,
        'Hatha Yoga Terapéutico:[^\n]+',
        'Hatha Yoga Terapéutico: Mañanas: Martes y Jueves (9:45 y 11:15). Tardes: Martes (17:00, 18:30, 20:00), Miércoles (20:15), Jueves (16:00, 17:30, 19:00). Clases de 90 min.',
        'gi'
      )
      WHERE content ILIKE '%hatha%yoga%';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // No-op rollback to preserve schedule correctness
  }
}
