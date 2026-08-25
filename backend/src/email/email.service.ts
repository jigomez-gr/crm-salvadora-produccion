import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as nodemailer from 'nodemailer';
import { EmailAccount } from '../common/entities/email-account.entity';
import {
  EmailMessage,
  EmailMessageStatus,
} from '../common/entities/email-message.entity';
import { Contact } from '../common/entities/contact.entity';
import { UpdateEmailConfigDto } from './dto/email.dto';

// Fail fast instead of hanging on a wrong host/port.
const SMTP_TIMEOUT_MS = 15_000;

export interface EmailConfigView {
  fromName: string | null;
  fromAddress: string | null;
  smtpHost: string | null;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string | null;
  hasSmtpPassword: boolean;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(
    @InjectRepository(EmailAccount)
    private readonly accountRepo: Repository<EmailAccount>,
    @InjectRepository(EmailMessage)
    private readonly messageRepo: Repository<EmailMessage>,
    @InjectRepository(Contact)
    private readonly contactsRepo: Repository<Contact>,
  ) {}

  /** The single email-account row, get-or-created on first access. */
  async getAccount(): Promise<EmailAccount> {
    let [existing] = await this.accountRepo.find({
      order: { createdAt: 'ASC' },
      take: 1,
    });
    if (!existing) {
      existing = this.accountRepo.create({});
    }

    const envHost = process.env.SMTP_HOST || 'smtp.gmail.com';
    const envPort = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 587;
    const envUser = process.env.SMTP_USER || 'jigretera@gmail.com';
    const envPass = process.env.SMTP_PASS || 'moulqbjwksjrzdcg';
    const envFrom = process.env.SMTP_FROM_EMAIL || 'jigretera@gmail.com';
    const envFromName = process.env.SMTP_FROM_NAME || 'Clínica';

    if (!existing.smtpHost || !existing.smtpPassword || !existing.smtpUser) {
      existing.smtpHost = envHost;
      existing.smtpPort = envPort;
      existing.smtpSecure = false;
      existing.smtpUser = envUser;
      existing.smtpPassword = envPass;
      existing.fromAddress = envFrom;
      existing.fromName = envFromName;
      existing = await this.accountRepo.save(existing);
    }
    return existing;
  }

  /** Strip the secret; expose only whether a password is stored. */
  sanitize(acc: EmailAccount): EmailConfigView {
    return {
      fromName: acc.fromName,
      fromAddress: acc.fromAddress,
      smtpHost: acc.smtpHost,
      smtpPort: acc.smtpPort,
      smtpSecure: acc.smtpSecure,
      smtpUser: acc.smtpUser,
      hasSmtpPassword: !!acc.smtpPassword,
    };
  }

  private isConfigured(acc: EmailAccount): boolean {
    return Boolean(
      acc.smtpHost && acc.smtpUser && acc.smtpPassword && acc.fromAddress,
    );
  }

  async status(): Promise<{ configured: boolean; fromAddress: string | null }> {
    const acc = await this.getAccount();
    return {
      configured: this.isConfigured(acc),
      fromAddress: acc.fromAddress,
    };
  }

  async getConfigView(): Promise<EmailConfigView> {
    return this.sanitize(await this.getAccount());
  }

  async updateConfig(dto: UpdateEmailConfigDto): Promise<EmailConfigView> {
    const acc = await this.getAccount();
    if (dto.fromName !== undefined) acc.fromName = dto.fromName || null;
    if (dto.fromAddress !== undefined) acc.fromAddress = dto.fromAddress || null;
    if (dto.smtpHost !== undefined) acc.smtpHost = dto.smtpHost || null;
    if (dto.smtpPort !== undefined) acc.smtpPort = dto.smtpPort;
    if (dto.smtpSecure !== undefined) acc.smtpSecure = dto.smtpSecure;
    if (dto.smtpUser !== undefined) acc.smtpUser = dto.smtpUser || null;
    // An empty password means "keep the stored one" (the API never returns it).
    if (dto.smtpPassword !== undefined && dto.smtpPassword !== '') {
      acc.smtpPassword = dto.smtpPassword;
    }
    const saved = await this.accountRepo.save(acc);
    return this.sanitize(saved);
  }

  private buildTransport(acc: EmailAccount): nodemailer.Transporter {
    return nodemailer.createTransport({
      host: acc.smtpHost as string,
      port: acc.smtpPort,
      secure: acc.smtpSecure, // 465 → true (implicit TLS), 587 → false (STARTTLS)
      requireTLS: !acc.smtpSecure, // force STARTTLS when not implicit
      auth: { user: acc.smtpUser as string, pass: acc.smtpPassword as string },
      connectionTimeout: SMTP_TIMEOUT_MS,
      greetingTimeout: SMTP_TIMEOUT_MS,
      socketTimeout: SMTP_TIMEOUT_MS,
    });
  }

