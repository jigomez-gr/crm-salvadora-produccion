import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
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
export class CalcomService implements OnModuleInit {
  private readonly logger = new Logger(CalcomService.name);

  // Default credentials provided for Cal.com v2 integration
  public static readonly DEFAULT_API_KEY = 'cal_live_52d03181802548eb1270a90a738ca3ba';
  public static readonly DEFAULT_BASE_URL = 'https://api.cal.com/v2';
  public static readonly DEFAULT_EVENT_TYPE_ID = '4252426';
  public static readonly CAL_API_VERSION = '2024-08-13';

  constructor(
    @InjectRepository(CalcomAccount)
    private readonly accountRepo: Repository<CalcomAccount>,
  ) {}

  async onModuleInit() {
    try {
      await this.getAccount();
      this.logger.log('Cal.com integration service initialized.');
    } catch (err: any) {
      this.logger.warn(`Could not initialize CalcomAccount on startup: ${err.message}`);
    }
  }

  /** Normalizes any Cal.com base URL to API v2 */
  public getV2BaseUrl(rawBaseUrl?: string | null): string {
    let url = (rawBaseUrl || CalcomService.DEFAULT_BASE_URL).trim().replace(/\/+$/, '');
    if (url.endsWith('/v1')) {
      url = url.slice(0, -3) + '/v2';
    } else if (!url.endsWith('/v2')) {
      url = url + '/v2';
    }
    return url;
  }

  private async getAccount(): Promise<CalcomAccount> {
    const [account] = await this.accountRepo.find({
      order: { createdAt: 'ASC' },
      take: 1,
    });
    const defaultKey = process.env.CALCOM_API_KEY || CalcomService.DEFAULT_API_KEY;
    const defaultEventType = process.env.CALCOM_DEFAULT_EVENT_TYPE_ID || CalcomService.DEFAULT_EVENT_TYPE_ID;
    const defaultBaseUrl = this.getV2BaseUrl(process.env.CALCOM_BASE_URL || CalcomService.DEFAULT_BASE_URL);

    if (account) {
      let changed = false;
      if (!account.apiKey) {
        account.apiKey = defaultKey;
        changed = true;
      }
      if (!account.defaultEventTypeId) {
        account.defaultEventTypeId = defaultEventType;
        changed = true;
      }
      if (!account.baseUrl || account.baseUrl.includes('/v1')) {
        account.baseUrl = defaultBaseUrl;
        changed = true;
      }
      if (account.enabled === undefined || account.enabled === null) {
        account.enabled = true;
        changed = true;
      }
      if (changed) {
        return this.accountRepo.save(account);
      }
      return account;
    }

    const newAccount = this.accountRepo.create({
      baseUrl: defaultBaseUrl,
      apiKey: defaultKey,
      enabled: true,
      defaultEventTypeId: defaultEventType,
    });
    return this.accountRepo.save(newAccount);
  }

