import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { KnowledgeDocument } from './knowledge-document.entity';

/**
 * A ~1200-char slice of a KnowledgeDocument, used ONLY by the large-KB retrieval
 * path (Postgres full-text search). Chunks are created from the document text on
 * upload and cascade-deleted with their document.
 *
 * The `searchVector` (a Postgres `tsvector`) is a STORED GENERATED column created
 * in the migration via raw SQL — TypeORM can't model it, so it's mapped read-only
 * here (`insert:false`, `update:false`, `select:false`) and kept in sync by the
 * database. Dev `synchronize` won't create it (nor the GIN index); the retriever
 * falls back gracefully when it's absent (see FtsKnowledgeRetriever).
 */
@Entity('knowledge_chunks')
export class KnowledgeChunk {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column('uuid')
  documentId: string;

  @ManyToOne(() => KnowledgeDocument, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'documentId' })
  document: KnowledgeDocument;

  // Denormalised so the FTS query filters by agent without a join.
  @Index()
  @Column()
  agentKey: string;

  // Order of this chunk within its document.
  @Column({ type: 'int' })
  chunkIndex: number;

  @Column({ type: 'text' })
  content: string;

  // STORED GENERATED tsvector — managed by the DB (migration), never written by
  // TypeORM and never selected by default.
  @Column({
    type: 'tsvector',
    select: false,
    insert: false,
    update: false,
    nullable: true,
  })
  searchVector: string | null;
}
