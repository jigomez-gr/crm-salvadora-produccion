import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { ZadarmaSmsLog } from './zadarma-sms-log.entity';
import { VapiAccount } from '../common/entities/vapi-account.entity';

export interface SendSmsOptions {
  number: string;
  message: string;
  sender?: string;
  contactId?: string;
  callId?: string;
  appointmentId?: string;
}

export interface SendSmsResult {
  success: boolean;
  status?: string;
  messages?: number;
  cost?: number;
  currency?: string;
  rawResponse: any;
  error?: string;
  logId?: number;
}

@Injectable()
export class ZadarmaSmsService implements OnModuleInit {
  private readonly logger = new Logger(ZadarmaSmsService.name);

  // Fallback defaults from environment
  private defaultApiKey = process.env.ZADARMA_API_KEY || '45dc42d6f22439899024';
  private defaultApiSecret = process.env.ZADARMA_API_SECRET || '34061190a934a453aa99';
  private defaultSenderId = process.env.ZADARMA_SENDER_ID || 'Teamsale';

  constructor(
    @InjectRepository(ZadarmaSmsLog)
    private readonly smsLogRepo: Repository<ZadarmaSmsLog>,
    @InjectRepository(VapiAccount)
    private readonly vapiAccountRepo: Repository<VapiAccount>,
  ) {}

  async onModuleInit() {
    await this.ensureSchema();
    await this.ensureValidCredentials();
  }

  private async ensureValidCredentials(): Promise<void> {
    try {
      const vapi = await this.vapiAccountRepo.findOne({ where: {} });
      if (vapi) {
        let changed = false;
        if (!vapi.zadarmaApiKey || vapi.zadarmaApiKey.includes('*') || vapi.zadarmaApiKey.includes('•') || vapi.zadarmaApiKey.trim().length < 10) {
          vapi.zadarmaApiKey = this.defaultApiKey;
          changed = true;
        }
        if (!vapi.zadarmaApiSecret || vapi.zadarmaApiSecret.includes('*') || vapi.zadarmaApiSecret.includes('•') || vapi.zadarmaApiSecret.trim().length < 10) {
          vapi.zadarmaApiSecret = this.defaultApiSecret;
          changed = true;
        }
        if (!vapi.zadarmaSenderId) {
          vapi.zadarmaSenderId = this.defaultSenderId;
          changed = true;
        }
        if (changed) {
          await this.vapiAccountRepo.save(vapi);
          this.logger.log('Verified and repaired Zadarma SMS credentials in database.');
        }
      }
    } catch (err: any) {
      this.logger.debug(`Could not ensure valid Zadarma credentials: ${err?.message || err}`);
    }
  }

  private async ensureSchema(): Promise<void> {
    try {
      await this.smsLogRepo.query(`
        CREATE TABLE IF NOT EXISTS "zadarma_sms_respuesta" (
          "id" SERIAL PRIMARY KEY,
          "fecha" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          "fecharegistro" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          "httpstatuscode" integer,
          "status" character varying(50) NOT NULL,
          "messages" integer DEFAULT 1,
          "cost" numeric(10, 4) DEFAULT 0,
          "costtotal" numeric(10, 4) DEFAULT 0,
          "currency" character varying(10) DEFAULT 'EUR',
          "callerid" character varying(50) DEFAULT 'Teamsale',
          "phone" character varying(64) NOT NULL,
          "numerodestino" character varying(64),
          "costmin" numeric(10, 4) DEFAULT 0,
          "costmax" numeric(10, 4) DEFAULT 0,
          "message" text NOT NULL,
          "mensaje" text,
          "parts" integer DEFAULT 1,
          "raw_response" text,
          "rawjsonrespuesta" text,
          "contact_id" uuid,
          "call_id" uuid,
          "appointment_id" uuid,
          CONSTRAINT "FK_zadarmasms_contact" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL,
          CONSTRAINT "FK_zadarmasms_call" FOREIGN KEY ("call_id") REFERENCES "calls"("id") ON DELETE SET NULL,
          CONSTRAINT "FK_zadarmasms_appointment" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE SET NULL
        );
        CREATE INDEX IF NOT EXISTS "IDX_zadarmasms_phone" ON "zadarma_sms_respuesta" ("phone");
        CREATE INDEX IF NOT EXISTS "IDX_zadarmasms_fecha" ON "zadarma_sms_respuesta" ("fecha" DESC);
        CREATE INDEX IF NOT EXISTS "IDX_zadarmasms_contact" ON "zadarma_sms_respuesta" ("contact_id");
        CREATE INDEX IF NOT EXISTS "IDX_zadarmasms_call" ON "zadarma_sms_respuesta" ("call_id");
        CREATE INDEX IF NOT EXISTS "IDX_zadarmasms_appointment" ON "zadarma_sms_respuesta" ("appointment_id");
      `);
    } catch (err: any) {
      this.logger.warn(`Could not ensure zadarma_sms_respuesta schema: ${err?.message || err}`);
    }
  }

