import { MigrationInterface, QueryRunner } from 'typeorm';

export class UpdateBanoGongDateAndFlyer1782914000000 implements MigrationInterface {
  name = 'UpdateBanoGongDateAndFlyer1782914000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE services
      SET "eventStartDate" = '2026-11-21T17:00:00.000Z',
          "eventEndDate" = '2026-11-21T19:00:00.000Z',
          "eventDatesText" = 'Sábado 21 de Noviembre de 2026 (18:00 a 20:00)',
          sinfechadefinitiva = 'N',
          textosinfechadefinitiva = NULL,
          textoespecifico = 'Próxima sesión confirmada: Sábado 21 de Noviembre de 2026 de 18:00 a 20:00 h.',
          "flyerParticularUrl" = '/flyers/banogongparticular.jpg',
          "flyerParticularPath" = 'public/flyers/banogongparticular.jpg',
          description = 'Un sábado al mes (el último sábado de cada mes). Sesión completa de 2 horas: preparación, baño de sonido envolvente con gongs y meditación integradora. Próxima sesión: Sábado 21 de Noviembre de 2026 (18:00 a 20:00). Aforo máximo: 30 personas. Precio: 16€. Pago en el centro.'
      WHERE id = '3886172f-4a00-4af7-9d5f-5c4015e07f9c' OR name ILIKE '%Baño de Gong y Meditación Sonora%'
    `);

    // Synchronize agent_configs.services JSON snapshot with active services
    await queryRunner.query(`
      UPDATE agent_configs
      SET services = (
        SELECT jsonb_agg(
          jsonb_build_object(
            'name', s.name,
            'durationMinutes', s."durationMinutes",
            'price', s.price,
            'serviceType', s."serviceType",
            'eventDatesText', s."eventDatesText",
            'scheduleText', s."scheduleText",
            'description', s.description,
            'weeklySchedule', s."weeklySchedule",
            'maxCapacity', s."maxCapacity",
            'minQuorum', s."minQuorum",
            'paymentType', s."paymentType",
            'externalPaymentUrl', s."externalPaymentUrl",
            'allowedModalities', s."allowedModalities",
            'requiresReason', s."requiresReason",
            'sinfechadefinitiva', s.sinfechadefinitiva,
            'textosinfechadefinitiva', s.textosinfechadefinitiva,
            'sinpreciodefinitivo', s.sinpreciodefinitivo,
            'textosinpreciodefinitivo', s.textosinpreciodefinitivo,
            'flyerUrl', s."flyerUrl",
            'flyerParticularUrl', s."flyerParticularUrl",
            'videoUrl', s."videoUrl",
            'videoParticularUrl', s."videoParticularUrl",
            'textoespecifico', s.textoespecifico
          )
        )
        FROM services s
        WHERE s."isActive" = true
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // No-op rollback
  }
}
