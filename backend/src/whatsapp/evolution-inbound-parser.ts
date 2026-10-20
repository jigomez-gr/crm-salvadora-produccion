import * as crypto from 'crypto';
import { MessageStatus } from '../common/entities/message.entity';
import { normalizePhoneLoose } from '../common/phone';

export interface ParsedEvolutionInbound {
  externalId: string;
  from: string;
  body: string;
  pushName?: string;
}

export interface ParsedEvolutionStatusUpdate {
  providerMessageId: string;
  status: MessageStatus;
}

/**
 * Validates the `x-evolution-secret` header against the agent's `evolutionWebhookSecret`
 * in fail-closed mode using `crypto.timingSafeEqual` after verifying equal non-zero byte length.
 */
export function verifyEvolutionSecret(
  receivedHeader: string | string[] | undefined,
  expectedSecret: string | null | undefined,
): boolean {
  if (typeof receivedHeader !== 'string' || typeof expectedSecret !== 'string') {
    return false;
  }

  const received = receivedHeader.trim();
  const expected = expectedSecret.trim();
  if (!received || !expected) {
    return false;
  }

  const a = Buffer.from(received, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length === 0 || a.length !== b.length) {
    return false;
  }

  return crypto.timingSafeEqual(a, b);
}

/**
 * Validates that the webhook payload's `instance` matches the agent's configured `evolutionInstanceName`
 * in fail-closed mode.
 */
export function verifyEvolutionInstance(
  payloadInstance: unknown,
  configuredInstanceName: string | null | undefined,
): boolean {
  if (
    typeof payloadInstance !== 'string' ||
    typeof configuredInstanceName !== 'string'
  ) {
    return false;
  }

  const received = payloadInstance.trim();
  const expected = configuredInstanceName.trim();
  if (!received || !expected) {
    return false;
  }

  return received === expected;
}

/**
 * Normalizes Evolution event names across webhook modes (`byEvents: false` vs `byEvents: true`).
 * Examples:
 * - 'MESSAGES_UPSERT' | 'messages.upsert' | 'messages-upsert' -> 'messages.upsert'
 * - 'MESSAGES_UPDATE' | 'messages.update' | 'messages-update' -> 'messages.update'
 * - 'CONNECTION_UPDATE' | 'connection.update' | 'connection-update' -> 'connection.update'
 * - 'QRCODE_UPDATED' | 'qrcode.updated' | 'qrcode-updated' -> 'qrcode.updated'
 */
export function normalizeEvolutionEvent(
  bodyEvent?: unknown,
  routeEvent?: string,
): string {
  const raw =
    typeof bodyEvent === 'string' && bodyEvent.trim().length > 0
      ? bodyEvent.trim()
      : typeof routeEvent === 'string' && routeEvent.trim().length > 0
        ? routeEvent.trim()
        : '';

  return raw.toLowerCase().replace(/[_-]+/g, '.');
}

/**
 * Extracts phone digits from a WhatsApp JID (`34600112233@s.whatsapp.net` or `34600112233:14@s.whatsapp.net`)
 * and normalizes to E.164 (`+34600112233`).
 */
export function extractEvolutionSenderPhone(item: Record<string, any>): string | null {
  const key = item?.key ?? {};
  const remoteJid = typeof key.remoteJid === 'string' ? key.remoteJid.trim() : '';
  const remoteJidAlt =
    typeof key.remoteJidAlt === 'string' ? key.remoteJidAlt.trim() : '';
  const senderPn =
    typeof key.senderPn === 'string' && key.senderPn.trim()
      ? key.senderPn.trim()
      : typeof item?.senderPn === 'string' && item.senderPn.trim()
        ? item.senderPn.trim()
        : '';

  // Prefer standard @s.whatsapp.net / @c.us JIDs over @lid
  const candidates = [remoteJid, remoteJidAlt, senderPn].filter(Boolean);
  let chosen = candidates.find(
    (c) => c.endsWith('@s.whatsapp.net') || c.endsWith('@c.us'),
  );

  if (!chosen) {
    // Fallback to any candidate that is not @lid/@g.us/@broadcast, or remoteJidAlt
    chosen = candidates.find(
      (c) =>
        !c.endsWith('@lid') &&
        !c.endsWith('@g.us') &&
        !c.endsWith('@broadcast') &&
        c !== 'status@broadcast',
    );
  }

  if (!chosen) return null;

  const userPart = chosen.split('@')[0]?.split(':')[0] ?? '';
  const digits = userPart.replace(/\D/g, '');
  if (!digits) return null;

  const normalized = normalizePhoneLoose(`+${digits}`);
  return normalized || null;
}

/**
 * Parses Evolution `MESSAGES_UPSERT` (`messages.upsert`) payload into actionable text messages.
 *
 * Phase 2 scope:
 * - Ignores `key.fromMe === true`
 * - Ignores group messages (`@g.us`), `status@broadcast` / `@broadcast`, `@newsletter`
 * - Ignores protocol / reaction / non-text messages
 * - Ignores history sync (`type === 'append'`)
 * - Supports `message.conversation` and `message.extendedTextMessage.text`
 */