  /**
   * Retrieves active Zadarma configuration from DB or env defaults.
   */
  async getCredentials(): Promise<{
    apiKey: string;
    apiSecret: string;
    senderId: string;
    enabled: boolean;
  }> {
    try {
      const vapi = await this.vapiAccountRepo.findOne({ where: {} });
      const rawKey = vapi?.zadarmaApiKey?.trim();
      const rawSecret = vapi?.zadarmaApiSecret?.trim();
      const isValidKey = Boolean(rawKey && rawKey.length >= 10 && !rawKey.includes('*') && !rawKey.includes('•'));
      const isValidSecret = Boolean(rawSecret && rawSecret.length >= 10 && !rawSecret.includes('*') && !rawSecret.includes('•'));
      const apiKey = isValidKey ? rawKey! : this.defaultApiKey;
      const apiSecret = isValidSecret ? rawSecret! : this.defaultApiSecret;
      const senderId = vapi?.zadarmaSenderId?.trim() || this.defaultSenderId;
      const enabled = vapi?.zadarmaSmsEnabled ?? true;
      return { apiKey, apiSecret, senderId, enabled };
    } catch (err: any) {
      this.logger.warn(`Could not read Zadarma credentials from DB, falling back to defaults: ${err?.message || err}`);
      return {
        apiKey: this.defaultApiKey,
        apiSecret: this.defaultApiSecret,
        senderId: this.defaultSenderId,
        enabled: true,
      };
    }
  }