  /** Safe config response for frontend (masked secret) */
  async getConfig(): Promise<CalcomConfigResponseDto> {
    const account = await this.getAccount();
    const hasApiKey = Boolean(account.apiKey);
    const key = account.apiKey || '';
    const apiKeyPreview =
      hasApiKey && key.length > 8
        ? `${key.slice(0, 4)}••••${key.slice(-4)}`
        : hasApiKey
        ? '••••••••'
        : null;

    return {
      hasApiKey,
      apiKeyPreview,
      baseUrl: this.getV2BaseUrl(account.baseUrl),
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
      account.baseUrl = this.getV2BaseUrl(dto.baseUrl);
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
   * Create a virtual booking in Cal.com API v2 with the manager's email as host
   * and the contact's details (name, phone, email, reason).
   */
  async createBooking(
    params: CreateCalcomBookingParams,
  ): Promise<CalcomBookingResult> {
    const account = await this.getAccount();
    const apiKey = account.apiKey || process.env.CALCOM_API_KEY || CalcomService.DEFAULT_API_KEY;
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
        : `client-${(params.contact.phone || 'crm').replace(/[^0-9]/g, '')}@salvadoraconesayoga.es`;

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
        params.eventTypeId || account.defaultEventTypeId || CalcomService.DEFAULT_EVENT_TYPE_ID;
      const baseUrl = this.getV2BaseUrl(account.baseUrl);
      const url = `${baseUrl}/bookings`;

      let phoneToSend: string | undefined = undefined;
      if (params.contact.phone) {
        const cleaned = params.contact.phone.trim();
        if (/^\+?[0-9\s-]{9,20}$/.test(cleaned)) {
          phoneToSend = cleaned.startsWith('+') ? cleaned : `+34${cleaned.replace(/[^0-9]/g, '')}`;
        }
      }

      const payload: Record<string, any> = {
        start: params.startsAt.toISOString(),
        eventTypeId: Number(eventTypeId),
        attendee: {
          name: fullName,
          email: clientEmail,
          timeZone: params.timezone || 'Europe/Madrid',
          language: 'es',
          ...(phoneToSend ? { phoneNumber: phoneToSend } : {}),
        },
        metadata: {
          phone: params.contact.phone || undefined,
          managerEmail: params.managerEmail || undefined,
          serviceName: params.serviceName,
          reason: params.reason || undefined,
        },
      };

      this.logger.log(
        `Creating Cal.com v2 booking for ${fullName} (${clientEmail}) on eventTypeId=${eventTypeId} at ${params.startsAt.toISOString()}...`,
      );

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'cal-api-version': CalcomService.CAL_API_VERSION,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errorText = await res.text();
        this.logger.warn(
          `Cal.com v2 API returned ${res.status}: ${errorText}. Falling back to functional video room: ${fallbackMeetingUrl}`,
        );
        return {
          bookingId: generatedUid,
          bookingUid: generatedUid,
          meetingUrl: fallbackMeetingUrl,
          status: 'ACCEPTED',
        };
      }

      const data = await res.json();
      const booking = data?.data || data?.booking || data;
      const uid = String(booking?.uid || generatedUid);
      const id = String(booking?.id || uid);

      let meetingUrl =
        booking?.meetingUrl ||
        booking?.location ||
        `https://app.cal.com/video/${uid}`;

      if (meetingUrl === 'integrations:daily' || !meetingUrl.startsWith('http')) {
        meetingUrl = `https://app.cal.com/video/${uid}`;
      }

      this.logger.log(
        `Cal.com v2 booking successfully created: id=${id}, uid=${uid}, meetingUrl=${meetingUrl}`,
      );

      return {
        bookingId: id,
        bookingUid: uid,
        meetingUrl,
        status: booking?.status || 'accepted',
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

  /** Cancel a booking in Cal.com API v2 */
  async cancelBooking(bookingUid: string, reason?: string): Promise<boolean> {
    const account = await this.getAccount();
    const apiKey = account.apiKey || process.env.CALCOM_API_KEY || CalcomService.DEFAULT_API_KEY;
    if (!account.enabled || !apiKey || bookingUid.startsWith('v-') || bookingUid.startsWith('cal-')) {
      return true;
    }

    try {
      const baseUrl = this.getV2BaseUrl(account.baseUrl);
      const url = `${baseUrl}/bookings/${encodeURIComponent(bookingUid)}/cancel`;

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'cal-api-version': CalcomService.CAL_API_VERSION,
        },
        body: JSON.stringify({
          cancellationReason: reason || 'Cancelada desde el CRM Salvadora',
        }),
      });
      return res.ok;
    } catch (err: any) {
      this.logger.warn(`Failed to cancel booking in Cal.com: ${err.message}`);
      return false;
    }
  }

  /** Test connection / verify API Key via Cal.com v2 /me */
  async testConnection(): Promise<{ success: boolean; message: string }> {
    const account = await this.getAccount();
    const apiKey = account.apiKey || process.env.CALCOM_API_KEY || CalcomService.DEFAULT_API_KEY;
    if (!apiKey) {
      return {
        success: false,
        message: 'No hay ninguna API Key de Cal.com configurada.',
      };
    }

    try {
      const baseUrl = this.getV2BaseUrl(account.baseUrl);
      const res = await fetch(`${baseUrl}/me`, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'cal-api-version': CalcomService.CAL_API_VERSION,
        },
      });

      if (res.ok) {
        const data = await res.json();
        const user = data?.data;
        const name = user?.name || user?.username || 'Usuario Cal.com';
        const email = user?.email ? ` (${user.email})` : '';
        return {
          success: true,
          message: `Conexión con Cal.com v2 establecida correctamente: ${name}${email}.`,
        };
      }

      const errText = await res.text().catch(() => '');
      return {
        success: false,
        message: `Cal.com devolvió el código HTTP ${res.status}: ${res.statusText}. ${errText}`.trim(),
      };
    } catch (err: any) {
      return {
        success: false,
        message: `Error de conexión con Cal.com: ${err.message}`,
      };
    }
  }
}
