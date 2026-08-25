import { MediaType } from '../common/entities/message.entity';

/**
 * Pure parsing of a YCloud `whatsappInboundMessage` into the fields we persist.
 *
 * Kept free of NestJS/DB/I-O so it can be exhaustively unit-tested — the YCloud
 * payload shape is the part most likely to surprise us, and we can't exercise it
 * with real WhatsApp media in CI. Mirrors the "pure core" pattern used by
 * `reminders/reminder-selection.ts`.
 *
 * Design:
 * - `body` is what we STORE + show in the inbox + use as the last-message
 *   preview: the caption if the customer wrote one, otherwise a short localized
 *   placeholder (so a bare photo still reads as "📷 Imagen", never blank).
 * - `agentPrompt` is what the LLM reads. For media we hand it a plain-Spanish
 *   note ("[El cliente ha enviado una imagen...]") since it can't see the file —
 *   this keeps replies sane instead of the model parsing an emoji placeholder.
 * - `media` carries the YCloud reference (link + id + mime + filename). The bytes
 *   are never downloaded here; the proxy streams them on demand.
 *
 * Returns `null` when there's nothing actionable (no sender / no id).
 */

export interface InboundMedia {
  type: MediaType;
  /** YCloud-hosted media link, if the payload included one. */
  url: string | null;
  /** YCloud media id — fallback reference if a link is absent. */
  mediaId: string | null;
  mimeType: string | null;
  /** Original filename (documents). */
  filename: string | null;
}

export interface ParsedInbound {
  externalId: string;
  from: string;
  /** Stored + previewed text (caption or a localized placeholder). */
  body: string;
  /** What the agent/LLM reads (a description for media; same as body for text). */
  agentPrompt: string;
  /** Attached media, or null for plain text / non-media messages. */
  media: InboundMedia | null;
}

// WhatsApp media `type` → our MediaType. `voice` is WhatsApp's voice-note variant
// of audio; we fold it into AUDIO.
const MEDIA_KINDS: Record<string, MediaType> = {
  image: MediaType.IMAGE,
  audio: MediaType.AUDIO,
  voice: MediaType.AUDIO,
  video: MediaType.VIDEO,
  document: MediaType.DOCUMENT,
  sticker: MediaType.STICKER,
};

// Localized placeholder shown when media arrives without a caption.
const PLACEHOLDER: Record<MediaType, string> = {
  [MediaType.IMAGE]: '📷 Imagen',
  [MediaType.AUDIO]: '🎤 Mensaje de voz',
  [MediaType.VIDEO]: '🎬 Vídeo',
  [MediaType.DOCUMENT]: '📄 Documento',
  [MediaType.STICKER]: '💟 Sticker',
};

// Plain-Spanish description handed to the LLM (which can't see the media).
const AGENT_NOUN: Record<MediaType, string> = {
  [MediaType.IMAGE]: 'una imagen',
  [MediaType.AUDIO]: 'un mensaje de voz',
  [MediaType.VIDEO]: 'un vídeo',
  [MediaType.DOCUMENT]: 'un documento',
  [MediaType.STICKER]: 'un sticker',
};

function str(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}

export function parseInboundMessage(
  inboundMsg: Record<string, any> | null | undefined,
): ParsedInbound | null {
  if (!inboundMsg) return null;

  const from = str(inboundMsg.from);
  const externalId = str(inboundMsg.id);
  if (!from || !externalId) return null;

  const type = str(inboundMsg.type) ?? 'text';

  // ─── Plain text ───
  if (type === 'text') {
    const body = str(inboundMsg.text?.body);
    if (!body) return null; // nothing to record
    return { externalId, from, body, agentPrompt: body, media: null };
  }

  // ─── Media (image / audio / voice / video / document / sticker) ───
  const mediaType = MEDIA_KINDS[type];
  if (mediaType) {
    const payload = inboundMsg[type] ?? {};
    const caption = str(payload.caption);
    const filename = str(payload.filename);
    const media: InboundMedia = {
      type: mediaType,
      url: str(payload.link) ?? str(payload.url),
      mediaId: str(payload.id),
      mimeType: str(payload.mimeType) ?? str(payload.mime_type),
      filename,
    };

    // Preview: caption → filename (documents) → emoji placeholder.
    const body = caption ?? (mediaType === MediaType.DOCUMENT && filename
      ? `📄 ${filename}`
      : PLACEHOLDER[mediaType]);

    // Agent note: tell the model what arrived so it replies sensibly.
    const agentPrompt = caption
      ? `[El cliente ha enviado ${AGENT_NOUN[mediaType]} con el texto: "${caption}"]`
      : `[El cliente ha enviado ${AGENT_NOUN[mediaType]} (no puedes verlo). Pídele que lo describa por escrito si necesitas la información.]`;

    return { externalId, from, body, agentPrompt, media };
  }

  // ─── Location ───
  if (type === 'location') {
    const loc = inboundMsg.location ?? {};
    const name = str(loc.name);
    const address = str(loc.address);
    const label = [name, address].filter(Boolean).join(' · ');
    const body = label ? `📍 Ubicación: ${label}` : '📍 Ubicación';
    return {
      externalId,
      from,
      body,
      agentPrompt: `[El cliente ha enviado una ubicación${label ? `: ${label}` : ''}.]`,
      media: null,
    };
  }

  // ─── Anything else (contacts / interactive / button / reaction / unknown) ───
  // Never silently drop an inbound message — record a generic note so the
  // operator sees it arrived and the agent can ask the customer to rephrase.
  return {
    externalId,
    from,
    body: '📎 Mensaje recibido',
    agentPrompt:
      '[El cliente ha enviado un mensaje en un formato no compatible. Pídele que escriba su consulta en texto.]',
    media: null,
  };
}
