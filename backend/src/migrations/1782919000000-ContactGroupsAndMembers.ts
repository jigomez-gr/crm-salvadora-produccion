import { MigrationInterface, QueryRunner } from 'typeorm';

export class ContactGroupsAndMembers1782919000000 implements MigrationInterface {
  name = 'ContactGroupsAndMembers1782919000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "gruposcontactos" (
        "grupocontacto" varchar(80) PRIMARY KEY,
        "descripciongrupo" text,
        "fechacreacion" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS "miembrosgrupo" (
        "id" SERIAL PRIMARY KEY,
        "grupocontacto" varchar(80) NOT NULL REFERENCES "gruposcontactos"("grupocontacto") ON DELETE CASCADE ON UPDATE CASCADE,
        "movil" varchar(64) NOT NULL,
        "campofechayhora" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
        "contact_id" uuid REFERENCES "contacts"("id") ON DELETE SET NULL
      );

      CREATE INDEX IF NOT EXISTS "IDX_miembrosgrupo_grupo" ON "miembrosgrupo" ("grupocontacto");
      CREATE INDEX IF NOT EXISTS "IDX_miembrosgrupo_movil" ON "miembrosgrupo" ("movil");
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_miembrosgrupo_grupo_movil" ON "miembrosgrupo" ("grupocontacto", "movil");

      INSERT INTO "gruposcontactos" ("grupocontacto", "descripciongrupo")
      VALUES
        ('YOGA_TERAPEUTICO_1', 'Grupo Hatha Yoga Terapéutico (Modalidad 1 clase semanal)'),
        ('YOGA_TERAPEUTICO_2', 'Grupo Hatha Yoga Terapéutico (Modalidad 2 clases semanales)'),
        ('MEDITACION', 'Grupo Meditación Guiada y Mindfulness'),
        ('GESTALT', 'Grupo Terapia Gestalt y Acompañamiento Emocional'),
        ('GONG', 'Grupo Baños de Gong y Terapia Sonora'),
        ('CONSTELACIONES', 'Grupo Constelaciones Familiares y Talleres Sistémicos'),
        ('ENCUENTROS', 'Grupo Encuentros de Mujeres y Círculos Conscientes'),
        ('PUJA', 'Grupo Ceremonias Puja y Celebraciones Espirituales'),
        ('RETIROS_AYUNO', 'Grupo Retiros de Yoga y Ayuno Consciente'),
        ('BIENESTAR_EXPERIENCE', 'Grupo Bienestar Experience y Programas Integrales')
      ON CONFLICT ("grupocontacto") DO NOTHING;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS "miembrosgrupo";
      DROP TABLE IF EXISTS "gruposcontactos";
    `);
  }
}
