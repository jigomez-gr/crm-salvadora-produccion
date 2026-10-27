import { Injectable, Logger, Optional } from '@nestjs/common';
import { AgentConfig } from '../common/entities/agent-config.entity';
import { MediaType } from '../common/entities/message.entity';
import { InboundMedia } from './inbound-parser';
import { YCloudProvider } from './providers/ycloud.provider';
import { EvolutionProvider } from './providers/evolution.provider';
import { MetaProvider } from './providers/meta.provider';
import { extractText } from '../knowledge/knowledge-extractor';

export interface ProcessedMediaResult {
  enrichedBody: string;
  enrichedAgentPrompt: string;
  isOverLimit?: boolean;
  transcription?: string;
  extractedText?: string;
}

const DEFAULT_LIMIT_MB = 100;
const MAX_PROMPT_DOC_CHARS = 12_000;

@Injectable()
export class InboundMediaProcessorService {
  private readonly logger = new Logger(InboundMediaProcessorService.name);

  constructor(
    @Optional() private readonly ycloudProvider?: YCloudProvider,
    @Optional() private readonly evolutionProvider?: EvolutionProvider,
    @Optional() private readonly metaProvider?: MetaProvider,
  ) {}

  /**
   * Processes an incoming WhatsApp media attachment across any provider (YCloud, Evolution, Meta).
   * Validates size limits, extracts document text (PDF, DOCX, XLSX, etc.), transcribes audio/voice notes,
   * and builds conversational prompts for the agent.
   */
  async processMedia(
    provider: 'ycloud' | 'evolution' | 'meta',
    media: InboundMedia,
    config?: AgentConfig | null,
    caption?: string | null,
  ): Promise<ProcessedMediaResult> {
    try {
      // 1. Download binary buffer from provider
      const mediaBuffer = await this.downloadMediaBuffer(provider, media, config);

      if (!mediaBuffer || mediaBuffer.length === 0) {
        this.logger.warn(`Could not retrieve media buffer for ${media.type} (${media.filename || media.mediaId})`);
        return this.buildFallbackResult(media, caption);
      }

      const sizeMb = mediaBuffer.length / (1024 * 1024);

      // 2. Size limit checks per media type
      const limitMb = this.getLimitForMediaType(media.type, config);
      if (sizeMb > limitMb) {
        const roundedSize = Math.round(sizeMb * 10) / 10;
        this.logger.warn(
          `Inbound media ${media.type} rejected: size ${roundedSize} MB exceeds agent limit of ${limitMb} MB`,
        );
        return {
          isOverLimit: true,
          enrichedBody: `⚠️ Archivo de ${this.getCategoryLabel(media.type)} (${roundedSize} MB) supera el límite de ${limitMb} MB`,
          enrichedAgentPrompt: `[El cliente ha enviado un archivo de ${this.getCategoryLabel(media.type)} (${roundedSize} MB) que supera el límite máximo permitido de ${limitMb} MB configurado para este centro. Explícale amablemente y con cortesía que el archivo supera el límite de ${limitMb} MB y pídele si te puede enviar un resumen o el archivo en menor tamaño.]`,
        };
      }

      // 3. Process according to media type
      if (media.type === MediaType.DOCUMENT) {
        return await this.processDocument(mediaBuffer, media, caption);
      }

      if (media.type === MediaType.AUDIO) {
        return await this.processAudio(mediaBuffer, media, config);
      }

      if (media.type === MediaType.VIDEO) {
        return this.processVideo(media, caption, sizeMb);
      }

      if (media.type === MediaType.IMAGE) {
        const body = caption ? caption : '📷 Imagen';
        const prompt = caption
          ? `[El cliente ha enviado una imagen con el texto: "${caption}"]`
          : '[El cliente ha enviado una imagen]';
        return { enrichedBody: body, enrichedAgentPrompt: prompt };
      }

      return this.buildFallbackResult(media, caption);
    } catch (err: any) {
      this.logger.error(`Error processing inbound media (${media.type}): ${err?.message || err}`, err.stack);
      return this.buildFallbackResult(media, caption);
    }
  }

  private getLimitForMediaType(type: MediaType, config?: AgentConfig | null): number {
    if (!config) return DEFAULT_LIMIT_MB;
    switch (type) {
      case MediaType.AUDIO:
        return config.maxAudioSizeMb ?? DEFAULT_LIMIT_MB;
      case MediaType.DOCUMENT:
        return config.maxDocSizeMb ?? DEFAULT_LIMIT_MB;
      case MediaType.VIDEO:
        return config.maxVideoSizeMb ?? DEFAULT_LIMIT_MB;
      default:
        return DEFAULT_LIMIT_MB;
    }
  }

