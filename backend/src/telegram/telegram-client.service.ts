import { Injectable, Logger } from '@nestjs/common';
import { isTelegramBotToken } from './telegram-inbound-parser';

export const DEFAULT_TELEGRAM_API_BASE_URL = 'https://api.telegram.org';
export const TELEGRAM_ALLOWED_UPDATES = ['message', 'callback_query', 'my_chat_member'] as const;
export const TELEGRAM_MAX_TEXT_LENGTH = 4096;
export const TELEGRAM_MAX_CAPTION_LENGTH = 1024;

export interface TelegramBotInfo {
  id: string;
  isBot: boolean;
  firstName: string;
  username: string;
}

export interface TelegramWebhookInfo {
  url: string;
  hasCustomCertificate: boolean;
  pendingUpdateCount: number;
  lastErrorDate?: number;
  lastErrorMessage?: string;
}

export interface TelegramSendResult {
  ok: boolean;
  providerMessageId?: string;
  chatId?: string;
  error?: string;
  errorCode?: number;
  blockedByUser?: boolean;
}

export interface TelegramMediaUpload {
  buffer: Buffer;
  filename: string;
  mimeType: string;
}

export function describeTelegramErrorCode(code?: number | null, rawDesc?: string): string {
  switch (code) {
    case 400:
      return rawDesc
        ? `Telegram rechazó la petición (400): ${rawDesc}`
        : 'Telegram rechazó la petición (código 400). Revisa el mensaje o el identificador del chat.';
    case 401:
    case 404:
      return 'El token del bot de Telegram no es válido o ha sido revocado en @BotFather.';
    case 403:
      return 'El usuario ha bloqueado el bot de Telegram o todavía no ha pulsado Iniciar (/start).';
    case 409:
      return 'Conflicto en Telegram (409): el bot está siendo consultado desde otra instancia.';
    case 413:
      return 'El archivo adjunto supera el tamaño máximo permitido por Telegram.';
    case 429:
      return 'Límite de peticiones de Telegram alcanzado temporalmente (429).';
    default:
      if (typeof code === 'number' && code >= 500) {
        return `Error temporal en los servidores de Telegram (${code}).`;
      }
      return rawDesc || 'Error de comunicación con Telegram Bot API.';
  }
}

@Injectable()
export class TelegramClientService {
  private readonly logger = new Logger(TelegramClientService.name);
  private customFetch?: typeof fetch;

  /** Allow unit/integration tests to inject a mock fetch implementation. */
  setFetchImplementation(fn?: typeof fetch) {
    this.customFetch = fn;
  }

  private get fetchImpl(): typeof fetch {
    return this.customFetch || globalThis.fetch;
  }

  private get baseUrl(): string {
    return (process.env.TELEGRAM_API_BASE_URL || DEFAULT_TELEGRAM_API_BASE_URL).replace(/\/+$/, '');
  }