  /**
   * Generates HMAC-SHA1 signature according to Zadarma API specifications:
   * 1. Sort query parameters alphabetically.
   * 2. Calculate MD5 hash of the query string.
   * 3. Concatenate: method_path + queryString + md5Hash.
   * 4. Compute HMAC-SHA1 using secret key, format as hex, then Base64 encode.
   * 5. Header format: Authorization: {apiKey}:{signature}
   */
  public generateAuthHeader(
    apiKey: string,
    apiSecret: string,
    methodPath: string,
    params: Record<string, string>,
  ): { authHeader: string; queryString: string } {
    const sortedKeys = Object.keys(params).sort();
    const queryString = sortedKeys
      .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(params[k]).replace(/%20/g, '+')}`)
      .join('&');

    const md5Hash = crypto.createHash('md5').update(queryString).digest('hex');
    const toSign = `${methodPath}${queryString}${md5Hash}`;
    const hmacHex = crypto.createHmac('sha1', apiSecret).update(toSign).digest('hex');
    const signature = Buffer.from(hmacHex).toString('base64');

    return {
      authHeader: `${apiKey}:${signature}`,
      queryString,
    };
  }

  /**
   * Sends an SMS via Zadarma API and persists the log in PostgreSQL.
   */
  async sendSms(options: SendSmsOptions): Promise<SendSmsResult> {
    const cleanNumber = options.number.replace(/\s+/g, '').replace(/^[+]/, '');
    const { apiKey, apiSecret, senderId, enabled } = await this.getCredentials();

    if (!enabled) {
      this.logger.log(`Zadarma SMS dispatch skipped because it is disabled in settings.`);
      return {
        success: false,
        status: 'disabled',
        error: 'El servicio de SMS de Zadarma está desactivado en la configuración.',
        rawResponse: { message: 'SMS disabled' },
      };
    }

    if (!apiKey || !apiSecret) {
      this.logger.warn(`Zadarma SMS dispatch skipped: missing API key or secret.`);
      return {
        success: false,
        status: 'unconfigured',
        error: 'No se han configurado las claves API de Zadarma.',
        rawResponse: { message: 'Missing API credentials' },
      };
    }

    const methodPath = '/v1/sms/send/';
    const params: Record<string, string> = {
      message: options.message,
      number: cleanNumber,
    };

    const effectiveSender = options.sender?.trim() || senderId;
    if (effectiveSender && effectiveSender !== 'none') {
      params.sender = effectiveSender;
    }

    const { authHeader, queryString } = this.generateAuthHeader(
      apiKey,
      apiSecret,
      methodPath,
      params,
    );

    let rawResponse: any = null;
    let statusCode: number | null = null;
    let success = false;
    let errorMessage: string | undefined;

    try {
      this.logger.log(`Dispatching Zadarma SMS to +${cleanNumber}...`);
      const response = await fetch(`https://api.zadarma.com${methodPath}`, {
        method: 'POST',
        headers: {
          Authorization: authHeader,
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'CRM-Salvadora-ZadarmaSMS/1.0',
        },
        body: queryString,
        signal: AbortSignal.timeout(10000),
      });

      statusCode = response.status;
      const textBody = await response.text();

      try {
        rawResponse = JSON.parse(textBody);
      } catch {
        rawResponse = { text: textBody };
      }

      success = response.ok && rawResponse?.status === 'success';

      if (!success) {
        errorMessage = rawResponse?.message || `Zadarma HTTP status ${statusCode}`;
        this.logger.warn(`Zadarma SMS error response: ${JSON.stringify(rawResponse)}`);

        // Automatic fallback if error is 'Not authorized'
        if (rawResponse?.message === 'Not authorized' || rawResponse?.error === 'Not authorized') {
          this.logger.warn(`Zadarma API returned 'Not authorized'. Attempting immediate fallback with verified default credentials...`);
          try {
            const fallbackParams: Record<string, string> = {
              message: options.message,
              number: cleanNumber,
            };
            const fallbackSender = options.sender?.trim() || this.defaultSenderId;
            if (fallbackSender && fallbackSender !== 'none') {
              fallbackParams.sender = fallbackSender;
            }
            const fallbackAuth = this.generateAuthHeader(this.defaultApiKey, this.defaultApiSecret, methodPath, fallbackParams);
            const fallbackRes = await fetch(`https://api.zadarma.com${methodPath}`, {
              method: 'POST',
              headers: {
                Authorization: fallbackAuth.authHeader,
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': 'CRM-Salvadora-ZadarmaSMS/1.0',
              },
              body: fallbackAuth.queryString,
              signal: AbortSignal.timeout(10000),
            });
            const fallbackText = await fallbackRes.text();
            let fallbackJson: any = null;
            try {
              fallbackJson = JSON.parse(fallbackText);
            } catch {
              fallbackJson = { text: fallbackText };
            }
            if (fallbackRes.ok && fallbackJson?.status === 'success') {
              this.logger.log(`Zadarma SMS successfully dispatched via verified default credentials to +${cleanNumber}! (Cost: ${fallbackJson?.cost || 0} EUR)`);
              rawResponse = fallbackJson;
              statusCode = fallbackRes.status;
              success = true;
              errorMessage = undefined;
            } else {
              this.logger.warn(`Zadarma SMS fallback also failed: ${JSON.stringify(fallbackJson)}`);
            }
          } catch (fbErr: any) {
            this.logger.error(`Error during Zadarma SMS fallback: ${fbErr?.message || fbErr}`);
          }
        }
      } else {
        this.logger.log(`Zadarma SMS sent successfully to +${cleanNumber} (Cost: ${rawResponse?.cost || 0} ${rawResponse?.currency || 'EUR'})`);
      }
    } catch (err: any) {
      this.logger.error(`Failed to dispatch Zadarma SMS: ${err?.message || err}`, err?.stack);
      rawResponse = { error: err?.message || String(err) };
      errorMessage = err?.message || 'Network error connecting to Zadarma API';
    }

    // Extract detail fields
    const detalization =
      Array.isArray(rawResponse?.sms_detalization) && rawResponse.sms_detalization.length > 0
        ? rawResponse.sms_detalization[0]
        : null;

    const messagesCount = rawResponse?.messages ? Number(rawResponse.messages) : 1;
    const totalCost = rawResponse?.cost ? Number(rawResponse.cost) : (detalization?.cost ? Number(detalization.cost) : 0);
    const currency = rawResponse?.currency || 'EUR';
    const callerId = detalization?.callerid || effectiveSender || 'Teamsale';
    const costMin = detalization?.cost_min ? Number(detalization.cost_min) : 0;
    const costMax = detalization?.cost_max ? Number(detalization.cost_max) : 0;
    const partsCount = detalization?.parts ? Number(detalization.parts) : 1;

    // Persist log into database
    let logEntry: ZadarmaSmsLog | undefined;
    try {
      logEntry = this.smsLogRepo.create({
        status: rawResponse?.status || (success ? 'success' : 'error'),
        httpstatuscode: statusCode,
        messages: messagesCount,
        cost: totalCost,
        costtotal: totalCost,
        currency,
        callerid: callerId,
        phone: cleanNumber,
        numerodestino: cleanNumber,
        costmin: costMin,
        costmax: costMax,
        message: options.message,
        mensaje: options.message,
        parts: partsCount,
        rawResponse: JSON.stringify(rawResponse),
        rawjsonrespuesta: JSON.stringify(rawResponse),
        contactId: options.contactId || null,
        callId: options.callId || null,
        appointmentId: options.appointmentId || null,
      });
      await this.smsLogRepo.save(logEntry);
    } catch (dbErr: any) {
      this.logger.error(`Could not save SMS log to DB: ${dbErr?.message || dbErr}`);
    }

    return {
      success,
      status: rawResponse?.status || (success ? 'success' : 'error'),
      messages: messagesCount,
      cost: totalCost,
      currency,
      rawResponse,
      error: errorMessage,
      logId: logEntry?.id,
    };
  }
}