  private getCategoryLabel(type: MediaType): string {
    switch (type) {
      case MediaType.AUDIO:
        return 'audio/voz';
      case MediaType.DOCUMENT:
        return 'documento';
      case MediaType.VIDEO:
        return 'vídeo';
      case MediaType.IMAGE:
        return 'imagen';
      default:
        return 'archivo multimedia';
    }
  }

  private async downloadMediaBuffer(
    provider: 'ycloud' | 'evolution' | 'meta',
    media: InboundMedia,
    config?: AgentConfig | null,
  ): Promise<Buffer | null> {
    // A. Base64 directly provided in webhook (common in Evolution or attachments)
    if (media.base64) {
      const clean = media.base64.replace(/^data:.*?;base64,/, '');
      return Buffer.from(clean, 'base64');
    }

    // B. Evolution API
    if (provider === 'evolution') {
      if (this.evolutionProvider && media.rawPayload?.message) {
        const result = await this.evolutionProvider.fetchMediaBase64(config, media.rawPayload.message);
        if (result?.buffer) return result.buffer;
      }
      if (media.url && this.evolutionProvider) {
        const res = await this.evolutionProvider.fetchInboundMedia({ config, mediaUrl: media.url });
        return res.buffer;
      }
    }

    // C. YCloud
    if (provider === 'ycloud' && media.url && this.ycloudProvider) {
      const res = await this.ycloudProvider.fetchInboundMedia({ config, mediaUrl: media.url });
      return res.buffer;
    }

    // D. Meta WhatsApp Cloud API
    if (provider === 'meta' && this.metaProvider) {
      const targetUrl = media.url || media.mediaId;
      if (targetUrl) {
        const res = await this.metaProvider.fetchInboundMedia({ config, mediaUrl: targetUrl });
        return res.buffer;
      }
    }

    // E. Generic HTTP fetch fallback if an absolute public URL was supplied
    if (media.url && /^https?:\/\//i.test(media.url)) {
      const response = await fetch(media.url, { signal: AbortSignal.timeout(30_000) });
      if (response.ok) {
        return Buffer.from(await response.arrayBuffer());
      }
    }

    return null;
  }

  private async processDocument(
    buffer: Buffer,
    media: InboundMedia,
    caption?: string | null,
  ): Promise<ProcessedMediaResult> {
    const filename = media.filename || 'documento.pdf';
    try {
      const extraction = await extractText(buffer, filename);
      let content = (extraction.text || '').trim();

      if (!content) {
        const body = caption || `📄 ${filename}`;
        const prompt = `[El cliente ha enviado el documento "${filename}"${caption ? ` con el texto: "${caption}"` : ''}, pero no contiene texto legible directamente (puede tratarse de una imagen escaneada).]`;
        return { enrichedBody: body, enrichedAgentPrompt: prompt };
      }

      const truncated = content.length > MAX_PROMPT_DOC_CHARS;
      if (truncated) {
        content = content.slice(0, MAX_PROMPT_DOC_CHARS) + '\n... [Documento extenso, texto truncado para el contexto]';
      }

      const body = caption ? `${caption} (📄 ${filename})` : `📄 ${filename}`;
      const prompt = `[El cliente ha adjuntado el documento "${filename}"${caption ? ` con el mensaje: "${caption}"` : ''}.\nContenido extraído del documento:\n"""\n${content}\n"""]`;

      return {
        enrichedBody: body,
        enrichedAgentPrompt: prompt,
        extractedText: content,
      };
    } catch (err: any) {
      this.logger.warn(`Could not extract text from document ${filename}: ${err?.message || err}`);
      const body = caption || `📄 ${filename}`;
      const prompt = `[El cliente ha enviado el documento "${filename}"${caption ? ` con el texto: "${caption}"` : ''}. No se ha podido extraer texto automáticamente del archivo.]`;
      return { enrichedBody: body, enrichedAgentPrompt: prompt };
    }
  }

