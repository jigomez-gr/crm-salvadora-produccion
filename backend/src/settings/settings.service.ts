import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  AppSettings,
  PublicBranding,
} from '../common/entities/app-settings.entity';
import { OnboardingDto, UpdateSettingsDto } from './dto/settings.dto';
import { AgentsConfigService } from '../agents/agents-config.service';
import { VERTICAL_PRESETS, findPreset } from './presets';

@Injectable()
export class SettingsService {
  constructor(
    @InjectRepository(AppSettings)
    private readonly repo: Repository<AppSettings>,
    private readonly dataSource: DataSource,
    private readonly agentsConfig: AgentsConfigService,
  ) {}

  presets() {
    return VERTICAL_PRESETS;
  }

  /** Get the single settings row, creating it with defaults on first access. */
  async get(): Promise<AppSettings> {
    // findOne requires a where-clause; use find+take for the singleton row.
    const [existing] = await this.repo.find({
      order: { createdAt: 'ASC' },
      take: 1,
    });
    if (existing) return existing;
    return this.repo.save(this.repo.create({}));
  }

  async getBranding(): Promise<PublicBranding> {
    const s = await this.get();
    return {
      businessName: s.businessName,
      brandColor: s.brandColor,
      logoUrl: s.logoUrl,
    };
  }

  async update(dto: UpdateSettingsDto): Promise<AppSettings> {
    const settings = await this.get();
    if (dto.businessName !== undefined)
      settings.businessName = dto.businessName.trim() || 'CRM Salvadora';
    if (dto.brandColor !== undefined) settings.brandColor = dto.brandColor;
    if (dto.logoUrl !== undefined)
      settings.logoUrl = dto.logoUrl === '' ? null : dto.logoUrl;
    if (dto.onboardingCompleted !== undefined)
      settings.onboardingCompleted = dto.onboardingCompleted;
    return this.repo.save(settings);
  }

  /**
   * Apply the onboarding wizard: seed the default `booking` agent with the chosen
   * vertical preset (persona / services / working hours), set the business name
   * (used by both the agent and the app branding) and mark onboarding complete.
   */
  async applyOnboarding(dto: OnboardingDto): Promise<AppSettings> {
    const preset = findPreset(dto.preset);
    if (!preset) {
      throw new BadRequestException(`Preset '${dto.preset}' no válido.`);
    }
    const businessName = dto.businessName.trim() || preset.businessName;

    // Seed the default agent (created on boot) with the preset. Only sets the
    // non-secret persona fields — keys/numbers stay as configured.
    await this.agentsConfig
      .update('booking', {
        businessName,
        businessDescription: preset.businessDescription,
        tone: preset.tone,
        services: preset.services,
        workingHours: preset.workingHours,
      })
      .catch(() => undefined); // default agent should exist; don't fail onboarding if not

    const settings = await this.get();
    settings.businessName = businessName;
    settings.onboardingCompleted = true;
    return this.repo.save(settings);
  }

  /**
   * Reset all CRM data — contacts, appointments, conversations, messages and
   * reminders — keeping users, agent configs, settings and the audit trail.
   * Intended to wipe the demo seed before going live (run it before adding real
   * data). Deletes in FK-safe order inside one transaction.
   */
  async clearDemoData(): Promise<{ ok: true }> {
    await this.dataSource.transaction(async (m) => {
      await m.query('DELETE FROM appointment_reminders');
      await m.query('DELETE FROM messages');
      await m.query('DELETE FROM conversations');
      await m.query('DELETE FROM appointments');
      await m.query('DELETE FROM contacts');
    });
    return { ok: true };
  }

  /**
   * Reset the CRM for testing:
   * 1. Resets all contacts to 'lead' and 'new' pipeline stage, removing student status
   * 2. Deletes all conversations & messages (including mastra and email messages)
   * 3. Deletes all appointments & reminders
   * 4. Deletes all calls & zadarma sms logs
   * 5. Deletes all audit records
   * 6. Funnel data is fully reset because it derives from appointments and contacts
   */
  async resetTestData(): Promise<{
    ok: true;
    contactsReset: number;
    deleted: {
      conversations: boolean;
      appointments: boolean;
      calls: boolean;
      auditLogs: boolean;
    };
  }> {
    await this.dataSource.transaction(async (m) => {
      // 1. Delete appointments & reminders
      await m.query('DELETE FROM appointment_reminders');
      await m.query('DELETE FROM appointments');

      // 2. Delete conversations, messages, mastra messages/threads and email messages
      await m.query('DELETE FROM messages');
      await m.query('DELETE FROM conversations');
      await m.query(`
        DO $$ 
        BEGIN
          IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'mastra_messages') THEN
            DELETE FROM mastra_messages;
          END IF;
          IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'mastra_threads') THEN
            DELETE FROM mastra_threads;
          END IF;
          IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'email_messages') THEN
            DELETE FROM email_messages;
          END IF;
        END $$;
      `);

      // 3. Delete calls & sms logs
      await m.query(`
        DO $$ 
        BEGIN
          IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'zadarma_sms_respuesta') THEN
            DELETE FROM zadarma_sms_respuesta;
          END IF;
          IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'calls') THEN
            DELETE FROM calls;
          END IF;
        END $$;
      `);

      // 4. Delete audit records
      await m.query('DELETE FROM audit_logs');

      // 5. Reset all contacts: lead, new pipeline stage, clear student status
      await m.query(`
        UPDATE contacts
        SET status = 'lead',
            "pipelineStage" = 'new',
            "boardPosition" = 0,
            "isStudent" = false,
            "studentModality" = NULL,
            "studentSchedule" = NULL,
            "studentEnrolledAt" = NULL
      `);

      // 6. Guarantee schedule sanitization (16:30 -> 16:00) across services, agent configs and knowledge
      await m.query(`
        UPDATE services 
        SET description = replace(description, '16:30', '16:00'),
            "scheduleText" = replace("scheduleText", '16:30', '16:00')
        WHERE description LIKE '%16:30%' OR "scheduleText" LIKE '%16:30%';
        UPDATE agent_configs
        SET "customInstructions" = replace("customInstructions", '16:30', '16:00')
        WHERE "customInstructions" LIKE '%16:30%';
        UPDATE agent_configs
        SET services = replace(services::text, '16:30', '16:00')::jsonb
        WHERE services::text LIKE '%16:30%';
        UPDATE knowledge_documents
        SET content = replace(content, '16:30', '16:00')
        WHERE content LIKE '%16:30%';
        UPDATE knowledge_chunks
        SET content = replace(content, '16:30', '16:00')
        WHERE content LIKE '%16:30%';
      `);
    });

    const contactsCount = await this.dataSource.query('SELECT COUNT(*) FROM contacts');

    return {
      ok: true,
      contactsReset: parseInt(contactsCount[0]?.count || '0', 10),
      deleted: {
        conversations: true,
        appointments: true,
        calls: true,
        auditLogs: true,
      },
    };
  }
}

