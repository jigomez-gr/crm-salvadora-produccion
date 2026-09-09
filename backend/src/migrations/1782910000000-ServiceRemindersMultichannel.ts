import { MigrationInterface, QueryRunner } from "typeorm";

export class ServiceRemindersMultichannel1782910000000 implements MigrationInterface {
    name = 'ServiceRemindersMultichannel1782910000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        // 1. Service reminder columns
        await queryRunner.query(`ALTER TABLE "services" ADD COLUMN IF NOT EXISTS "reminderWhatsapp" boolean NOT NULL DEFAULT true`);
        await queryRunner.query(`ALTER TABLE "services" ADD COLUMN IF NOT EXISTS "reminderEmail" boolean NOT NULL DEFAULT true`);
        await queryRunner.query(`ALTER TABLE "services" ADD COLUMN IF NOT EXISTS "reminderVoice" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`ALTER TABLE "services" ADD COLUMN IF NOT EXISTS "reminderSms" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`ALTER TABLE "services" ADD COLUMN IF NOT EXISTS "reminderHoursEnabled" boolean NOT NULL DEFAULT true`);
        await queryRunner.query(`ALTER TABLE "services" ADD COLUMN IF NOT EXISTS "reminderHours" integer NOT NULL DEFAULT 24`);
        await queryRunner.query(`ALTER TABLE "services" ADD COLUMN IF NOT EXISTS "reminderMinutesEnabled" boolean NOT NULL DEFAULT true`);
        await queryRunner.query(`ALTER TABLE "services" ADD COLUMN IF NOT EXISTS "reminderMinutes" integer NOT NULL DEFAULT 120`);

        // 2. Appointment reminders channel column and unique constraint update
        await queryRunner.query(`ALTER TABLE "appointment_reminders" ADD COLUMN IF NOT EXISTS "channel" character varying NOT NULL DEFAULT 'whatsapp'`);
        await queryRunner.query(`ALTER TABLE "appointment_reminders" DROP CONSTRAINT IF EXISTS "UQ_a2a304e63cdbacfacf60091a70c"`);
        await queryRunner.query(`ALTER TABLE "appointment_reminders" DROP CONSTRAINT IF EXISTS "UQ_appointment_reminders_appt_offset_channel"`);
        await queryRunner.query(`ALTER TABLE "appointment_reminders" ADD CONSTRAINT "UQ_appointment_reminders_appt_offset_channel" UNIQUE ("appointmentId", "offsetLabel", "channel")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "appointment_reminders" DROP CONSTRAINT IF EXISTS "UQ_appointment_reminders_appt_offset_channel"`);
        await queryRunner.query(`ALTER TABLE "appointment_reminders" ADD CONSTRAINT "UQ_a2a304e63cdbacfacf60091a70c" UNIQUE ("appointmentId", "offsetLabel")`);
        await queryRunner.query(`ALTER TABLE "appointment_reminders" DROP COLUMN IF EXISTS "channel"`);

        await queryRunner.query(`ALTER TABLE "services" DROP COLUMN IF EXISTS "reminderMinutes"`);
        await queryRunner.query(`ALTER TABLE "services" DROP COLUMN IF EXISTS "reminderMinutesEnabled"`);
        await queryRunner.query(`ALTER TABLE "services" DROP COLUMN IF EXISTS "reminderHours"`);
        await queryRunner.query(`ALTER TABLE "services" DROP COLUMN IF EXISTS "reminderHoursEnabled"`);
        await queryRunner.query(`ALTER TABLE "services" DROP COLUMN IF EXISTS "reminderSms"`);
        await queryRunner.query(`ALTER TABLE "services" DROP COLUMN IF EXISTS "reminderVoice"`);
        await queryRunner.query(`ALTER TABLE "services" DROP COLUMN IF EXISTS "reminderEmail"`);
        await queryRunner.query(`ALTER TABLE "services" DROP COLUMN IF EXISTS "reminderWhatsapp"`);
    }
}
