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
}
