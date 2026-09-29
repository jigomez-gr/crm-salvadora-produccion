import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { Contact } from '../common/entities/contact.entity';
import {
  ContactIdentityChange,
  IdentityChangeType,
  VerificationChannel,
} from './entities/contact-identity-change.entity';
import { normalizePhoneStrict, normalizePhoneLoose } from '../common/phone';
import { EmailService } from '../email/email.service';
import { ZadarmaSmsService } from '../sms/zadarma-sms.service';
import { YCloudClient } from '../whatsapp/ycloud-client.service';
import { AgentsConfigService } from '../agents/agents-config.service';

export interface ContradictionResult {
  hasContradiction: boolean;
  reason?: string;
  existingContact?: {
    id: string;
    name: string;
    phone: string;
    email: string | null;
  };
  contradictoryFields?: string[];
}

@Injectable()
export class ContactVerificationService {
  private readonly logger = new Logger(ContactVerificationService.name);
  public static readonly OTP_EXPIRY_MINUTES = 7;

  constructor(
    @InjectRepository(Contact)
    private readonly contactsRepo: Repository<Contact>,
    @InjectRepository(ContactIdentityChange)
    private readonly identityChangeRepo: Repository<ContactIdentityChange>,
    private readonly emailService: EmailService,
    private readonly zadarmaSms: ZadarmaSmsService,
    @Optional()
    private readonly ycloudClient?: YCloudClient,
    @Optional()
    private readonly agentsConfigService?: AgentsConfigService,
  ) {}

  /**
   * Detects if the provided phone, email, or name contradict existing contact records.
   */
  async detectContradiction(params: {
    phone?: string;
    email?: string;
    name?: string;
  }): Promise<ContradictionResult> {
    const rawPhone = params.phone ? normalizePhoneLoose(params.phone) : undefined;
    const cleanEmail = params.email?.trim().toLowerCase();
    const cleanName = params.name?.trim();

    if (!rawPhone && !cleanEmail) {
      return { hasContradiction: false };
    }

    let existingByPhone: Contact | null = null;
    if (rawPhone) {
      existingByPhone = await this.contactsRepo
        .createQueryBuilder('c')
        .where('c.phone = :rawPhone', { rawPhone })
        .orWhere('c.phone = :fullPhone', {
          fullPhone: rawPhone.startsWith('+') ? rawPhone : `+34${rawPhone}`,
        })
        .getOne();
    }

    let existingByEmail: Contact | null = null;
    if (cleanEmail) {
      existingByEmail = await this.contactsRepo
        .createQueryBuilder('c')
        .where('LOWER(TRIM(c.email)) = :cleanEmail', { cleanEmail })
        .getOne();
    }

    // Case 1: Phone exists for a contact, but email or name contradicts
    if (existingByPhone) {
      const contradictoryFields: string[] = [];

      if (cleanEmail && existingByPhone.email) {
        const existingEmailClean = existingByPhone.email.trim().toLowerCase();
        if (existingEmailClean !== cleanEmail) {
          contradictoryFields.push('email');
        }
      }

      if (cleanName && existingByPhone.name) {
        const normExisting = existingByPhone.name.trim().toLowerCase();
        const normGiven = cleanName.toLowerCase();
        // Check substantial divergence (not just partial/substring)
        if (
          !normExisting.includes(normGiven) &&
          !normGiven.includes(normExisting) &&
          normExisting.split(' ')[0] !== normGiven.split(' ')[0]
        ) {
          contradictoryFields.push('name');
        }
      }

      if (contradictoryFields.length > 0) {
        return {
          hasContradiction: true,
          reason: `Los datos proporcionados (${contradictoryFields.join(', ')}) contradicen el registro existente para el teléfono ${existingByPhone.phone}.`,
          existingContact: {
            id: existingByPhone.id,
            name: existingByPhone.name,
            phone: existingByPhone.phone,
            email: existingByPhone.email,
          },
          contradictoryFields,
        };
      }
    }

    // Case 2: Email exists for a contact, but phone contradicts
    if (existingByEmail && rawPhone) {
      const existingPhoneClean = normalizePhoneLoose(existingByEmail.phone);
      if (
        existingPhoneClean !== rawPhone &&
        `+34${existingPhoneClean}` !== rawPhone &&
        existingPhoneClean !== `+34${rawPhone}`
      ) {
        return {
          hasContradiction: true,
          reason: `El correo ${cleanEmail} ya está asociado al teléfono ${existingByEmail.phone}, que no coincide con el facilitado.`,
          existingContact: {
            id: existingByEmail.id,
            name: existingByEmail.name,
            phone: existingByEmail.phone,
            email: existingByEmail.email,
          },
          contradictoryFields: ['phone'],
        };
      }
    }

    return { hasContradiction: false };
  }

