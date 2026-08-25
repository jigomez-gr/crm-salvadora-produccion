import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { KnowledgeDocument } from '../common/entities/knowledge-document.entity';
import { KnowledgeChunk } from '../common/entities/knowledge-chunk.entity';
import { UploadKnowledgeDto } from './dto/upload-knowledge.dto';
import {
  extractText,
  isAcceptedExtension,
  normalizeExtension,
  UnsupportedFormatError,
  ACCEPTED_EXTENSIONS,
} from './knowledge-extractor';
import {
  chunkText,
  packWithinBudget,
  resolveKnowledgeMode,
  KnowledgeMode,
  KNOWLEDGE_BUDGET_CHARS,
  KNOWLEDGE_THRESHOLD_CHARS,
} from './knowledge-core';

// ~4 MB original file (base64-inflated to ~5.3 MB, under the 6 MB JSON body limit).
const MAX_FILE_BYTES = 4 * 1024 * 1024;
// How many chunks the FTS query may return before budget-packing.
const RETRIEVE_CHUNK_LIMIT = 60;

/** The client-facing shape of a document — never includes the full `content`. */
export interface KnowledgeDocumentView {
  id: string;
  filename: string;
  fileExtension: string;
  mimeType: string;
  sizeBytes: number;
  charCount: number;
  createdAt: Date;
}

export interface KnowledgeListView {
  documents: KnowledgeDocumentView[];
  totalChars: number;
  budgetChars: number;
  mode: KnowledgeMode;
}

function toView(doc: KnowledgeDocument): KnowledgeDocumentView {
  return {
    id: doc.id,
    filename: doc.filename,
    fileExtension: doc.fileExtension,
    mimeType: doc.mimeType,
    sizeBytes: doc.sizeBytes,
    charCount: doc.charCount,
    createdAt: doc.createdAt,
  };
}

@Injectable()
export class KnowledgeService {
  private readonly logger = new Logger(KnowledgeService.name);

  constructor(
    @InjectRepository(KnowledgeDocument)
    private readonly docsRepo: Repository<KnowledgeDocument>,
    @InjectRepository(KnowledgeChunk)
    private readonly chunksRepo: Repository<KnowledgeChunk>,
    private readonly dataSource: DataSource,
  ) {}

  /** Decode base64 (bare or a data: URL), extract text, store the doc + chunks. */
  async upload(
    agentKey: string,
    dto: UploadKnowledgeDto,
  ): Promise<KnowledgeDocumentView> {
    const ext = normalizeExtension(dto.filename);
    if (!isAcceptedExtension(ext)) {
      throw new BadRequestException(
        `Formato no admitido. Sube uno de: ${ACCEPTED_EXTENSIONS.join(', ')}.`,
      );
    }

    const base64 = stripDataUrlPrefix(dto.contentBase64);
    const buffer = Buffer.from(base64, 'base64');
    if (buffer.length === 0) {
      throw new BadRequestException('El archivo está vacío.');
    }
    if (buffer.length > MAX_FILE_BYTES) {
      throw new BadRequestException(
        'El archivo es demasiado grande (máximo 4 MB).',
      );
    }

    let extracted;
    try {
      extracted = await extractText(buffer, dto.filename);
    } catch (err) {
      if (err instanceof UnsupportedFormatError) {
        throw new BadRequestException(
          `Formato no admitido. Sube uno de: ${ACCEPTED_EXTENSIONS.join(', ')}.`,
        );
      }
      // Log the reason server-side (filename only — never the content), return a
      // friendly message to the client.
      this.logger.warn(
        `Failed to extract '${dto.filename}' for agent '${agentKey}': ${
          (err as Error)?.message
        }`,
      );
      throw new BadRequestException(
        'No pudimos leer este archivo. Comprueba que no esté dañado ni protegido con contraseña.',
      );
    }

    if (!extracted.text.trim()) {
      throw new BadRequestException(
        'No encontramos texto en este archivo. Si es un PDF escaneado (una imagen), súbelo como texto, Word o un PDF con texto seleccionable.',
      );
    }

    const saved = await this.dataSource.transaction(async (manager) => {
      const doc = manager.create(KnowledgeDocument, {
        agentKey,
        filename: dto.filename,
        mimeType: extracted.mimeType,
        fileExtension: ext,
        sizeBytes: buffer.length,
        charCount: extracted.text.length,
        content: extracted.text,
      });
      const persisted = await manager.save(doc);

      const chunkRows = chunkText(extracted.text).map((c) =>
        manager.create(KnowledgeChunk, {
          documentId: persisted.id,
          agentKey,
          chunkIndex: c.index,
          content: c.content,
        }),
      );
      if (chunkRows.length) await manager.save(chunkRows);
      return persisted;
    });

    this.logger.log(
      `Knowledge doc '${dto.filename}' (${saved.charCount} chars) added to agent '${agentKey}'.`,
    );
    return toView(saved);
  }

