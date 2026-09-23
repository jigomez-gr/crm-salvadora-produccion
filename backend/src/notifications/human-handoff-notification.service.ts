import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppSettings } from '../common/entities/app-settings.entity';
import { EmailService } from '../email/email.service';
import { ZadarmaSmsService } from '../sms/zadarma-sms.service';
import { VapiService } from '../vapi/vapi.service';

export interface HumanNoticePayload {
  channel: 'landing' | 'whatsapp' | 'vapi';
  customerName?: string | null;
  customerPhone?: string | null;
  customerEmail?: string | null;
  reason?: string | null;
  threadId?: string | null;
  extraNotes?: string | null;
}

export interface HumanNoticeResult {
  emailSent: boolean;
  smsSent: boolean;
  vapiSent: boolean;
  errors: string[];
}

@Injectable()
export class HumanHandoffNotificationService {
  private readonly logger = new Logger(HumanHandoffNotificationService.name);

  constructor(
    @InjectRepository(AppSettings)
    private readonly settingsRepo: Repository<AppSettings>,
    private readonly emailService: EmailService,
    private readonly zadarmaSmsService: ZadarmaSmsService,
    @Inject(forwardRef(() => VapiService))
    private readonly vapiService: VapiService,
  ) {}

  private async getSettings(): Promise<AppSettings | null> {
    const [existing] = await this.settingsRepo.find({
      order: { createdAt: 'ASC' },
      take: 1,
    });
    return existing || null;
  }