  /**
   * Internal helper to call `<baseUrl>/bot<token>/<method>`.
   * Never logs or exposes the token in error messages.
   */
  private async callApi<T = any>(
    token: string,
    method: string,
    payload?: Record<string, any> | FormData,
    timeoutMs = 15_000,
  ): Promise<{ ok: boolean; result?: T; errorCode?: number; description?: string }> {
    const cleanToken = (token || '').trim();
    if (!isTelegramBotToken(cleanToken)) {
      return {
        ok: false,
        errorCode: 401,
        description: describeTelegramErrorCode(401),
      };
    }

    const url = `${this.baseUrl}/bot${cleanToken}/${method}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const isMultipart = typeof FormData !== 'undefined' && payload instanceof FormData;
      const headers: Record<string, string> = { Accept: 'application/json' };
      let body: BodyInit | undefined;

      if (payload && !isMultipart) {
        headers['Content-Type'] = 'application/json';
        body = JSON.stringify(payload);
      } else if (isMultipart) {
        body = payload as FormData;
      }

      const res = await this.fetchImpl(url, {
        method: 'POST',
        headers,
        body,
        signal: controller.signal,
      });

      const text = await res.text();
      let parsed: any = null;
      try {
        parsed = text ? JSON.parse(text) : null;
      } catch {
        parsed = null;
      }

      if (!res.ok || !parsed?.ok) {
        const code = parsed?.error_code ?? res.status;
        const desc = describeTelegramErrorCode(code, parsed?.description);
        return {
          ok: false,
          errorCode: code,
          description: desc,
        };
      }

      return {
        ok: true,
        result: parsed.result as T,
      };
    } catch (err: any) {
      const isTimeout = err?.name === 'AbortError';
      // Never log `err.message` raw if it might contain the request URL with the token
      const safeReason = isTimeout
        ? 'Tiempo de espera agotado al contactar con Telegram.'
        : 'Error de red al conectar con Telegram Bot API.';
      this.logger.warn(`Telegram API [${method}] network failure: ${safeReason}`);
      return {
        ok: false,
        errorCode: isTimeout ? 408 : 0,
        description: safeReason,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  async getMe(token: string): Promise<{ ok: boolean; bot?: TelegramBotInfo; error?: string; errorCode?: number }> {
    const res = await this.callApi<any>(token, 'getMe');
    if (!res.ok || !res.result) {
      return {
        ok: false,
        error: res.description || describeTelegramErrorCode(res.errorCode),
        errorCode: res.errorCode,
      };
    }
    return {
      ok: true,
      bot: {
        id: String(res.result.id),
        isBot: Boolean(res.result.is_bot),
        firstName: String(res.result.first_name || ''),
        username: String(res.result.username || ''),
      },
    };
  }

  async getWebhookInfo(
    token: string,
  ): Promise<{ ok: boolean; info?: TelegramWebhookInfo; error?: string; errorCode?: number }> {
    const res = await this.callApi<any>(token, 'getWebhookInfo');
    if (!res.ok || !res.result) {
      return {
        ok: false,
        error: res.description || describeTelegramErrorCode(res.errorCode),
        errorCode: res.errorCode,
      };
    }
    return {
      ok: true,
      info: {
        url: String(res.result.url || ''),
        hasCustomCertificate: Boolean(res.result.has_custom_certificate),
        pendingUpdateCount: Number(res.result.pending_update_count || 0),
        lastErrorDate: res.result.last_error_date,
        lastErrorMessage: res.result.last_error_message,
      },
    };
  }

  async setWebhook(
    token: string,
    webhookUrl: string,
    secretToken: string,
  ): Promise<{ ok: boolean; error?: string; errorCode?: number }> {
    const res = await this.callApi<boolean>(token, 'setWebhook', {
      url: webhookUrl,
      secret_token: secretToken,
      allowed_updates: [...TELEGRAM_ALLOWED_UPDATES],
    });
    if (!res.ok) {
      return {
        ok: false,
        error: res.description || describeTelegramErrorCode(res.errorCode),
        errorCode: res.errorCode,
      };
    }
    return { ok: true };
  }

  async deleteWebhook(token: string): Promise<{ ok: boolean; error?: string; errorCode?: number }> {
    const res = await this.callApi<boolean>(token, 'deleteWebhook', {});
    if (!res.ok) {
      return {
        ok: false,
        error: res.description || describeTelegramErrorCode(res.errorCode),
        errorCode: res.errorCode,
      };
    }
    return { ok: true };
  }

  async sendTextMessage(
    token: string,
    chatId: string,
    text: string,
    buttons?: Array<{ text: string; callbackData: string }>,
  ): Promise<TelegramSendResult> {
    const cleanText = (text || '').trim();
    if (!cleanText) {
      return { ok: false, error: 'El mensaje está vacío.' };
    }
    const truncated =
      cleanText.length > TELEGRAM_MAX_TEXT_LENGTH
        ? `${cleanText.slice(0, TELEGRAM_MAX_TEXT_LENGTH - 1)}…`
        : cleanText;

    const payload: Record<string, any> = {
      chat_id: String(chatId).trim(),
      text: truncated,
    };

    if (buttons && buttons.length > 0) {
      payload.reply_markup = {
        inline_keyboard: [
          buttons.map((b) => ({
            text: b.text,
            callback_data: b.callbackData,
          })),
        ],
      };
    }

    const res = await this.callApi<any>(token, 'sendMessage', payload, 20_000);
    if (!res.ok || !res.result) {
      return {
        ok: false,
        errorCode: res.errorCode,
        error: res.description || describeTelegramErrorCode(res.errorCode),
        blockedByUser: res.errorCode === 403,
      };
    }

    const msgId = res.result.message_id;
    const resChatId = res.result.chat?.id ?? chatId;
    return {
      ok: true,
      providerMessageId: `tg:${resChatId}:${msgId}`,
      chatId: String(resChatId),
    };
  }

  async sendMedia(
    token: string,
    chatId: string,
    file: TelegramMediaUpload,
    caption?: string,
  ): Promise<TelegramSendResult> {
    const cleanCaption = caption?.trim()
      ? caption.trim().slice(0, TELEGRAM_MAX_CAPTION_LENGTH)
      : undefined;

    const mime = (file.mimeType || '').toLowerCase();
    let method = 'sendDocument';
    let field = 'document';
    if (mime.startsWith('image/') && !mime.includes('svg')) {
      method = 'sendPhoto';
      field = 'photo';
    } else if (mime.startsWith('audio/')) {
      if (mime.includes('ogg') || mime.includes('opus')) {
        method = 'sendVoice';
        field = 'voice';
      } else {
        method = 'sendAudio';
        field = 'audio';
      }
    } else if (mime.startsWith('video/')) {
      method = 'sendVideo';
      field = 'video';
    }

    const form = new FormData();
    form.set('chat_id', String(chatId).trim());
    if (cleanCaption) {
      form.set('caption', cleanCaption);
    }
    const blob = new Blob([new Uint8Array(file.buffer)], {
      type: file.mimeType || 'application/octet-stream',
    });
    form.set(field, blob, file.filename || 'archivo');

    const res = await this.callApi<any>(token, method, form, 60_000);
    if (!res.ok || !res.result) {
      return {
        ok: false,
        errorCode: res.errorCode,
        error: res.description || describeTelegramErrorCode(res.errorCode),
        blockedByUser: res.errorCode === 403,
      };
    }

    const msgId = res.result.message_id;
    const resChatId = res.result.chat?.id ?? chatId;
    return {
      ok: true,
      providerMessageId: `tg:${resChatId}:${msgId}`,
      chatId: String(resChatId),
    };
  }

  async sendTyping(token: string, chatId: string): Promise<boolean> {
    const res = await this.callApi<boolean>(token, 'sendChatAction', {
      chat_id: String(chatId).trim(),
      action: 'typing',
    });
    return Boolean(res.ok);
  }

  async answerCallbackQuery(
    token: string,
    callbackQueryId: string,
    text?: string,
  ): Promise<boolean> {
    const res = await this.callApi<boolean>(token, 'answerCallbackQuery', {
      callback_query_id: callbackQueryId,
      ...(text ? { text } : {}),
    });
    return Boolean(res.ok);
  }

  async downloadFileById(
    token: string,
    fileId: string,
    signal?: AbortSignal,
  ): Promise<{ ok: boolean; buffer?: Buffer; contentType?: string | null; error?: string }> {
    const cleanToken = (token || '').trim();
    if (!isTelegramBotToken(cleanToken)) {
      return { ok: false, error: describeTelegramErrorCode(401) };
    }

    const fileRes = await this.callApi<{ file_id: string; file_path?: string }>(
      cleanToken,
      'getFile',
      { file_id: fileId },
    );
    const filePath = fileRes.result?.file_path;
    if (!fileRes.ok || !filePath || filePath.includes('..')) {
      return {
        ok: false,
        error: fileRes.description || 'No se pudo obtener la ruta del archivo en Telegram.',
      };
    }

    const downloadUrl = `${this.baseUrl}/file/bot${cleanToken}/${filePath}`;
    try {
      const res = await this.fetchImpl(downloadUrl, {
        method: 'GET',
        signal,
      });
      if (!res.ok) {
        return {
          ok: false,
          error: `Error al descargar archivo de Telegram (${res.status})`,
        };
      }
      const arrayBuf = await res.arrayBuffer();
      return {
        ok: true,
        buffer: Buffer.from(arrayBuf),
        contentType: res.headers.get('content-type'),
      };
    } catch {
      return {
        ok: false,
        error: 'Error de red al descargar archivo multimedia de Telegram.',
      };
    }
  }
}