  /**
   * Generates and sends a 6-digit OTP code with strict 7-minute validity.
   */
  async sendOtp(params: {
    contactId?: string;
    destination: string;
    channel: VerificationChannel;
    changeType?: IdentityChangeType;
    oldValues?: Record<string, unknown>;
    newValues?: Record<string, unknown>;
    source?: string;
    ipAddress?: string;
  }): Promise<{
    success: boolean;
    changeId: string;
    expiresAt: Date;
    channel: VerificationChannel;
    destination: string;
    message: string;
  }> {
    const rawDestination = params.destination.trim();
    const destination =
      params.channel === 'email'
        ? rawDestination.toLowerCase()
        : normalizePhoneLoose(rawDestination);

    const changeType: IdentityChangeType =
      params.changeType ||
      (params.channel === 'email'
        ? 'email_error_recovery'
        : 'device_ownership_verify');

    // Generate random 6-digit OTP code
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const codeHash = crypto.createHash('sha256').update(code).digest('hex');

    // Expiry: strict 7 minutes (420 seconds)
    const expiresAt = new Date(
      Date.now() + ContactVerificationService.OTP_EXPIRY_MINUTES * 60 * 1000,
    );

    // Invalidate previous pending verifications for this destination
    await this.identityChangeRepo
      .createQueryBuilder()
      .update(ContactIdentityChange)
      .set({ status: 'expired' })
      .where('destination = :destination AND status = :pending', {
        destination,
        pending: 'pending',
      })
      .execute();

    // Persist new verification record
    const record = this.identityChangeRepo.create({
      contactId: params.contactId || null,
      changeType,
      targetChannel: params.channel,
      destination,
      codeHash,
      oldValues: params.oldValues || null,
      newValues: params.newValues || null,
      status: 'pending',
      attempts: 0,
      expiresAt,
      source: params.source || 'web',
      ipAddress: params.ipAddress || null,
    });

    const saved = await this.identityChangeRepo.save(record);

    // Dispatch OTP according to selected channel
    try {
      if (params.channel === 'email') {
        const subject = `Código de verificación: ${code} (válido 7 minutos)`;
        const html = `
          <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; border: 1px solid #e5e7eb; border-radius: 12px; background: #ffffff;">
            <div style="text-align: center; margin-bottom: 20px;">
              <h2 style="color: #15803d; margin: 0;">Centro de Yoga Salvadora Conesa</h2>
              <p style="color: #6b7280; font-size: 14px; margin-top: 4px;">Verificación de correo electrónico</p>
            </div>
            <p style="color: #374151; font-size: 15px;">Has solicitado verificar tu dirección de correo electrónico para formalizar o gestionar tu reserva.</p>
            <div style="background-color: #f0fdf4; border: 2px dashed #86efac; border-radius: 10px; padding: 20px; text-align: center; margin: 24px 0;">
              <span style="font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #166534;">${code}</span>
            </div>
            <p style="color: #b91c1c; font-size: 13px; text-align: center; font-weight: 600;">
              ⏱️ Este código es válido durante un máximo de 7 minutos.
            </p>
            <p style="color: #6b7280; font-size: 13px; margin-top: 24px; border-top: 1px solid #f3f4f6; padding-top: 16px;">
              Si no has solicitado este código, puedes ignorar este mensaje de forma segura.
            </p>
          </div>
        `;
        const text = `Tu código de verificación para Centro de Yoga Salvadora Conesa es: ${code}.\nEs válido durante un máximo de 7 minutos.`;
        const sendResult = await this.emailService.sendNotification(
          destination,
          null,
          subject,
          html,
          text,
        );
        if (!sendResult.ok) {
          this.logger.warn(`Failed sending email OTP to ${destination}: ${sendResult.error}`);
        }
      } else if (params.channel === 'sms') {
        const text = `Centro Salvadora Conesa: Tu código de verificación es ${code}. Válido durante 7 minutos.`;
        await this.zadarmaSms.sendSms({
          number: destination,
          message: text,
        });
      } else if (params.channel === 'whatsapp') {
        await this.sendWhatsAppOtp(destination, code);
      }
    } catch (err: any) {
      this.logger.error(`Error dispatching OTP to ${destination} via ${params.channel}: ${err.message}`);
    }

    return {
      success: true,
      changeId: saved.id,
      expiresAt,
      channel: params.channel,
      destination,
      message: `Código de verificación enviado a ${destination} por ${params.channel}. Válido por 7 minutos.`,
    };
  }

