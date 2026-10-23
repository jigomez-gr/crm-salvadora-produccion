import { MigrationInterface, QueryRunner } from 'typeorm';

export class UpdateConstelacionesDateAndMedia1782915000000 implements MigrationInterface {
  name = 'UpdateConstelacionesDateAndMedia1782915000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE services
      SET "eventStartDate" = '2026-11-14T09:00:00.000Z',
          "eventEndDate" = '2026-11-14T13:00:00.000Z',
          "eventDatesText" = 'Sábado 14 de Noviembre de 2026 (10:00 a 14:00)',
          "scheduleText" = 'Sábado 14 de Noviembre (10:00 a 14:00)',
          sinfechadefinitiva = 'N',
          textosinfechadefinitiva = NULL,
          "flyerParticularUrl" = '/flyers/constelaciones_familiares_particular.jpg',
          "flyerParticularPath" = 'public/flyers/constelaciones_familiares_particular.jpg',
          "videoParticularUrl" = '/videos/constelacionesparticular.mp4',
          "videoParticularPath" = 'media_base/videos/constelacionesparticular.mp4',
          description = CASE
            WHEN name ILIKE '%constelar%' THEN 'Taller vivencial mensual de sanación de vínculos y patrones familiares. Modalidad para trabajar un asunto o síntoma personal propio. Próxima fecha: Sábado 14 de Noviembre de 2026 (10:00 a 14:00). Precio: 60€. Aforo: 25 personas. Pago en el centro.'
            ELSE 'Taller vivencial mensual de sanación de vínculos familiares. Modalidad para participar como representante u observador en el campo de trabajo. Próxima fecha: Sábado 14 de Noviembre de 2026 (10:00 a 14:00). Precio: 20€. Aforo: 25 personas. Pago en el centro.'
          END
      WHERE name ILIKE '%constelaci%'
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
