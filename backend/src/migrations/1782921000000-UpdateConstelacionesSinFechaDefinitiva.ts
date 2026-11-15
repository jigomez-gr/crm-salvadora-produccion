import { MigrationInterface, QueryRunner } from 'typeorm';

export class UpdateConstelacionesSinFechaDefinitiva1782921000000 implements MigrationInterface {
  name = 'UpdateConstelacionesSinFechaDefinitiva1782921000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE services
      SET "eventStartDate" = NULL,
          "eventEndDate" = NULL,
          "eventDatesText" = 'Fecha por confirmar',
          "scheduleText" = 'Fecha por confirmar',
          "sinfechadefinitiva" = 'S',
          "textosinfechadefinitiva" = 'Fecha por confirmar',
          "textoespecifico" = 'comunicaremos la fecha de la próxima sesión cuando la sepamos',
          "flyerParticularUrl" = '/flyers/constelaciones_familiares_particular.jpg',
          "flyerParticularPath" = 'public/flyers/constelaciones_familiares_particular.jpg',
          "videoParticularUrl" = '/videos/constelacionesparticular.mp4',
          "videoParticularPath" = 'media_base/videos/constelacionesparticular.mp4'
      WHERE name ILIKE '%constelaci%';
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
      );
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // No-op rollback
  }
}
