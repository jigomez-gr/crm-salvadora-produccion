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
  ReminderChannel,
  ReminderStatus,
} from '../common/entities/appointment-reminder.entity';
import { Service } from '../common/entities/service.entity';
import { AgentConfig } from '../common/entities/agent-config.entity';
import { AgentsConfigService } from '../agents/agents-config.service';
import {
  YCloudClient,
  TemplateComponent,
} from '../whatsapp/ycloud-client.service';
import { EmailService } from '../email/email.service';
import { ZadarmaSmsService } from '../sms/zadarma-sms.service';
import { VapiService } from '../vapi/vapi.service';
import {
  REMINDER_OFFSETS,
  ReminderOffset,
  ReminderCandidate,
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
    @InjectRepository(Service)
    private readonly servicesRepo: Repository<Service>,
    private readonly agentsConfigService: AgentsConfigService,
    private readonly ycloudClient: YCloudClient,
    private readonly emailService: EmailService,
    private readonly zadarmaSmsService: ZadarmaSmsService,
    private readonly vapiService: VapiService,
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
   * One reminder pass. Resolves service preferences per appointment,
   * evaluates due reminders across active channels, and dispatches them idempotently.
   */
  async runOnce(now: Date): Promise<void> {
    // Look up to 7 days ahead to catch custom hour offsets (e.g. 48h, 72h)
    const horizon = new Date(now.getTime() + 7 * 24 * 60 * 60_000);

    const appointments = await this.appointmentsRepo.find({
      where: {
        status: AppointmentStatus.SCHEDULED,
        startsAt: Between(now, horizon),
      },
      relations: ['contact'],
    });
    if (appointments.length === 0) return;

    // Preload distinct services for the candidate appointments
    const serviceCache = new Map<string, Service | null>();
    for (const appt of appointments) {
      const key = appt.serviceId || appt.service;
      if (key && !serviceCache.has(key)) {
        let svc: Service | null = null;
        if (appt.serviceId) {
          svc = await this.servicesRepo.findOne({ where: { id: appt.serviceId } });
        }
        if (!svc && appt.service) {
          svc = await this.servicesRepo.findOne({ where: { name: appt.service } });
        }
        serviceCache.set(key, svc);
      }
    }

    // Build candidates with service-configured offsets and channels
    const candidates: ReminderCandidate[] = [];
    for (const appt of appointments) {
      const svcKey = appt.serviceId || appt.service;
      const svc = svcKey ? serviceCache.get(svcKey) ?? null : null;

      const offsets = this.buildOffsetsForService(svc);
      const channels = this.buildChannelsForService(svc);

      if (offsets.length > 0 && channels.length > 0) {
        candidates.push({
          id: appt.id,
          startsAt: appt.startsAt,
          offsets,
          channels,
        });
      }
    }

    if (candidates.length === 0) return;

    const ids = appointments.map((a) => a.id);
    const sent = await this.remindersRepo.find({
      where: { appointmentId: In(ids) },
    });
    const sentSet = new Set(
      sent.map((r) =>
        reminderKey(r.appointmentId, r.offsetLabel, r.channel || ReminderChannel.WHATSAPP),
      ),
    );

    const due = selectDueReminders(candidates, sentSet, now);
    if (due.length === 0) return;

    const byId = new Map(appointments.map((a) => [a.id, a]));
    const configCache = new Map<string, AgentConfig | null>();

    for (const d of due) {
      const appt = byId.get(d.appointmentId);
      if (!appt) continue;
      const svcKey = appt.serviceId || appt.service;
      const svc = svcKey ? serviceCache.get(svcKey) ?? null : null;

      await this.sendReminder(appt, d.offsetLabel, d.channel, svc, configCache);
    }
  }

  private buildOffsetsForService(svc: Service | null): ReminderOffset[] {
    if (!svc) return REMINDER_OFFSETS;

    const offsets: ReminderOffset[] = [];
    const hoursEnabled = svc.reminderHoursEnabled !== false;
    const hours = svc.reminderHours && svc.reminderHours > 0 ? svc.reminderHours : 24;

    const minutesEnabled = svc.reminderMinutesEnabled !== false;
    const minutes = svc.reminderMinutes && svc.reminderMinutes > 0 ? svc.reminderMinutes : 120;

    if (hoursEnabled) {
      offsets.push({ label: `${hours}h`, minutes: hours * 60 });
    }
    // Only add minutes offset if enabled and not identical to hours
    if (minutesEnabled && (!hoursEnabled || minutes !== hours * 60)) {
      offsets.push({ label: `${minutes}m`, minutes });
    }

    return offsets;
  }

  private buildChannelsForService(svc: Service | null): string[] {
    if (!svc) {
      return [ReminderChannel.WHATSAPP, ReminderChannel.EMAIL];
    }

    const channels: string[] = [];
    if (svc.reminderWhatsapp !== false) channels.push(ReminderChannel.WHATSAPP);
    if (svc.reminderEmail !== false) channels.push(ReminderChannel.EMAIL);
    if (svc.reminderVoice) channels.push(ReminderChannel.VOICE);
    if (svc.reminderSms) channels.push(ReminderChannel.SMS);

    return channels;
  }

  private async sendReminder(
    appt: Appointment,
    offsetLabel: string,
    channel: string,
    svc: Service | null,
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

    // Never message a contact who opted out (STOP/BAJA) or was anonymized (GDPR).
    if (appt.contact?.optedOut || appt.contact?.anonymizedAt) {
      this.logger.log(
        `Reminder skipped for appointment ${appt.id} (${channel}) — contact opted out / anonymized.`,
      );
      return;
    }

    // Atomic claim: insert the idempotency row first.
    let claim: AppointmentReminder;
    try {
      claim = await this.remindersRepo.save(
        this.remindersRepo.create({
          appointmentId: appt.id,
          offsetLabel,
          channel,
          status: ReminderStatus.PENDING,
        }),
      );
    } catch (err) {
      if ((err as { code?: string })?.code === '23505') return;
      throw err;
    }

    const tz = config?.timezone || 'Europe/Madrid';
    const when = new TZDate(appt.startsAt, tz);
    const whenDateStr = format(when, "EEEE d 'de' MMMM", { locale: es });
    const whenTimeStr = format(when, 'HH:mm', { locale: es });
    const whenFullStr = `${whenDateStr} a las ${whenTimeStr}`;
    const contactName = appt.contact?.name || 'cliente';
    const phone = appt.contact?.phone;
    const email = appt.contact?.email;

    let result: { ok: boolean; providerMessageId?: string; error?: string } = {
      ok: false,
      error: 'Canal desconocido',
    };

    try {
      switch (channel) {
        case ReminderChannel.WHATSAPP: {
          if (!config?.remindersEnabled || !config.reminderTemplateName) {
            this.logger.debug(
              `Agent '${agentKey}' does not have remindersEnabled or reminderTemplateName. Skipping WhatsApp.`,
            );
            await this.remindersRepo.remove(claim);
            return;
          }
          const from = config.whatsappNumber || process.env.YCLOUD_WHATSAPP_NUMBER;
          if (!phone || !from) {
            result = { ok: false, error: 'Falta teléfono del contacto o remitente WhatsApp' };
            break;
          }
          const components = this.buildComponents(appt, config);
          const ycloudRes = await this.ycloudClient.sendTemplateMessage(
            from,
            phone,
            config.reminderTemplateName,
            config.reminderTemplateLanguage || 'es',
            components,
            config.ycloudApiKey,
          );
          result = {
            ok: ycloudRes.ok,
            providerMessageId: ycloudRes.providerMessageId,
            error: ycloudRes.error,
          };
          break;
        }

        case ReminderChannel.EMAIL: {
          if (!email) {
            result = { ok: false, error: 'El contacto no dispone de correo electrónico' };
            break;
          }
          const subject = `Recordatorio de tu cita: ${appt.service}`;
          const reminderNotesHtml = svc?.reminderNotes
            ? `<p style="margin: 12px 0; padding: 10px; background-color: #fef3c7; border-left: 4px solid #f59e0b; color: #92400e; font-size: 13px;"><strong>Indicaciones para la sesión:</strong> ${svc.reminderNotes}</p>`
            : '';

          const emailHtml = `
            <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; line-height: 1.6;">
              <h2 style="color: #4f46e5; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px;">Recordatorio de Cita</h2>
              <p>Hola <strong>${contactName}</strong>,</p>
              <p>Te recordamos que tienes una cita programada para <strong>${appt.service}</strong>:</p>
              <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin: 16px 0;">
                <p style="margin: 4px 0;">📅 <strong>Fecha:</strong> ${whenDateStr}</p>
                <p style="margin: 4px 0;">⏰ <strong>Hora:</strong> ${whenTimeStr}</p>
                <p style="margin: 4px 0;">🧘 <strong>Actividad:</strong> ${appt.service}</p>
              </div>
              ${reminderNotesHtml}
              <p style="margin-top: 20px; font-size: 13px; color: #6b7280;">Si necesitas reprogramar o cancelar, por favor contáctanos lo antes posible.</p>
              <p style="font-size: 12px; color: #9ca3af; margin-top: 24px;">Centro de Yoga Salvadora Conesa</p>
            </div>
          `;
          const emailText = `Hola ${contactName}. Te recordamos tu cita para ${appt.service} el ${whenFullStr}. Centro de Yoga Salvadora Conesa.`;

          const mailRes = await this.emailService.sendNotification(
            email,
            contactName,
            subject,
            emailHtml,
            emailText,
            undefined,
            appt.contact?.id,
          );
          result = {
            ok: mailRes.ok,
            providerMessageId: mailRes.messageId,
            error: mailRes.error,
          };
          break;
        }

        case ReminderChannel.SMS: {
          if (!phone) {
            result = { ok: false, error: 'El contacto no dispone de teléfono móvil para SMS' };
            break;
          }
          const smsText = `Hola ${contactName}, te recordamos tu cita de ${appt.service} el ${whenDateStr} a las ${whenTimeStr}. Centro de Yoga Salvadora Conesa.`;
          const smsRes = await this.zadarmaSmsService.sendSms({
            number: phone,
            message: smsText,
            contactId: appt.contact?.id,
            appointmentId: appt.id,
          });
          result = {
            ok: smsRes.success,
            providerMessageId: smsRes.logId ? String(smsRes.logId) : undefined,
            error: smsRes.error,
          };
          break;
        }

        case ReminderChannel.VOICE: {
          if (!phone) {
            result = { ok: false, error: 'El contacto no dispone de teléfono para llamada' };
            break;
          }
          const voiceMessage = `Hola ${contactName}, te llamamos del Centro de Yoga Salvadora Conesa para recordarte tu cita de ${appt.service} programada para el ${whenDateStr} a las ${whenTimeStr}. Te esperamos puntualmente. Muchas gracias y un saludo.`;
          const callRes = await this.vapiService.startOutboundCall(
            phone,
            appt.contact?.id,
            voiceMessage,
          );
          result = {
            ok: callRes.ok,
            providerMessageId: callRes.callId,
            error: callRes.error,
          };
          break;
        }
      }
    } catch (err: any) {
      result = { ok: false, error: err?.message || String(err) };
    }

    if (result.ok) {
      await this.remindersRepo.update(claim.id, {
        status: ReminderStatus.SENT,
        sentAt: new Date(),
        providerMessageId: result.providerMessageId,
      });
      this.logger.log(
        `Reminder '${offsetLabel}' via [${channel}] sent for appointment ${appt.id}`,
      );
    } else {
      await this.remindersRepo.update(claim.id, { status: ReminderStatus.FAILED });
      this.logger.error(
        `Reminder '${offsetLabel}' via [${channel}] for appointment ${appt.id} FAILED: ${result.error ?? 'unknown error'}`,
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
