import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * One uploaded knowledge-base file for an agent. Stores the FULL extracted plain
 * text (`content`) — the source of truth for both the small-KB injection path
 * (the whole text goes into the prompt) and for re-chunking. The per-chunk
 * `KnowledgeChunk` rows (for the large-KB full-text-search retrieval path) are
 * derived from this text on upload. We never store the original bytes — only the
 * extracted text — so the knowledge base stays PII-light and small.
 *
 * Scoped by `agentKey` (by convention, like the rest of the codebase), not a DB
 * FK to agent_configs.
 */
@Entity('knowledge_documents')
export class KnowledgeDocument {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column()
  agentKey: string;

  // Original file name, shown in the UI.
  @Column()
  filename: string;

  @Column()
  mimeType: string;

  // Normalised lowercase extension without the dot (e.g. 'pdf', 'docx', 'xlsx').
  @Column()
  fileExtension: string;

  // Size of the uploaded file in bytes (for the UI).
  @Column({ type: 'int' })
  sizeBytes: number;

  // Length of the extracted text — powers the budget/mode indicator without
  // having to read the (potentially large) content column.
  @Column({ type: 'int' })
  charCount: number;

  // The full extracted plain text.
  @Column({ type: 'text' })
  content: string;

  @CreateDateColumn()
  createdAt: Date;
}