  /**
   * Dispatch notifications across enabled channels (Email, SMS, VAPI call)
   */
  async notifyHumanRequest(payload: HumanNoticePayload): Promise<HumanNoticeResult> {
    const settings = await this.getSettings();
    const result: HumanNoticeResult = {
      emailSent: false,
      smsSent: false,
      vapiSent: false,
      errors: [],
    };

    if (!settings) {
      this.logger.warn('No se encontraron ajustes de la aplicación. Omitiendo avisos.');
      return result;
    }

    const channelMap: Record<string, string> = {
      landing: 'Chat Web (Landing Page)',
      whatsapp: 'WhatsApp',
      vapi: 'Llamada de Voz (VAPI)',
    };
    const channelLabel = channelMap[payload.channel] || payload.channel;
    const clientName = payload.customerName?.trim() || 'Cliente interesado';
    const clientPhone = payload.customerPhone?.trim() || 'No facilitado';
    const clientEmail = payload.customerEmail?.trim() || 'No facilitado';
    const reasonText = payload.reason?.trim() || 'Desea atención directa por una persona del equipo';

    const nowFormatted = new Date().toLocaleString('es-ES', {
      timeZone: 'Europe/Madrid',
      dateStyle: 'full',
      timeStyle: 'medium',
    });

    this.logger.log(
      `🔔 Disparando aviso de atención humana desde [${channelLabel}] para ${clientName} (${clientPhone})`,
    );

    // 1. Envío por Correo Electrónico (Email)
    if (settings.humanNoticeEmailEnabled && settings.humanNoticeEmail) {
      try {
        const subject = `🚨 Solicitud de atención humana urgente (${channelLabel}) - ${clientName}`;
        const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; color: #1e293b; margin: 0; padding: 20px; }
    .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
    .header { background: #4f46e5; color: #ffffff; padding: 24px 28px; text-align: left; }
    .badge { display: inline-block; background: #ef4444; color: #ffffff; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; padding: 4px 8px; border-radius: 4px; margin-bottom: 8px; }
    .title { margin: 0; font-size: 20px; font-weight: 700; color: #ffffff; }
    .body-content { padding: 28px; }
    .info-card { background: #f1f5f9; border-radius: 8px; padding: 18px; margin: 18px 0; border-left: 4px solid #4f46e5; }
    .info-row { margin-bottom: 10px; font-size: 14px; line-height: 1.5; }
    .info-row:last-child { margin-bottom: 0; }
    .label { font-weight: 600; color: #475569; width: 140px; display: inline-block; }
    .value { color: #0f172a; font-weight: 500; }
    .reason-box { background: #fffbeb; border: 1px solid #fef3c7; border-left: 4px solid #f59e0b; padding: 14px 18px; border-radius: 6px; font-size: 14px; color: #92400e; margin-top: 16px; }
    .footer { padding: 18px 28px; background: #f8fafc; font-size: 12px; color: #64748b; text-align: center; border-top: 1px solid #e2e8f0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="badge">Atención Requerida</div>
      <h1 class="title">Solicitud de Atención Humana</h1>
    </div>
    <div class="body-content">
      <p style="margin-top: 0; font-size: 15px;">
        Un usuario ha solicitado expresamente hablar con una persona del centro y ha confirmado su petición:
      </p>

      <div class="info-card">
        <div class="info-row"><span class="label">Canal de origen:</span> <span class="value">${channelLabel}</span></div>
        <div class="info-row"><span class="label">Nombre del cliente:</span> <span class="value"><strong>${clientName}</strong></span></div>
        <div class="info-row"><span class="label">Teléfono móvil:</span> <span class="value"><a href="tel:${clientPhone}" style="color: #4f46e5; text-decoration: none; font-weight: 600;">${clientPhone}</a></span></div>
        <div class="info-row"><span class="label">Correo electrónico:</span> <span class="value">${clientEmail}</span></div>
        <div class="info-row"><span class="label">Fecha y hora:</span> <span class="value">${nowFormatted}</span></div>
      </div>

      <div class="reason-box">
        <strong>Motivo indicado por el cliente:</strong><br />
        ${reasonText}
      </div>

      <p style="font-size: 13px; color: #64748b; margin-top: 20px;">
        Por favor, contacta con el cliente a la mayor brevedad posible para resolver sus dudas o formalizar su gestión.
      </p>
    </div>
    <div class="footer">
      Centro de Yoga Salvadora Conesa &bull; Sistema de Avisos CRM
    </div>
  </div>
</body>
</html>
`;
        const emailRes = await this.emailService.sendNotification(
          settings.humanNoticeEmail.trim(),
          'Equipo Salvadora Conesa',
          subject,
          html,
        );
        if (emailRes.ok) {
          result.emailSent = true;
          this.logger.log(`✅ Correo de aviso de escalado enviado a ${settings.humanNoticeEmail}`);
        } else {
          result.errors.push(`Email error: ${emailRes.error}`);
        }
      } catch (err: any) {
        this.logger.error(`Error enviando email de aviso: ${err.message}`);
        result.errors.push(`Email exception: ${err.message}`);
      }
    }

    // 2. Envío por SMS (Zadarma)
    if (settings.humanNoticeSmsEnabled && settings.humanNoticePhone) {
      try {
        const smsText = `[CRM Salvadora] AVISO: El cliente ${clientName} (${clientPhone}) solicita hablar con un humano por ${channelLabel}. Motivo: ${reasonText.slice(0, 75)}`;
        const smsRes = await this.zadarmaSmsService.sendSms({
          number: settings.humanNoticePhone.trim(),
          message: smsText,
        });
        if (smsRes.success) {
          result.smsSent = true;
          this.logger.log(`✅ SMS de aviso de escalado enviado a ${settings.humanNoticePhone}`);
        } else {
          result.errors.push(`SMS error: ${smsRes.error || smsRes.status}`);
        }
      } catch (err: any) {
        this.logger.error(`Error enviando SMS de aviso: ${err.message}`);
        result.errors.push(`SMS exception: ${err.message}`);
      }
    }

    // 3. Llamada de Voz Saliente (VAPI Outbound)
    if (settings.humanNoticeVapiEnabled && settings.humanNoticePhone) {
      try {
        const voiceMsg = `Hola, te llamamos del Centro Salvadora Conesa para avisarte de que un usuario ha solicitado hablar con un humano a través de ${channelLabel}. El cliente es ${clientName}${payload.customerPhone ? `, con teléfono ${payload.customerPhone}` : ''}. Motivo de su solicitud: ${reasonText}. Por favor revisa el CRM para ponerte en contacto con él. Gracias.`;
        const callRes = await this.vapiService.startOutboundCall(
          settings.humanNoticePhone.trim(),
          undefined,
          voiceMsg,
        );
        if (callRes.ok) {
          result.vapiSent = true;
          this.logger.log(
            `✅ Llamada saliente VAPI de aviso iniciada a ${settings.humanNoticePhone} (Call ID: ${callRes.callId})`,
          );
        } else {
          result.errors.push(`VAPI call error: ${callRes.error}`);
        }
      } catch (err: any) {
        this.logger.error(`Error iniciando llamada VAPI de aviso: ${err.message}`);
        result.errors.push(`VAPI call exception: ${err.message}`);
      }
    }

    return result;
  }

  /**
   * Test sending a sample alert to the configured phone and email
   */
  async testNotice(): Promise<HumanNoticeResult> {
    return this.notifyHumanRequest({
      channel: 'landing',
      customerName: 'Cliente de Prueba',
      customerPhone: '+34600123456',
      customerEmail: 'prueba@ejemplo.com',
      reason: 'Esta es una prueba de verificación del sistema de avisos de atención humana desde el panel de Ajustes.',
    });
  }
}
