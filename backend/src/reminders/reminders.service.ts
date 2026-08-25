import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, In, Repository } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { TZDate } from '@date-fns/tz';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  Appointment,
  AppointmentStatus,
} from '../common/entities/appointment.entity';
import {
  AppointmentReminder,
  ReminderStatus,
} from '../common/entities/appointment-reminder.entity';
import { AgentConfig } from '../common/entities/agent-config.entity';
import { AgentsConfigService } from '../agents/agents-config.service';
import {
  YCloudClient,
  TemplateComponent,
} from '../whatsapp/ycloud-client.service';
import {
  REMINDER_OFFSETS,
  reminderKey,
  selectDueReminders,
} from './reminder-selection';

// The cron cadence MUST be ≤ REMINDER_GRACE_MINUTES so no reminder band is
// stepped over between ticks.
const REMINDER_CRON = '*/15 * * * *'; // every 15 minutes

@Injectable()
export class RemindersService {
  private readonly logger = new Logger(RemindersService.name);

  constructor(
    @InjectRepository(Appointment)
    private readonly appointmentsRepo: Repository<Appointment>,
    @InjectRepository(AppointmentReminder)
    private readonly remindersRepo: Repository<AppointmentReminder>,
    private readonly agentsConfigService: AgentsConfigService,
    private readonly ycloudClient: YCloudClient,
  ) {}

  @Cron(REMINDER_CRON)
  async tick(): Promise<void> {
    try {
      await this.runOnce(new Date());
    } catch (err) {
      this.logger.error(`Reminder tick failed: ${(err as Error)?.message}`);
    }
  }

  /**
   * One reminder pass. Pure selection (`selectDueReminders`) decides what's due;
   * this method only does the I/O around it. Exposed (not @Cron-only) so it can
   * be driven directly in tests / on demand.
   */
  async runOnce(now: Date): Promise<void> {
    const maxMinutes = Math.max(...REMINDER_OFFSETS.map((o) => o.minutes));
    const horizon = new Date(now.getTime() + maxMinutes * 60_000);

    const appointments = await this.appointmentsRepo.find({
      where: {
        status: AppointmentStatus.SCHEDULED,
        startsAt: Between(now, horizon),
      },
      relations: ['contact'],
    });
    if (appointments.length === 0) return;

    const ids = appointments.map((a) => a.id);
    const sent = await this.remindersRepo.find({
      where: { appointmentId: In(ids) },
    });
    const sentSet = new Set(
      sent.map((r) => reminderKey(r.appointmentId, r.offsetLabel)),
    );

    const due = selectDueReminders(
      appointments.map((a) => ({ id: a.id, startsAt: a.startsAt })),
      sentSet,
      now,
    );
    if (due.length === 0) return;

    const byId = new Map(appointments.map((a) => [a.id, a]));
    const configCache = new Map<string, AgentConfig | null>();

    for (const d of due) {
      const appt = byId.get(d.appointmentId);
      if (appt) await this.sendReminder(appt, d.offsetLabel, configCache);
    }
  }

  private async sendReminder(
    appt: Appointment,
    offsetLabel: string,
    configCache: Map<string, AgentConfig | null>,
  ): Promise<void> {
    const agentKey = appt.agentKey || 'booking';
    let config = configCache.get(agentKey);
    if (config === undefined) {
      config = await this.agentsConfigService
        .findByKeyOrNull(agentKey)
        .catch(() => null);
      configCache.set(agentKey, config);
    }

    // Not configured for reminders → skip WITHOUT claiming, so enabling it later
    // can still send (while the appointment is in band).
    if (!config?.remindersEnabled || !config.reminderTemplateName) return;

    // Never message a contact who opted out (STOP/BAJA) or was anonymized
    // (GDPR). Skip without claiming so a later opt-in can still be reminded.
    if (appt.contact?.optedOut || appt.contact?.anonymizedAt) {
      this.logger.log(
        `Reminder skipped for appointment ${appt.id} — contact opted out / anonymized.`,
      );
      return;
    }

    const phone = appt.contact?.phone;
    const from = config.whatsappNumber || process.env.YCLOUD_WHATSAPP_NUMBER;
    if (!phone || !from) return;

    // Atomic claim: insert the idempotency row first. If a concurrent tick (or
    // another instance) already claimed it, the unique (appointmentId,
    // offsetLabel) fires (23505) and we bail — never a double-send.
    let claim: AppointmentReminder;
    try {
      claim = await this.remindersRepo.save(
        this.remindersRepo.create({
          appointmentId: appt.id,
          offsetLabel,
          status: ReminderStatus.PENDING,
        }),
      );
    } catch (err) {
      if ((err as { code?: string })?.code === '23505') return;
      throw err;
    }

    const components = this.buildComponents(appt, config);
    const result = await this.ycloudClient.sendTemplateMessage(
      from,
      phone,
      config.reminderTemplateName,
      config.reminderTemplateLanguage || 'es',
      components,
      config.ycloudApiKey,
    );

    if (result.ok) {
      await this.remindersRepo.update(claim.id, {
        status: ReminderStatus.SENT,
        sentAt: new Date(),
        providerMessageId: result.providerMessageId,
      });
      this.logger.log(
        `Reminder '${offsetLabel}' sent for appointment ${appt.id} via '${agentKey}'`,
      );
    } else {
      // Keep the row as failed (no app-level retry — YCloudClient already
      // retries transient 5xx/429 internally; a persistent failure is almost
      // always a misconfigured template and shouldn't be re-attempted every
      // tick). The operator sees the error in the logs.
      await this.remindersRepo.update(claim.id, { status: ReminderStatus.FAILED });
      this.logger.error(
        `Reminder '${offsetLabel}' for appointment ${appt.id} via '${agentKey}' FAILED: ${result.error ?? 'unknown error'}`,
      );
    }
  }

  /** Build the HSM body params: {{1}} name, {{2}} service, {{3}} date+time. */
  private buildComponents(
    appt: Appointment,
    config: AgentConfig,
  ): TemplateComponent[] {
    const tz = config.timezone || 'Europe/Madrid';
    const when = new TZDate(appt.startsAt, tz);
    const whenStr = format(when, "EEEE d 'de' MMMM 'a las' HH:mm", {
      locale: es,
    });
    return [
      {
        type: 'body',
        parameters: [
          { type: 'text', text: appt.contact?.name || 'cliente' },
          { type: 'text', text: appt.service },
          { type: 'text', text: whenStr },
        ],
      },
    ];
  }
}
