import * as crypto from 'crypto';
import { MediaType } from '../common/entities/message.entity';

export const TELEGRAM_SECRET_HEADER = 'x-telegram-bot-api-secret-token';
export const TELEGRAM_TOKEN_REGEX = /^\d{1,20}:[A-Za-z0-9_-]{20,200}$/;
export const TELEGRAM_SECRET_REGEX = /^[A-Za-z0-9_-]{1,256}$/;

/**
 * Check whether a string looks like a valid Telegram Bot API token from @BotFather.
 */
export function isTelegramBotToken(token?: string | null): boolean {
  if (!token || typeof token !== 'string') return false;
  return TELEGRAM_TOKEN_REGEX.test(token.trim());
}

/**
 * Constant-time, fail-closed verification of Telegram's `X-Telegram-Bot-Api-Secret-Token` header.
 * Rejects (false) if no expected secret is configured or if the header is missing/mismatched.
 */
export function verifyTelegramWebhookSecret(
  headerValue?: string | null,
  expectedSecret?: string | null,
): boolean {
  if (!expectedSecret || typeof expectedSecret !== 'string' || !expectedSecret.trim()) {
    return false;
  }
  if (!headerValue || typeof headerValue !== 'string' || !headerValue.trim()) {
    return false;
  }
  const a = Buffer.from(headerValue.trim(), 'utf8');
  const b = Buffer.from(expectedSecret.trim(), 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export interface TelegramSenderIdentity {
  userId: string;
  chatId: string;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  displayName: string;
}

export interface ParsedTelegramMedia {
  mediaType: MediaType;
  fileId: string;
  mimeType: string | null;
  filename: string | null;
  fileSize?: number;
}

export interface ParsedTelegramUpdate {
  updateId: number;
  kind: 'message' | 'callback_query' | 'block_status' | 'ignored';
  externalId?: string;
  sender?: TelegramSenderIdentity;
  body?: string;
  agentPrompt?: string;
  media?: ParsedTelegramMedia | null;
  /** Extracted token when the user sends `/start <token>` (or empty string on bare `/start`). */
  startToken?: string | null;
  isStartCommand?: boolean;
  isUnlinkCommand?: boolean;
  /** True when the user shared their own phone number via Telegram's native contact card. */
  sharedPhone?: string | null;
  callbackQueryId?: string;
  callbackData?: string;
  blockStatus?: {
    userId: string;
    chatId: string;
    blocked: boolean;
  };
}

/**
 * Pure parser for inbound Telegram Bot API updates.
 * Only processes private 1:1 chats from human users (ignores groups, channels, and other bots).
 */
export function parseTelegramUpdate(raw: unknown): ParsedTelegramUpdate | null {
  if (!raw || typeof raw !== 'object') return null;
  const u = raw as Record<string, any>;
  if (typeof u.update_id !== 'number') return null;

  const updateId = u.update_id;

  // 1. User blocked or unblocked the bot (my_chat_member)
  if (u.my_chat_member && typeof u.my_chat_member === 'object') {
    const mcm = u.my_chat_member;
    const chat = mcm.chat;
    const from = mcm.from;
    const newStatus = mcm.new_chat_member?.status;
    if (
      chat?.type === 'private' &&
      from &&
      !from.is_bot &&
      (newStatus === 'kicked' || newStatus === 'left' || newStatus === 'member')
    ) {
      return {
        updateId,
        kind: 'block_status',
        blockStatus: {
          userId: String(from.id),
          chatId: String(chat.id),
          blocked: newStatus !== 'member',
        },
      };
    }
    return { updateId, kind: 'ignored' };
  }

  // 2. Callback query (inline button tap)
  if (u.callback_query && typeof u.callback_query === 'object') {
    const cb = u.callback_query;
    const from = cb.from;
    const msg = cb.message;
    if (!from || from.is_bot || !msg?.chat || msg.chat.type !== 'private') {
      return {
        updateId,
        kind: 'callback_query',
        callbackQueryId: cb.id ? String(cb.id) : undefined,
      };
    }
    const sender = buildSender(from, msg.chat);
    const dataStr = typeof cb.data === 'string' ? cb.data.trim() : '';
    return {
      updateId,
      kind: 'callback_query',
      callbackQueryId: String(cb.id),
      callbackData: dataStr,
      externalId: `tg:cb:${cb.id}`,
      sender,
      body: dataStr,
      agentPrompt: dataStr,
    };
  }

  // 3. Standard message in a private chat
  const msg = u.message;
  if (!msg || typeof msg !== 'object') {
    return { updateId, kind: 'ignored' };
  }
  const chat = msg.chat;
  const from = msg.from;
  if (!chat || chat.type !== 'private' || !from || from.is_bot) {
    return { updateId, kind: 'ignored' };
  }

  const sender = buildSender(from, chat);
  const externalId = `tg:${chat.id}:${msg.message_id}`;
  const rawText = typeof msg.text === 'string' ? msg.text.trim() : '';
  const caption = typeof msg.caption === 'string' ? msg.caption.trim() : '';

  // Check for /start or /start <TOKEN>
  if (/^\/start(?:\s+(.+))?$/i.test(rawText)) {
    const match = rawText.match(/^\/start(?:\s+(.+))?$/i);
    const token = match?.[1]?.trim() || null;
    return {
      updateId,
      kind: 'message',
      externalId,
      sender,
      isStartCommand: true,
      startToken: token,
      body: token ? '/start (Conexión desde la web)' : '/start',
      agentPrompt:
        'Hola, acabo de iniciar el chat con el bot de Telegram del Centro de Yoga y Bienestar Salvadora Conesa.',
      media: null,
    };
  }

  // Check for /desvincular or /unlink
  if (/^\/(desvincular|unlink)(?:\s|$)/i.test(rawText)) {
    return {
      updateId,
      kind: 'message',
      externalId,
      sender,
      isUnlinkCommand: true,
      body: rawText,
      agentPrompt: rawText,
      media: null,
    };
  }

  // Check if user shared their own phone contact card
  if (msg.contact && typeof msg.contact === 'object' && msg.contact.phone_number) {
    const sharedUserId = msg.contact.user_id ? String(msg.contact.user_id) : null;
    // Only trust the contact card as the sender's own phone if user_id matches from.id
    const isOwnPhone = !sharedUserId || sharedUserId === sender.userId;
    const phone = String(msg.contact.phone_number).trim();
    return {
      updateId,
      kind: 'message',
      externalId,
      sender,
      sharedPhone: isOwnPhone ? phone : null,
      body: `📱 Contacto compartido: ${phone}`,
      agentPrompt: isOwnPhone
        ? `Mi número de teléfono móvil es ${phone} y mi nombre es ${sender.displayName}.`
        : `He compartido el teléfono ${phone}.`,
      media: null,
    };
  }

  // Photo (array of PhotoSize — pick the largest)
  if (Array.isArray(msg.photo) && msg.photo.length > 0) {
    const largest = pickLargestPhoto(msg.photo);
    if (largest?.file_id) {
      return {
        updateId,
        kind: 'message',
        externalId,
        sender,
        body: caption || '📷 Imagen',
        agentPrompt: caption
          ? `[El cliente ha enviado una imagen con el comentario: "${caption}"]`
          : '[El cliente ha enviado una imagen por Telegram]',
        media: {
          mediaType: MediaType.IMAGE,
          fileId: String(largest.file_id),
          mimeType: 'image/jpeg',
          filename: 'imagen.jpg',
          fileSize: largest.file_size,
        },
      };
    }
  }

  // Voice note
  if (msg.voice && typeof msg.voice === 'object' && msg.voice.file_id) {
    return {
      updateId,
      kind: 'message',
      externalId,
      sender,
      body: caption || '🎤 Mensaje de voz',
      agentPrompt: caption
        ? `[El cliente ha enviado una nota de voz con comentario: "${caption}"]`
        : '[El cliente ha enviado una nota de voz por Telegram]',
      media: {
        mediaType: MediaType.AUDIO,
        fileId: String(msg.voice.file_id),
        mimeType: msg.voice.mime_type || 'audio/ogg',
        filename: 'nota_voz.ogg',
        fileSize: msg.voice.file_size,
      },
    };
  }

  // Audio file
  if (msg.audio && typeof msg.audio === 'object' && msg.audio.file_id) {
    return {
      updateId,
      kind: 'message',
      externalId,
      sender,
      body: caption || '🎤 Mensaje de voz',
      agentPrompt: caption
        ? `[El cliente ha enviado un archivo de audio: "${caption}"]`
        : '[El cliente ha enviado un archivo de audio por Telegram]',
      media: {
        mediaType: MediaType.AUDIO,
        fileId: String(msg.audio.file_id),
        mimeType: msg.audio.mime_type || 'audio/mpeg',
        filename: msg.audio.file_name || 'audio.mp3',
        fileSize: msg.audio.file_size,
      },
    };
  }

  // Video
  if (msg.video && typeof msg.video === 'object' && msg.video.file_id) {
    return {
      updateId,
      kind: 'message',
      externalId,
      sender,
      body: caption || '🎬 Vídeo',
      agentPrompt: caption
        ? `[El cliente ha enviado un vídeo: "${caption}"]`
        : '[El cliente ha enviado un vídeo por Telegram]',
      media: {
        mediaType: MediaType.VIDEO,
        fileId: String(msg.video.file_id),
        mimeType: msg.video.mime_type || 'video/mp4',
        filename: msg.video.file_name || 'video.mp4',
        fileSize: msg.video.file_size,
      },
    };
  }

  // Video note (circular instant video message / videomensaje redondo)
  if (msg.video_note && typeof msg.video_note === 'object' && msg.video_note.file_id) {
    return {
      updateId,
      kind: 'message',
      externalId,
      sender,
      body: caption || '📹 Mensaje de vídeo',
      agentPrompt: caption
        ? `[El cliente ha enviado un videomensaje con comentario: "${caption}"]`
        : '[El cliente ha enviado un videomensaje por Telegram]',
      media: {
        mediaType: MediaType.VIDEO,
        fileId: String(msg.video_note.file_id),
        mimeType: 'video/mp4',
        filename: 'video_nota.mp4',
        fileSize: msg.video_note.file_size,
      },
    };
  }

  // Document
  if (msg.document && typeof msg.document === 'object' && msg.document.file_id) {
    const filename = msg.document.file_name || 'documento';
    return {
      updateId,
      kind: 'message',
      externalId,
      sender,
      body: caption || `📄 ${filename}`,
      agentPrompt: caption
        ? `[El cliente ha enviado un documento (${filename}): "${caption}"]`
        : `[El cliente ha enviado un documento adjunto (${filename}) por Telegram]`,
      media: {
        mediaType: MediaType.DOCUMENT,
        fileId: String(msg.document.file_id),
        mimeType: msg.document.mime_type || 'application/octet-stream',
        filename,
        fileSize: msg.document.file_size,
      },
    };
  }

  // Sticker
  if (msg.sticker && typeof msg.sticker === 'object' && msg.sticker.file_id) {
    return {
      updateId,
      kind: 'message',
      externalId,
      sender,
      body: '💟 Sticker',
      agentPrompt: '[El cliente ha enviado un sticker]',
      media: {
        mediaType: MediaType.STICKER,
        fileId: String(msg.sticker.file_id),
        mimeType: 'image/webp',
        filename: 'sticker.webp',
        fileSize: msg.sticker.file_size,
      },
    };
  }

  // Plain text
  if (rawText) {
    return {
      updateId,
      kind: 'message',
      externalId,
      sender,
      body: rawText,
      agentPrompt: rawText,
      media: null,
    };
  }

  return { updateId, kind: 'ignored' };
}

function buildSender(from: Record<string, any>, chat: Record<string, any>): TelegramSenderIdentity {
  const firstName = typeof from.first_name === 'string' ? from.first_name.trim() || null : null;
  const lastName = typeof from.last_name === 'string' ? from.last_name.trim() || null : null;
  const username = typeof from.username === 'string' ? from.username.trim().replace(/^@/, '') || null : null;
  const fullName = [firstName, lastName].filter(Boolean).join(' ').trim();
  const displayName = fullName || (username ? `@${username}` : `Telegram ${from.id}`);
  return {
    userId: String(from.id),
    chatId: String(chat.id),
    username,
    firstName,
    lastName,
    displayName,
  };
}

function pickLargestPhoto(photos: any[]): any {
  return photos.reduce((best, curr) => {
    if (!best) return curr;
    const areaBest = best.file_size ?? (best.width || 0) * (best.height || 0);
    const areaCurr = curr.file_size ?? (curr.width || 0) * (curr.height || 0);
    return areaCurr >= areaBest ? curr : best;
  }, null);
}