export function parseEvolutionInboundMessages(
  payload: Record<string, any> | null | undefined,
): ParsedEvolutionInbound[] {
  if (!payload || typeof payload !== 'object') return [];

  const data = payload.data;
  if (!data) return [];

  // Never auto-reply to historical sync batches if tagged as 'append'
  if (
    !Array.isArray(data) &&
    typeof data === 'object' &&
    typeof data.type === 'string' &&
    data.type.toLowerCase() === 'append'
  ) {
    return [];
  }

  const rawItems: any[] = Array.isArray(data)
    ? data
    : Array.isArray(data.messages)
      ? data.messages
      : typeof data === 'object'
        ? [data]
        : [];

  const results: ParsedEvolutionInbound[] = [];

  for (const item of rawItems) {
    if (!item || typeof item !== 'object') continue;

    const key = item.key;
    if (!key || typeof key !== 'object') continue;

    // 1. Ignore outbound echoes sent by our own number
    if (key.fromMe === true) continue;

    const remoteJid = typeof key.remoteJid === 'string' ? key.remoteJid.trim() : '';
    const remoteJidAlt =
      typeof key.remoteJidAlt === 'string' ? key.remoteJidAlt.trim() : '';

    // 2. Ignore status@broadcast, broadcast lists, groups (@g.us), newsletters
    if (
      !remoteJid ||
      remoteJid === 'status@broadcast' ||
      remoteJid.endsWith('@broadcast') ||
      remoteJid.endsWith('@g.us') ||
      remoteJid.endsWith('@newsletter') ||
      remoteJidAlt.endsWith('@g.us') ||
      remoteJidAlt === 'status@broadcast'
    ) {
      continue;
    }

    const externalId = typeof key.id === 'string' ? key.id.trim() : '';
    if (!externalId) continue;

    // 3. Unwrap ephemeral / viewOnce wrappers if present, then extract text
    const rawMessage = item.message;
    if (!rawMessage || typeof rawMessage !== 'object') continue;

    const msg =
      rawMessage.ephemeralMessage?.message ??
      rawMessage.viewOnceMessage?.message ??
      rawMessage.viewOnceMessageV2?.message ??
      rawMessage;

    // Ignore protocol / reaction messages
    if (msg.protocolMessage || msg.reactionMessage) {
      continue;
    }

    const textCandidate =
      typeof msg.conversation === 'string'
        ? msg.conversation
        : typeof msg.extendedTextMessage?.text === 'string'
          ? msg.extendedTextMessage.text
          : null;

    if (!textCandidate || !textCandidate.trim()) {
      continue;
    }

    // 4. Resolve sender phone in E.164
    const from = extractEvolutionSenderPhone(item);
    if (!from) continue;

    const pushName =
      typeof item.pushName === 'string' && item.pushName.trim().length > 0
        ? item.pushName.trim()
        : undefined;

    results.push({
      externalId,
      from,
      body: textCandidate.trim(),
      pushName,
    });
  }

  return results;
}

/**
 * Maps an Evolution API v2.3.7 message status value (`renderStatus.ts` / Baileys)
 * to the CRM's `MessageStatus` enum.
 *
 * Verified against Evolution API v2.3.7 `src/utils/renderStatus.ts`:
 * - 0 / 'ERROR'        -> FAILED
 * - 1 / 'PENDING'      -> null (intermediate)
 * - 2 / 'SERVER_ACK'   -> SENT
 * - 3 / 'DELIVERY_ACK' -> DELIVERED
 * - 4 / 'READ'         -> READ
 * - 5 / 'PLAYED'       -> READ
 */
export function mapEvolutionMessageStatus(rawStatus: unknown): MessageStatus | null {
  if (typeof rawStatus === 'number') {
    switch (rawStatus) {
      case 0:
        return MessageStatus.FAILED;
      case 2:
        return MessageStatus.SENT;
      case 3:
        return MessageStatus.DELIVERED;
      case 4:
      case 5:
        return MessageStatus.READ;
      default:
        return null;
    }
  }

  if (typeof rawStatus === 'string') {
    const normalized = rawStatus.trim().toUpperCase();
    switch (normalized) {
      case 'ERROR':
      case 'FAILED':
      case 'UNDELIVERED':
      case '0':
        return MessageStatus.FAILED;
      case 'SERVER_ACK':
      case 'SENT':
      case '2':
        return MessageStatus.SENT;
      case 'DELIVERY_ACK':
      case 'DELIVERED':
      case '3':
        return MessageStatus.DELIVERED;
      case 'READ':
      case 'PLAYED':
      case '4':
      case '5':
        return MessageStatus.READ;
      default:
        return null;
    }
  }

  return null;
}

/**
 * Parses Evolution `MESSAGES_UPDATE` (`messages.update`) webhook payload into
 * status updates correlated by `providerMessageId`.
 */
export function parseEvolutionStatusUpdates(
  payload: Record<string, any> | null | undefined,
): ParsedEvolutionStatusUpdate[] {
  if (!payload || typeof payload !== 'object') return [];
  const data = payload.data;
  if (!data) return [];

  const rawItems: any[] = Array.isArray(data)
    ? data
    : typeof data === 'object'
      ? [data]
      : [];

  const updates: ParsedEvolutionStatusUpdate[] = [];

  for (const item of rawItems) {
    if (!item || typeof item !== 'object') continue;

    const providerMessageId =
      (typeof item.keyId === 'string' && item.keyId.trim()) ||
      (typeof item.key?.id === 'string' && item.key.id.trim()) ||
      (typeof item.id === 'string' && item.id.trim()) ||
      '';

    if (!providerMessageId) continue;

    const rawStatus = item.status ?? item.update?.status;
    const mapped = mapEvolutionMessageStatus(rawStatus);
    if (!mapped) continue;

    updates.push({
      providerMessageId,
      status: mapped,
    });
  }

  return updates;
}
