import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixWhatsappContactTags1782913000000 implements MigrationInterface {
  name = 'FixWhatsappContactTags1782913000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE contacts
      SET source = 'whatsapp',
          tags = ARRAY['lead_whatsapp', 'whatsapp']
      WHERE id IN (
        SELECT DISTINCT c.id
        FROM contacts c
        JOIN conversations conv ON conv."contactId" = c.id
        WHERE conv.channel = 'whatsapp'
          AND (conv."threadId" LIKE 'booking:+%' OR conv."threadId" NOT LIKE '%widget-web%')
          AND c.source = 'landing'
          AND (c.tags = ARRAY['lead_landing_web'] OR c.tags IS NULL OR c.tags = '{}')
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // No-op rollback
  }
}
