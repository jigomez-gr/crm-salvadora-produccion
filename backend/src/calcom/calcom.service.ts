import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CalcomAccount } from '../common/entities/calcom-account.entity';
import {
  CalcomConfigResponseDto,
  UpdateCalcomConfigDto,
} from './dto/calcom-config.dto';
import { randomBytes } from 'crypto';

export interface CreateCalcomBookingParams {
  startsAt: Date;
  endsAt: Date;
  serviceName: string;
  contact: {
    name?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    phone?: string | null;
    email?: string | null;
  };
  managerEmail?: string | null;
  managerName?: string | null;
  reason?: string | null;
  eventTypeId?: string | number | null;
  timezone?: string;
}

export interface CalcomBookingResult {
  bookingId: string;
  bookingUid: string;
  meetingUrl: string;
  status: string;
}

@Injectable()
export class CalcomService {
  private readonly logger = new Logger(CalcomService.name);

  constructor(
    @InjectRepository(CalcomAccount)
    private readonly accountRepo: Repository<CalcomAccount>,
  ) {}

  private async getAccount(): Promise<CalcomAccount> {
    const [account] = await this.accountRepo.find({
      order: { createdAt: 'ASC' },
      take: 1,
    });
    if (account) {
      return account;
    }
    const newAccount = this.accountRepo.create({
      baseUrl: process.env.CALCOM_BASE_URL || 'https://api.cal.com/v1',
      apiKey: process.env.CALCOM_API_KEY || null,
      enabled: true,
    });
    return this.accountRepo.save(newAccount);
  }

  /** Safe config response for frontend (masked secret) */
  async getConfig(): Promise<CalcomConfigResponseDto> {
    const account = await this.getAccount();
    const hasApiKey = Boolean(account.apiKey || process.env.CALCOM_API_KEY);
    const key = account.apiKey || process.env.CALCOM_API_KEY || '';
    const apiKeyPreview =
      hasApiKey && key.length > 8
        ? `${key.slice(0, 4)}••••${key.slice(-4)}`
        : hasApiKey
        ? '••••••••'
        : null;

    return {
      hasApiKey,
      apiKeyPreview,
      baseUrl: account.baseUrl,
      enabled: account.enabled,
      defaultEventTypeId: account.defaultEventTypeId ? String(account.defaultEventTypeId) : null,
    };
  }

  async updateConfig(
    dto: UpdateCalcomConfigDto,
  ): Promise<CalcomConfigResponseDto> {
    const account = await this.getAccount();
    if (dto.apiKey !== undefined) {
      account.apiKey = dto.apiKey.trim() === '' ? null : dto.apiKey.trim();
    }
    if (dto.baseUrl !== undefined) {
      account.baseUrl = dto.baseUrl.trim() || 'https://api.cal.com/v1';
    }
    if (dto.enabled !== undefined) {
      account.enabled = dto.enabled;
    }
    if (dto.defaultEventTypeId !== undefined) {
      account.defaultEventTypeId = dto.defaultEventTypeId ? dto.defaultEventTypeId.trim() : null;
    }

    await this.accountRepo.save(account);
    return this.getConfig();
  }

  /**
   * Create a virtual booking in Cal.com with the manager's email as host
   * and the contact's details (name, phone, email, reason).
   */
  async createBooking(
    params: CreateCalcomBookingParams,
  ): Promise<CalcomBookingResult> {
    const account = await this.getAccount();
    const apiKey = account.apiKey || process.env.CALCOM_API_KEY;
    const fullName =
      params.contact.name ||
      [params.contact.firstName, params.contact.lastName]
        .filter(Boolean)
        .join(' ')
        .trim() ||
      params.contact.phone ||
      'Cliente';

    const clientEmail =
      params.contact.email && params.contact.email.includes('@')
        ? params.contact.email
        : `client-${(params.contact.phone || 'crm').replace(/[^0-9]/g, '')}@crm.local`;

    const notes = [
      params.reason ? `Motivo de la consulta: ${params.reason}` : null,
      params.contact.phone ? `Teléfono cliente: ${params.contact.phone}` : null,
      params.managerEmail
        ? `Responsable del servicio: ${params.managerEmail}`
        : null,
    ]
      .filter(Boolean)
      .join('\n');

    const safeServiceName = (params.serviceName || 'sesion')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '-');
    const generatedUid = `v-${randomBytes(6).toString('hex')}`;
    const fallbackMeetingUrl = `https://meet.jit.si/salvadora-${safeServiceName}-${generatedUid}`;

    if (!account.enabled || !apiKey) {
      this.logger.log(
        `Cal.com API key not set or integration disabled; using direct video meeting URL: ${fallbackMeetingUrl}`,
      );
      return {
        bookingId: generatedUid,
        bookingUid: generatedUid,
        meetingUrl: fallbackMeetingUrl,
        status: 'ACCEPTED',
      };
    }

