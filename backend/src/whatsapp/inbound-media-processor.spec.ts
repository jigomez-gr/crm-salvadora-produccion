import { InboundMediaProcessorService } from './inbound-media-processor.service';
import { MediaType } from '../common/entities/message.entity';
import { AgentConfig } from '../common/entities/agent-config.entity';
import { InboundMedia } from './inbound-parser';

describe('InboundMediaProcessorService — Multi-format & Limit Testing', () => {
  let service: InboundMediaProcessorService;
  let mockYCloudProvider: any;
  let mockEvolutionProvider: any;
  let mockMetaProvider: any;

  const mockAgentConfig: AgentConfig = {
    agentKey: 'booking',
    businessName: 'Centro de Yoga Salvadora Conesa',
    businessDescription: 'Yoga y bienestar',
    channel: 'whatsapp',
    services: [],
    workingHours: [],
    tone: 'amable',
    timezone: 'Europe/Madrid',
    model: 'openai/gpt-4.1-mini',
    enabled: true,
    remindersEnabled: false,
    reminderTemplateLanguage: 'es',
    maxAudioSizeMb: 100,
    maxDocSizeMb: 100,
    maxVideoSizeMb: 100,
    transcriptionProvider: 'auto',
    createdAt: new Date(),
  } as AgentConfig;

  beforeEach(() => {
    mockYCloudProvider = {
      fetchInboundMedia: jest.fn(),
    };
    mockEvolutionProvider = {
      fetchInboundMedia: jest.fn(),
      fetchMediaBase64: jest.fn(),
    };
    mockMetaProvider = {
      fetchInboundMedia: jest.fn(),
    };

    service = new InboundMediaProcessorService(
      mockYCloudProvider,
      mockEvolutionProvider,
      mockMetaProvider,
    );
  });

  describe('1. Size limits enforcement (100 MB default & parameterized)', () => {
    it('rejects audio exceeding maxAudioSizeMb with polite customer notice', async () => {
      // 101 MB buffer
      const largeBuffer = Buffer.alloc(101 * 1024 * 1024);
      mockYCloudProvider.fetchInboundMedia.mockResolvedValue({
        buffer: largeBuffer,
        contentType: 'audio/ogg',
      });

      const media: InboundMedia = {
        type: MediaType.AUDIO,
        url: 'https://api.ycloud.com/v1/media/audio123',
        mediaId: 'audio123',
        mimeType: 'audio/ogg',
        filename: 'nota_de_voz.ogg',
      };

      const result = await service.processMedia('ycloud', media, mockAgentConfig);

      expect(result.isOverLimit).toBe(true);
      expect(result.enrichedBody).toContain('supera el límite de 100 MB');
      expect(result.enrichedAgentPrompt).toContain('100 MB');
      expect(result.enrichedAgentPrompt).toContain('Explícale amablemente');
    });

    it('respects custom parameterized limit (e.g. maxDocSizeMb = 15)', async () => {
      const customConfig: AgentConfig = {
        ...mockAgentConfig,
        maxDocSizeMb: 15,
      };

      // 20 MB buffer
      const buffer = Buffer.alloc(20 * 1024 * 1024);
      const media: InboundMedia = {
        type: MediaType.DOCUMENT,
        url: 'https://evolution.example.com/media/doc.pdf',
        mediaId: 'doc123',
        mimeType: 'application/pdf',
        filename: 'catalogo.pdf',
        base64: buffer.toString('base64'),
      };

      const result = await service.processMedia('evolution', media, customConfig);

      expect(result.isOverLimit).toBe(true);
      expect(result.enrichedBody).toContain('supera el límite de 15 MB');
    });

    it('accepts files within 100 MB limit', async () => {
      // 5 MB text buffer
      const buffer = Buffer.from('Horarios de clases de Yoga: Lunes y Miércoles 18:00');
      const media: InboundMedia = {
        type: MediaType.DOCUMENT,
        url: null,
        mediaId: 'doc1',
        mimeType: 'text/plain',
        filename: 'horarios.txt',
        base64: buffer.toString('base64'),
      };

      const result = await service.processMedia('meta', media, mockAgentConfig);

      expect(result.isOverLimit).toBeFalsy();
      expect(result.enrichedBody).toContain('horarios.txt');
      expect(result.enrichedAgentPrompt).toContain('Horarios de clases de Yoga');
    });
  });

  describe('2. Document processing (PDF, DOCX, XLSX, TXT)', () => {
    it('extracts plain text and constructs conversational prompt for agent', async () => {
      const docContent = 'Condiciones de reserva para el Baño de Gong: Se ruega traer esterilla propia.';
      const buffer = Buffer.from(docContent, 'utf8');

      const media: InboundMedia = {
        type: MediaType.DOCUMENT,
        url: null,
        mediaId: 'txt_doc',
        mimeType: 'text/plain',
        filename: 'condiciones.txt',
        base64: buffer.toString('base64'),
      };

      const result = await service.processMedia('ycloud', media, mockAgentConfig, 'Te envío las condiciones');

      expect(result.enrichedBody).toContain('Te envío las condiciones (📄 condiciones.txt)');
      expect(result.enrichedAgentPrompt).toContain('Contenido extraído del documento');
      expect(result.enrichedAgentPrompt).toContain(docContent);
      expect(result.extractedText).toBe(docContent);
    });
  });

  describe('3. Audio transcription and fallback handling', () => {
    it('returns structured audio prompt when transcription succeeds', async () => {
      const audioBuffer = Buffer.from('fake-audio-bytes');
      mockMetaProvider.fetchInboundMedia.mockResolvedValue({
        buffer: audioBuffer,
        contentType: 'audio/ogg',
      });

      jest.spyOn(service, 'transcribeAudio').mockResolvedValue('Hola, quería reservar para constelaciones familiares este sábado');

      const media: InboundMedia = {
        type: MediaType.AUDIO,
        url: null,
        mediaId: 'meta_audio_999',
        mimeType: 'audio/ogg',
        filename: 'audio.ogg',
      };

      const result = await service.processMedia('meta', media, mockAgentConfig);

      expect(result.enrichedBody).toContain('🎤 Audio: "Hola, quería reservar para constelaciones familiares este sábado"');
      expect(result.enrichedAgentPrompt).toContain('Transcripción exacta del audio');
      expect(result.enrichedAgentPrompt).toContain('Hola, quería reservar para constelaciones familiares este sábado');
      expect(result.transcription).toBe('Hola, quería reservar para constelaciones familiares este sábado');
    });

    it('returns courteous fallback prompt when transcription fails or key is missing', async () => {
      const audioBuffer = Buffer.from('fake-audio-bytes');
      mockEvolutionProvider.fetchInboundMedia.mockResolvedValue({
        buffer: audioBuffer,
        contentType: 'audio/ogg',
      });

      jest.spyOn(service, 'transcribeAudio').mockResolvedValue(null);

      const media: InboundMedia = {
        type: MediaType.AUDIO,
        url: 'http://evolution/audio.ogg',
        mediaId: 'audio_failed',
        mimeType: 'audio/ogg',
        filename: 'nota_de_voz.ogg',
      };

      const result = await service.processMedia('evolution', media, mockAgentConfig);

      expect(result.enrichedBody).toBe('🎤 Mensaje de voz');
      expect(result.enrichedAgentPrompt).toContain('No se pudo transcribir de forma automática');
      expect(result.enrichedAgentPrompt).toContain('pídele si te puede resumir o detallar su consulta por escrito');
    });
  });

  describe('4. Video processing', () => {
    it('builds clear video notice with caption and file name', async () => {
      const videoBuffer = Buffer.alloc(10 * 1024 * 1024); // 10 MB
      const media: InboundMedia = {
        type: MediaType.VIDEO,
        url: null,
        mediaId: 'vid1',
        mimeType: 'video/mp4',
        filename: 'consulta_postura.mp4',
        base64: videoBuffer.toString('base64'),
      };

      const result = await service.processMedia('evolution', media, mockAgentConfig, 'Mira la postura de asana');

      expect(result.enrichedBody).toContain('Mira la postura de asana');
      expect(result.enrichedBody).toContain('🎬 Vídeo');
      expect(result.enrichedAgentPrompt).toContain('Mira la postura de asana');
      expect(result.enrichedAgentPrompt).toContain('consulta_postura.mp4');
    });
  });
});