  private async processAudio(
    buffer: Buffer,
    media: InboundMedia,
    config?: AgentConfig | null,
  ): Promise<ProcessedMediaResult> {
    const filename = media.filename || 'audio.ogg';
    const mimeType = media.mimeType || 'audio/ogg';

    const transcription = await this.transcribeAudio(buffer, filename, mimeType, config);

    if (transcription && transcription.trim()) {
      const cleanTranscription = transcription.trim();
      const preview =
        cleanTranscription.length > 80
          ? `${cleanTranscription.slice(0, 77)}...`
          : cleanTranscription;

      return {
        enrichedBody: `🎤 Audio: "${preview}"`,
        enrichedAgentPrompt: `[Mensaje de voz / audio enviado por el cliente ("${filename}"). Transcripción exacta del audio:\n"${cleanTranscription}"]`,
        transcription: cleanTranscription,
      };
    }

    return {
      enrichedBody: '🎤 Mensaje de voz',
      enrichedAgentPrompt: `[El cliente ha enviado un mensaje de voz o audio ("${filename}"). No se pudo transcribir de forma automática. Responde saludándole amablemente y pídele si te puede resumir o detallar su consulta por escrito.]`,
    };
  }

  private processVideo(
    media: InboundMedia,
    caption?: string | null,
    sizeMb?: number,
  ): ProcessedMediaResult {
    const filename = media.filename || 'video.mp4';
    const roundedSize = sizeMb ? ` (${Math.round(sizeMb * 10) / 10} MB)` : '';
    const body = caption ? `${caption} (🎬 Vídeo${roundedSize})` : `🎬 Vídeo: ${filename}${roundedSize}`;
    const prompt = caption
      ? `[El cliente ha enviado un vídeo ("${filename}"${roundedSize}) con el comentario: "${caption}". Acoge su consulta y responde a lo que indica.]`
      : `[El cliente ha enviado un archivo de vídeo ("${filename}"${roundedSize}). Explícale que has recibido su vídeo y pregúntale con amabilidad en qué puedes ayudarle o si desea información de alguna actividad o consulta.]`;

    return { enrichedBody: body, enrichedAgentPrompt: prompt };
  }

  private buildFallbackResult(media: InboundMedia, caption?: string | null): ProcessedMediaResult {
    const filename = media.filename;
    let label = 'archivo multimedia';
    if (media.type === MediaType.AUDIO) label = 'mensaje de voz / audio';
    if (media.type === MediaType.DOCUMENT) label = `documento ${filename || ''}`.trim();
    if (media.type === MediaType.VIDEO) label = `vídeo ${filename || ''}`.trim();
    if (media.type === MediaType.IMAGE) label = 'imagen';

    const body = caption || `📎 ${filename || label}`;
    const prompt = caption
      ? `[El cliente ha enviado un ${label} con el texto: "${caption}"]`
      : `[El cliente ha enviado un ${label}. Pídele amablemente si te puede resumir o indicar su consulta por escrito para atenderle.]`;

    return { enrichedBody: body, enrichedAgentPrompt: prompt };
  }

  /**
   * Multi-provider audio transcription: Groq Whisper, OpenAI Whisper, Deepgram, or OpenRouter Multimodal.
   */
  async transcribeAudio(
    buffer: Buffer,
    filename: string,
    mimeType: string,
    config?: AgentConfig | null,
  ): Promise<string | null> {
    const chosenProvider = (config?.transcriptionProvider || 'auto').toLowerCase();
    const apiKey = config?.transcriptionApiKey || null;

    // 1. Groq Whisper (lightning fast & high accuracy)
    const groqKey = chosenProvider === 'groq' ? (apiKey || process.env.GROQ_API_KEY) : (process.env.GROQ_API_KEY || (chosenProvider === 'auto' && apiKey ? apiKey : null));
    if ((chosenProvider === 'groq' || chosenProvider === 'auto') && groqKey) {
      try {
        const text = await this.transcribeWithGroq(buffer, filename, mimeType, groqKey);
        if (text) return text;
      } catch (err: any) {
        this.logger.warn(`Groq transcription attempt failed: ${err?.message || err}`);
      }
    }

    // 2. OpenAI Whisper
    const openaiKey = chosenProvider === 'whisper' ? (apiKey || process.env.OPENAI_API_KEY) : (process.env.OPENAI_API_KEY || (chosenProvider === 'auto' && apiKey ? apiKey : null));
    if ((chosenProvider === 'whisper' || chosenProvider === 'auto') && openaiKey) {
      try {
        const text = await this.transcribeWithOpenAi(buffer, filename, mimeType, openaiKey);
        if (text) return text;
      } catch (err: any) {
        this.logger.warn(`OpenAI transcription attempt failed: ${err?.message || err}`);
      }
    }

    // 3. Deepgram (Nova-3 in Spanish)
    const deepgramKey = chosenProvider === 'deepgram' ? (apiKey || process.env.DEEPGRAM_API_KEY) : (process.env.DEEPGRAM_API_KEY || null);
    if ((chosenProvider === 'deepgram' || chosenProvider === 'auto') && deepgramKey) {
      try {
        const text = await this.transcribeWithDeepgram(buffer, mimeType, deepgramKey);
        if (text) return text;
      } catch (err: any) {
        this.logger.warn(`Deepgram transcription attempt failed: ${err?.message || err}`);
      }
    }

    // 4. OpenRouter Multimodal (Gemini 2.0 Flash) fallback using agent's existing OpenRouter key
    const openrouterKey = config?.openrouterApiKey || process.env.OPENROUTER_API_KEY;
    if (openrouterKey) {
      try {
        const text = await this.transcribeWithOpenRouter(buffer, mimeType, openrouterKey);
        if (text) return text;
      } catch (err: any) {
        this.logger.warn(`OpenRouter transcription fallback failed: ${err?.message || err}`);
      }
    }

    return null;
  }