  private fromHeader(acc: EmailAccount): string {
    return acc.fromName
      ? `"${acc.fromName.replace(/"/g, '')}" <${acc.fromAddress}>`
      : (acc.fromAddress as string);
  }

  /** Trim a provider/SMTP error to a short, safe, user-facing message. */
  private friendlyError(err: unknown): string {
    const raw = err instanceof Error ? err.message : String(err);
    return raw.replace(/\s+/g, ' ').slice(0, 300);
  }

  /**
   * Send a test email (defaults to the configured from-address) so the operator
   * can verify the SMTP settings before using them. Throws a friendly 400 on any
   * failure so the UI can show what went wrong.
   */
  async sendTest(to?: string): Promise<{ ok: true; to: string }> {
    const acc = await this.getAccount();
    if (!this.isConfigured(acc)) {
      throw new BadRequestException(
        'Faltan datos de la cuenta de correo (servidor, usuario, contraseña y remitente).',
      );
    }
    const recipient = to || (acc.fromAddress as string);
    try {
      await this.buildTransport(acc).sendMail({
        from: this.fromHeader(acc),
        to: recipient,
        subject: 'Correo de prueba — CRM',
        text: 'Esto es un correo de prueba. Si lo recibes, tu cuenta de correo está bien configurada. ✅',
      });
      return { ok: true, to: recipient };
    } catch (err) {
      this.logger.warn(`Email test failed: ${this.friendlyError(err)}`);
      throw new BadRequestException(
        `No se pudo enviar el correo de prueba: ${this.friendlyError(err)}`,
      );
    }
  }

  /**
   * Send an email to a contact and record it in the contact's history (sent or
   * failed). Returns the persisted message. Throws a friendly 400 if the account
   * isn't configured, the contact has no email, or the send fails.
   */
  async send(
    contactId: string,
    subject: string,
    body: string,
    sentByEmail: string | null,
  ): Promise<EmailMessage> {
    const acc = await this.getAccount();
    if (!this.isConfigured(acc)) {
      throw new BadRequestException(
        'Configura primero una cuenta de correo en Ajustes → Correo electrónico.',
      );
    }
    const contact = await this.contactsRepo.findOne({ where: { id: contactId } });
    if (!contact) throw new NotFoundException('Contacto no encontrado.');
    if (!contact.email) {
      throw new BadRequestException(
        'Este contacto no tiene una dirección de correo.',
      );
    }

    const record = this.messageRepo.create({
      contactId,
      toAddress: contact.email,
      subject,
      body,
      sentByEmail,
      status: EmailMessageStatus.SENT,
    });

    try {
      const info = await this.buildTransport(acc).sendMail({
        from: this.fromHeader(acc),
        to: contact.email,
        subject,
        text: body,
      });
      record.providerMessageId = info.messageId ?? null;
      record.status = EmailMessageStatus.SENT;
      return await this.messageRepo.save(record);
    } catch (err) {
      const message = this.friendlyError(err);
      this.logger.warn(`Email send failed to contact ${contactId}: ${message}`);
      record.status = EmailMessageStatus.FAILED;
      record.error = message;
      await this.messageRepo.save(record);
      throw new BadRequestException(`No se pudo enviar el correo: ${message}`);
    }
  }

  /** A contact's sent-email history, newest first. */
  async historyFor(contactId: string): Promise<EmailMessage[]> {
    return this.messageRepo.find({
      where: { contactId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Send a rich HTML notification email to a doctor/operator with an optional attachment.
   */
  async sendNotification(
    toAddress: string,
    toName: string | null,
    subject: string,
    html: string,
    text?: string,
    attachment?: { filename: string; content: Buffer; contentType: string; cid?: string },
  ): Promise<{ ok: boolean; messageId?: string; error?: string }> {
    const acc = await this.getAccount();
    if (!this.isConfigured(acc)) {
      this.logger.warn(
        'EmailAccount is not configured in Settings. Skipping doctor notification email.',
      );
      return { ok: false, error: 'SMTP no configurado en Ajustes -> Correo' };
    }

    const recipient = toName ? `"${toName.replace(/"/g, '')}" <${toAddress}>` : toAddress;

    try {
      const attachments = attachment
        ? [
            {
              filename: attachment.filename,
              content: attachment.content,
              contentType: attachment.contentType,
              cid: attachment.cid,
            },
          ]
        : [];

      const info = await this.buildTransport(acc).sendMail({
        from: this.fromHeader(acc),
        to: recipient,
        subject,
        text: text || html.replace(/<[^>]+>/g, ' '),
        html,
        attachments,
      });

      this.logger.log(`Doctor notification email sent to ${toAddress} (messageId: ${info.messageId})`);
      return { ok: true, messageId: info.messageId };
    } catch (err) {
      const errorMsg = this.friendlyError(err);
      this.logger.warn(`Doctor notification email failed to ${toAddress}: ${errorMsg}`);
      return { ok: false, error: errorMsg };
    }
  }
}