    try {
      const eventTypeId =
        params.eventTypeId || account.defaultEventTypeId || undefined;
      const baseUrl = account.baseUrl.replace(/\/+$/, '');
      const url = `${baseUrl}/bookings?apiKey=${encodeURIComponent(apiKey)}`;

      const payload: Record<string, any> = {
        start: params.startsAt.toISOString(),
        end: params.endsAt.toISOString(),
        title: `Cita Virtual: ${params.serviceName} - ${fullName}`,
        description: notes,
        timeZone: params.timezone || 'Europe/Madrid',
        language: 'es',
        responses: {
          name: fullName,
          email: clientEmail,
          notes,
          location: {
            value: 'integrations:daily',
            optionValue: '',
          },
        },
        metadata: {
          phone: params.contact.phone,
          managerEmail: params.managerEmail,
          serviceName: params.serviceName,
          reason: params.reason,
        },
      };

      if (eventTypeId) {
        payload.eventTypeId = /^\d+$/.test(String(eventTypeId))
          ? Number(eventTypeId)
          : eventTypeId;
      }

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'x-api-key': apiKey,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errorText = await res.text();
        this.logger.warn(
          `Cal.com API returned ${res.status}: ${errorText}. Falling back to functional video room: ${fallbackMeetingUrl}`,
        );
        return {
          bookingId: generatedUid,
          bookingUid: generatedUid,
          meetingUrl: fallbackMeetingUrl,
          status: 'ACCEPTED',
        };
      }

      const data = await res.json();
      const booking = data?.booking || data;
      const uid = booking?.uid || generatedUid;
      const id = String(booking?.id || uid);

      // Cal.com returns meeting URL in references or location
      let meetingUrl =
        booking?.location ||
        booking?.references?.find((r: any) => r.type === 'daily_video')
          ?.meetingUrl ||
        `https://app.cal.com/video/${uid}`;

      if (meetingUrl === 'integrations:daily' || !meetingUrl.startsWith('http')) {
        meetingUrl = `https://app.cal.com/video/${uid}`;
      }

      return {
        bookingId: id,
        bookingUid: uid,
        meetingUrl,
        status: booking?.status || 'ACCEPTED',
      };
    } catch (err: any) {
      this.logger.error(`Error connecting to Cal.com API: ${err.message}`, err.stack);
      return {
        bookingId: generatedUid,
        bookingUid: generatedUid,
        meetingUrl: fallbackMeetingUrl,
        status: 'ACCEPTED',
      };
    }
  }

  /** Cancel a booking in Cal.com */
  async cancelBooking(bookingUid: string, reason?: string): Promise<boolean> {
    const account = await this.getAccount();
    const apiKey = account.apiKey || process.env.CALCOM_API_KEY;
    if (!account.enabled || !apiKey || bookingUid.startsWith('cal-')) {
      return true;
    }

    try {
      const baseUrl = account.baseUrl.replace(/\/+$/, '');
      const url = `${baseUrl}/bookings/${encodeURIComponent(
        bookingUid,
      )}/cancel?apiKey=${encodeURIComponent(apiKey)}`;

      const res = await fetch(url, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'x-api-key': apiKey,
        },
        body: JSON.stringify({
          cancellationReason: reason || 'Cancelada desde el CRM',
        }),
      });
      return res.ok;
    } catch (err: any) {
      this.logger.warn(`Failed to cancel booking in Cal.com: ${err.message}`);
      return false;
    }
  }

  /** Test connection / verify API Key */
  async testConnection(): Promise<{ success: boolean; message: string }> {
    const account = await this.getAccount();
    const apiKey = account.apiKey || process.env.CALCOM_API_KEY;
    if (!apiKey) {
      return {
        success: false,
        message: 'No hay ninguna API Key de Cal.com configurada.',
      };
    }

    try {
      const baseUrl = account.baseUrl.replace(/\/+$/, '');
      // Query /event-types or /users/me
      let res = await fetch(
        `${baseUrl}/event-types?apiKey=${encodeURIComponent(apiKey)}`,
        {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'x-api-key': apiKey,
          },
        },
      );
      if (!res.ok) {
        res = await fetch(
          `${baseUrl}/users/me?apiKey=${encodeURIComponent(apiKey)}`,
          {
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'x-api-key': apiKey,
            },
          },
        );
      }
      if (res.ok) {
        return {
          success: true,
          message: 'Conexión con Cal.com establecida correctamente.',
        };
      }
      return {
        success: false,
        message: `Cal.com devolvió el código HTTP ${res.status}: ${res.statusText}`,
      };
    } catch (err: any) {
      return {
        success: false,
        message: `Error de conexión con Cal.com: ${err.message}`,
      };
    }
  }
}