  private async transcribeWithGroq(
    buffer: Buffer,
    filename: string,
    mimeType: string,
    apiKey: string,
  ): Promise<string | null> {
    const formData = new FormData();
    const blob = new Blob([new Uint8Array(buffer)], { type: mimeType });
    formData.append('file', blob, filename || 'audio.ogg');
    formData.append('model', 'whisper-large-v3');
    formData.append('language', 'es');
    formData.append('temperature', '0');

    const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: formData,
      signal: AbortSignal.timeout(25_000),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => '');
      this.logger.warn(`Groq API returned HTTP ${res.status}: ${err}`);
      return null;
    }

    const data: any = await res.json();
    return data?.text ? String(data.text).trim() : null;
  }

  private async transcribeWithOpenAi(
    buffer: Buffer,
    filename: string,
    mimeType: string,
    apiKey: string,
  ): Promise<string | null> {
    const formData = new FormData();
    const blob = new Blob([new Uint8Array(buffer)], { type: mimeType });
    formData.append('file', blob, filename || 'audio.ogg');
    formData.append('model', 'whisper-1');
    formData.append('language', 'es');

    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: formData,
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => '');
      this.logger.warn(`OpenAI API returned HTTP ${res.status}: ${err}`);
      return null;
    }

    const data: any = await res.json();
    return data?.text ? String(data.text).trim() : null;
  }

  private async transcribeWithDeepgram(
    buffer: Buffer,
    mimeType: string,
    apiKey: string,
  ): Promise<string | null> {
    const cleanMime = mimeType.split(';')[0].trim() || 'audio/ogg';
    const url = 'https://api.deepgram.com/v1/listen?language=es&model=nova-3&smart_format=true';

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Token ${apiKey}`,
        'Content-Type': cleanMime,
      },
      body: new Uint8Array(buffer),
      signal: AbortSignal.timeout(25_000),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => '');
      this.logger.warn(`Deepgram API returned HTTP ${res.status}: ${err}`);
      return null;
    }

    const data: any = await res.json();
    const transcript = data?.results?.channels?.[0]?.alternatives?.[0]?.transcript;
    return transcript ? String(transcript).trim() : null;
  }

  private async transcribeWithOpenRouter(
    buffer: Buffer,
    mimeType: string,
    apiKey: string,
  ): Promise<string | null> {
    const cleanMime = mimeType.split(';')[0].trim() || 'audio/ogg';
    const base64 = buffer.toString('base64');
    const dataUri = `data:${cleanMime};base64,${base64}`;

    const payload = {
      model: 'google/gemini-2.0-flash-001',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Transcribe el siguiente audio en español palabra por palabra con máxima precisión. Devuelve ÚNICAMENTE el texto transcrito, sin comentarios adicionales ni comillas.',
            },
            {
              type: 'image_url',
              image_url: {
                url: dataUri,
              },
            },
          ],
        },
      ],
      temperature: 0.1,
    };

    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => '');
      this.logger.warn(`OpenRouter transcription returned HTTP ${res.status}: ${err}`);
      return null;
    }

    const data: any = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    return content ? String(content).trim() : null;
  }
}
