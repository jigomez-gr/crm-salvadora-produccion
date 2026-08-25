import { parseInboundMessage } from './inbound-parser';
import { MediaType } from '../common/entities/message.entity';

describe('parseInboundMessage', () => {
  const base = { id: 'wamid.ABC', from: '+34611200301' };

  it('returns null for missing payload / sender / id', () => {
    expect(parseInboundMessage(null)).toBeNull();
    expect(parseInboundMessage(undefined)).toBeNull();
    expect(parseInboundMessage({ from: '+34', type: 'text' })).toBeNull(); // no id
    expect(parseInboundMessage({ id: 'x', type: 'text' })).toBeNull(); // no from
  });

  it('parses a plain text message', () => {
    const r = parseInboundMessage({
      ...base,
      type: 'text',
      text: { body: 'Hola, quiero una cita' },
    });
    expect(r).toEqual({
      externalId: 'wamid.ABC',
      from: '+34611200301',
      body: 'Hola, quiero una cita',
      agentPrompt: 'Hola, quiero una cita',
      media: null,
    });
  });

  it('drops an empty text message (no body)', () => {
    expect(
      parseInboundMessage({ ...base, type: 'text', text: { body: '' } }),
    ).toBeNull();
    expect(parseInboundMessage({ ...base, type: 'text' })).toBeNull();
  });

  it('parses an image with a caption (caption is the preview + agent text)', () => {
    const r = parseInboundMessage({
      ...base,
      type: 'image',
      image: {
        id: 'media-1',
        link: 'https://cdn.ycloud.com/x.jpg',
        mimeType: 'image/jpeg',
        caption: '¿Es esto normal?',
      },
    });
    expect(r?.body).toBe('¿Es esto normal?');
    expect(r?.agentPrompt).toContain('una imagen');
    expect(r?.agentPrompt).toContain('¿Es esto normal?');
    expect(r?.media).toEqual({
      type: MediaType.IMAGE,
      url: 'https://cdn.ycloud.com/x.jpg',
      mediaId: 'media-1',
      mimeType: 'image/jpeg',
      filename: null,
    });
  });

  it('uses an emoji placeholder for media without a caption', () => {
    const r = parseInboundMessage({
      ...base,
      type: 'image',
      image: { id: 'm', link: 'https://x/y.jpg', mimeType: 'image/jpeg' },
    });
    expect(r?.body).toBe('📷 Imagen');
    expect(r?.agentPrompt).toContain('no puedes verlo');
  });

  it('folds voice notes into AUDIO', () => {
    const r = parseInboundMessage({
      ...base,
      type: 'voice',
      voice: { id: 'v', link: 'https://x/a.ogg', mimeType: 'audio/ogg' },
    });
    expect(r?.media?.type).toBe(MediaType.AUDIO);
    expect(r?.body).toBe('🎤 Mensaje de voz');
  });

  it('parses a document and prefers the filename as preview', () => {
    const r = parseInboundMessage({
      ...base,
      type: 'document',
      document: {
        id: 'd',
        link: 'https://x/informe.pdf',
        mimeType: 'application/pdf',
        filename: 'informe.pdf',
      },
    });
    expect(r?.body).toBe('📄 informe.pdf');
    expect(r?.media).toEqual({
      type: MediaType.DOCUMENT,
      url: 'https://x/informe.pdf',
      mediaId: 'd',
      mimeType: 'application/pdf',
      filename: 'informe.pdf',
    });
  });

  it('parses a sticker (no caption, no filename)', () => {
    const r = parseInboundMessage({
      ...base,
      type: 'sticker',
      sticker: { id: 's', link: 'https://x/s.webp', mimeType: 'image/webp' },
    });
    expect(r?.media?.type).toBe(MediaType.STICKER);
    expect(r?.body).toBe('💟 Sticker');
  });

  it('falls back to snake_case mime_type and url fields', () => {
    const r = parseInboundMessage({
      ...base,
      type: 'video',
      video: { id: 'vid', url: 'https://x/v.mp4', mime_type: 'video/mp4' },
    });
    expect(r?.media?.mimeType).toBe('video/mp4');
    expect(r?.media?.url).toBe('https://x/v.mp4');
  });

  it('records media even when the link is absent (id-only fallback)', () => {
    const r = parseInboundMessage({
      ...base,
      type: 'image',
      image: { id: 'only-id', mimeType: 'image/jpeg' },
    });
    expect(r?.media?.url).toBeNull();
    expect(r?.media?.mediaId).toBe('only-id');
  });

  it('summarizes a location message (no media)', () => {
    const r = parseInboundMessage({
      ...base,
      type: 'location',
      location: { latitude: 40.4, longitude: -3.7, name: 'Clínica', address: 'Calle X' },
    });
    expect(r?.media).toBeNull();
    expect(r?.body).toBe('📍 Ubicación: Clínica · Calle X');
    expect(r?.agentPrompt).toContain('ubicación');
  });

  it('records an unsupported type generically instead of dropping it', () => {
    const r = parseInboundMessage({ ...base, type: 'interactive', interactive: {} });
    expect(r?.media).toBeNull();
    expect(r?.body).toBe('📎 Mensaje recibido');
    expect(r?.agentPrompt).toContain('formato no compatible');
  });
});
