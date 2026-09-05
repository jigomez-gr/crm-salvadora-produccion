import { Injectable, Logger } from '@nestjs/common';
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
export class ZadarmaSmsService {
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
      const apiKey = vapi?.zadarmaApiKey?.trim() || this.defaultApiKey;
      const apiSecret = vapi?.zadarmaApiSecret?.trim() || this.defaultApiSecret;
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
