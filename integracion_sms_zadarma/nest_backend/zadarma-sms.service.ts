import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import axios from 'axios';
import { ZadarmaSmsLog } from './zadarma-sms-log.entity';
import { VapiAccount } from '../../common/entities/vapi-account.entity';

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

  // Defaults can be overridden by database settings or environment variables
  private defaultApiKey = process.env.ZADARMA_API_KEY || '45dc42d6f22439899024';
  private defaultApiSecret = process.env.ZADARMA_API_SECRET || '34061190a934a453aa99';

  constructor(
    @InjectRepository(ZadarmaSmsLog)
    private readonly smsLogRepo: Repository<ZadarmaSmsLog>,
    @InjectRepository(VapiAccount)
    private readonly vapiAccountRepo: Repository<VapiAccount>,
  ) {}

  /**
   * Retrieves active Zadarma credentials from database or environment.
   */
  async getCredentials(): Promise<{ apiKey: string; apiSecret: string; senderId?: string }> {
    try {
      const [vapi] = await this.vapiAccountRepo.find({ take: 1 });
      const apiKey = (vapi as any)?.zadarmaApiKey || this.defaultApiKey;
      const apiSecret = (vapi as any)?.zadarmaApiSecret || this.defaultApiSecret;
      const senderId = (vapi as any)?.zadarmaSenderId || undefined;
      return { apiKey, apiSecret, senderId };
    } catch (err) {
      this.logger.warn(`Could not read Zadarma credentials from DB, falling back to defaults: ${err.message}`);
      return {
        apiKey: this.defaultApiKey,
        apiSecret: this.defaultApiSecret,
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
  ): string {
    // 1. Sort parameters alphabetically by key
    const sortedKeys = Object.keys(params).sort();
    const queryString = sortedKeys.map((k) => `${k}=${params[k]}`).join('&');

    // 2. MD5 hash of query string (hex)
    const md5Hash = crypto.createHash('md5').update(queryString).digest('hex');

    // 3. String to sign
    const toSign = `${methodPath}${queryString}${md5Hash}`;

    // 4. HMAC-SHA1 in hex, then Base64
    const hmacHex = crypto.createHmac('sha1', apiSecret).update(toSign).digest('hex');
    const signature = Buffer.from(hmacHex).toString('base64');

    return `${apiKey}:${signature}`;
  }

  /**
   * Sends an SMS via Zadarma API and persists the log in PostgreSQL.
   */
  async sendSms(options: SendSmsOptions): Promise<SendSmsResult> {
    const cleanNumber = options.number.replace(/\s+/g, '').replace(/^[+]/, '');
    const { apiKey, apiSecret, senderId } = await this.getCredentials();

    const methodPath = '/v1/sms/send/';
    const params: Record<string, string> = {
      number: cleanNumber,
      message: options.message,
    };

    const effectiveSender = options.sender || senderId;
    if (effectiveSender) {
      params.sender = effectiveSender;
    }

    const authHeader = this.generateAuthHeader(apiKey, apiSecret, methodPath, params);

    const formData = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      formData.append(k, v);
    }

    let rawResponse: any = null;
    let success = false;
    let errorMessage: string | undefined;

    try {
      this.logger.log(`Dispatching SMS to +${cleanNumber}...`);
      const response = await axios.post(`https://api.zadarma.com${methodPath}`, formData.toString(), {
        headers: {
          Authorization: authHeader,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        timeout: 10000,
      });

      rawResponse = response.data;
      success = rawResponse?.status === 'success';

      if (!success) {
        errorMessage = rawResponse?.message || 'Zadarma returned error status';
      }
    } catch (err: any) {
      this.logger.error(`Failed to send Zadarma SMS: ${err.message}`, err.response?.data);
      rawResponse = err.response?.data || { error: err.message };
      errorMessage = err.message;
    }

    // Persist log into database
    let logEntry: ZadarmaSmsLog | undefined;
    try {
      logEntry = this.smsLogRepo.create({
        status: rawResponse?.status || (success ? 'success' : 'error'),
        messages: rawResponse?.messages ? Number(rawResponse.messages) : 1,
        cost: rawResponse?.cost ? String(rawResponse.cost) : '0',
        currency: rawResponse?.currency || 'EUR',
        rawResponse: JSON.stringify(rawResponse),
        phone: cleanNumber,
        message: options.message,
        contactId: options.contactId,
        callId: options.callId,
        appointmentId: options.appointmentId,
      });
      await this.smsLogRepo.save(logEntry);
    } catch (dbErr: any) {
      this.logger.error(`Could not save SMS log to DB: ${dbErr.message}`);
    }

    return {
      success,
      status: rawResponse?.status,
      messages: rawResponse?.messages ? Number(rawResponse.messages) : undefined,
      cost: rawResponse?.cost ? Number(rawResponse.cost) : undefined,
      currency: rawResponse?.currency,
      rawResponse,
      error: errorMessage,
      logId: logEntry?.id,
    };
  }
}