  /** List an agent's documents plus the aggregate size/mode indicator. */
  async list(agentKey: string): Promise<KnowledgeListView> {
    const docs = await this.docsRepo.find({
      where: { agentKey },
      order: { createdAt: 'ASC' },
    });
    const totalChars = docs.reduce((sum, d) => sum + d.charCount, 0);
    return {
      documents: docs.map(toView),
      totalChars,
      budgetChars: KNOWLEDGE_BUDGET_CHARS,
      mode: resolveKnowledgeMode(totalChars),
    };
  }

  /** Delete a document (its chunks cascade via the FK). Scoped by agentKey. */
  async remove(agentKey: string, documentId: string): Promise<void> {
    const result = await this.docsRepo.delete({ id: documentId, agentKey });
    if (!result.affected) {
      throw new NotFoundException('Documento no encontrado.');
    }
  }

  private async getTotalChars(agentKey: string): Promise<number> {
    const total = await this.docsRepo.sum('charCount', { agentKey });
    return total ?? 0;
  }

  /**
   * Resolve the knowledge-base text to inject for a given user message. Small
   * bases are injected whole; large ones are retrieved via Postgres full-text
   * search (bounded by budget). Used by the agent runner for BOTH WhatsApp and
   * the playground. Returns empty text when the agent has no knowledge base.
   */
  async resolveForMessage(
    agentKey: string,
    query: string,
    budgetChars: number = KNOWLEDGE_BUDGET_CHARS,
  ): Promise<{ mode: KnowledgeMode; text: string }> {
    const totalChars = await this.getTotalChars(agentKey);
    if (totalChars === 0) return { mode: 'inject', text: '' };

    const mode = resolveKnowledgeMode(totalChars, KNOWLEDGE_THRESHOLD_CHARS);

    if (mode === 'inject') {
      const docs = await this.docsRepo.find({
        where: { agentKey },
        order: { createdAt: 'ASC' },
        select: ['content'],
      });
      return { mode, text: packWithinBudget(docs.map((d) => d.content), budgetChars) };
    }

    // Retrieve: rank chunks by relevance to the message via FTS.
    const ranked = await this.ftsSearch(agentKey, query, RETRIEVE_CHUNK_LIMIT);
    if (ranked.length > 0) {
      return { mode, text: packWithinBudget(ranked, budgetChars) };
    }
    // Fallback (no FTS match, or dev where synchronize didn't build the generated
    // tsvector): pack the first chunks up to budget so there's still context.
    const first = await this.chunksRepo.find({
      where: { agentKey },
      order: { chunkIndex: 'ASC' },
      take: RETRIEVE_CHUNK_LIMIT,
    });
    return { mode, text: packWithinBudget(first.map((c) => c.content), budgetChars) };
  }

  /**
   * Postgres full-text search over an agent's chunks. The user's message is a
   * BOUND parameter ($2) — never interpolated. We build an **OR** tsquery from the
   * message's own lexemes (so a chunk matching ANY significant word is retrieved,
   * ranked by ts_rank) rather than `plainto_tsquery`'s AND (which would miss a
   * chunk unless it contained every word) — much better recall for FAQ questions.
   * The lexemes come from `to_tsvector('spanish', $2)` (already normalised/stemmed)
   * and are quote-escaped before `to_tsquery`, so there's no query-syntax injection
   * surface. Returns [] on any SQL error (e.g. the generated `searchVector` column
   * absent in a dev synchronize DB) so the caller falls back gracefully.
   */
  private async ftsSearch(
    agentKey: string,
    query: string,
    limit: number,
  ): Promise<string[]> {
    try {
      const rows: { content: string }[] = await this.chunksRepo.query(
        `SELECT "content"
         FROM "knowledge_chunks",
              to_tsquery('spanish',
                (SELECT string_agg('''' || replace(lexeme, '''', '''''') || '''', ' | ')
                 FROM unnest(to_tsvector('spanish', $2)) t(lexeme, positions, weights))
              ) AS q
         WHERE "agentKey" = $1 AND "searchVector" @@ q
         ORDER BY ts_rank("searchVector", q) DESC
         LIMIT $3`,
        [agentKey, query ?? '', limit],
      );
      return rows.map((r) => r.content);
    } catch (err) {
      this.logger.debug(`FTS unavailable, falling back: ${(err as Error)?.message}`);
      return [];
    }
  }
}

/** Strip a leading `data:<mime>;base64,` prefix if present. */
function stripDataUrlPrefix(input: string): string {
  const match = /^data:[^;,]*;base64,/.exec(input);
  return match ? input.slice(match[0].length) : input;
}