  /**
   * Verifies the provided 6-digit OTP code against the pending record.
   */
  async verifyOtp(params: {
    destination: string;
    code: string;
    ipAddress?: string;
  }): Promise<{
    verified: boolean;
    contactId: string | null;
    changeType: IdentityChangeType;
    message: string;
  }> {
    const rawDest = params.destination.trim();
    const destination = rawDest.includes('@')
      ? rawDest.toLowerCase()
      : normalizePhoneLoose(rawDest);

    const pending = await this.identityChangeRepo.findOne({
      where: { destination, status: 'pending' },
      order: { createdAt: 'DESC' },
    });

    if (!pending) {
      throw new BadRequestException(
        'No se ha encontrado ninguna solicitud de verificación pendiente para este destino.',
      );
    }

    // Check expiration (Strict 7 minutes)
    if (new Date() > pending.expiresAt) {
      pending.status = 'expired';
      await this.identityChangeRepo.save(pending);
      throw new BadRequestException(
        'El código de verificación ha caducado (máximo 7 minutos). Por favor, solicita uno nuevo.',
      );
    }

    // Check max attempts
    if (pending.attempts >= 3) {
      pending.status = 'failed';
      await this.identityChangeRepo.save(pending);
      throw new BadRequestException(
        'Se ha superado el número máximo de intentos permitidos (3). Solicita un nuevo código.',
      );
    }

    // Check code hash
    const enteredHash = crypto
      .createHash('sha256')
      .update(params.code.trim())
      .digest('hex');

    if (enteredHash !== pending.codeHash) {
      pending.attempts += 1;
      if (pending.attempts >= 3) {
        pending.status = 'failed';
      }
      await this.identityChangeRepo.save(pending);
      const remaining = 3 - pending.attempts;
      throw new BadRequestException(
        remaining > 0
          ? `Código de verificación incorrecto. Te quedan ${remaining} intento(s).`
          : 'Código de verificación incorrecto. Has superado el límite de intentos.',
      );
    }

    // Successful verification
    pending.status = 'verified';
    pending.verifiedAt = new Date();
    await this.identityChangeRepo.save(pending);

    // Apply updates to the contact if associated
    if (pending.contactId) {
      const contact = await this.contactsRepo.findOne({
        where: { id: pending.contactId },
      });
      if (contact) {
        // If it was an email verification or error recovery, set emailerroneo = 'N'
        if (
          pending.changeType === 'email_error_recovery' ||
          pending.changeType === 'new_contact_email_verify' ||
          pending.targetChannel === 'email'
        ) {
          contact.emailerroneo = 'N';
        }

        // Apply new values if possession was verified for identity conflict
        if (pending.newValues) {
          if (typeof pending.newValues.name === 'string' && pending.newValues.name.trim()) {
            contact.name = pending.newValues.name.trim();
          }
          if (typeof pending.newValues.phone === 'string' && pending.newValues.phone.trim()) {
            contact.phone = normalizePhoneLoose(pending.newValues.phone.trim());
          }
          if (typeof pending.newValues.email === 'string' && pending.newValues.email.trim()) {
            contact.email = pending.newValues.email.trim().toLowerCase();
            contact.emailerroneo = 'N';
          }
        }

        await this.contactsRepo.save(contact);
        this.logger.log(
          `Contact ${contact.id} verified successfully via OTP (${pending.targetChannel}). emailerroneo set to 'N'.`,
        );
      }
    }

    return {
      verified: true,
      contactId: pending.contactId,
      changeType: pending.changeType,
      message: 'Código verificado correctamente.',
    };
  }

  /**
   * Sets contact.emailerroneo = 'S' when an email delivery failure is detected.
   */
  async markEmailAsErroneous(contactId: string, reason?: string): Promise<void> {
    try {
      const contact = await this.contactsRepo.findOne({ where: { id: contactId } });
      if (contact && contact.emailerroneo !== 'S') {
        contact.emailerroneo = 'S';
        await this.contactsRepo.save(contact);
        this.logger.warn(
          `Marked contact ${contact.id} (${contact.email}) with emailerroneo='S'. Reason: ${reason || 'Email dispatch error'}`,
        );
      }
    } catch (err: any) {
      this.logger.error(`Error marking emailerroneo for contact ${contactId}: ${err.message}`);
    }
  }

  /**
   * Retrieve identity and device verification history for a contact.
   */
  async getIdentityHistory(contactId: string): Promise<ContactIdentityChange[]> {
    return this.identityChangeRepo.find({
      where: { contactId },
      order: { createdAt: 'DESC' },
    });
  }

  private async sendWhatsAppOtp(phone: string, code: string): Promise<void> {
    if (!this.ycloudClient) {
      this.logger.warn('YCloudClient not available for WhatsApp OTP');
      return;
    }

    const config = this.agentsConfigService
      ? await this.agentsConfigService.findByKeyOrNull('booking')
      : null;

    const fromNumber =
      config?.whatsappNumber ||
      process.env.YCLOUD_FROM_PHONE ||
      '+34600000000';

    const message = `🌿 *Centro de Yoga Salvadora Conesa*\nTu código de verificación es: *${code}*\n\n⏱️ Este código es válido durante un máximo de *7 minutos*.`;

    await this.ycloudClient.sendTextMessage(
      fromNumber,
      phone,
      message,
      config?.ycloudApiKey,
    );
  }
}
