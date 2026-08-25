import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 5 — agent knowledge base & custom instructions.
 *
 * - `agent_configs.customInstructions` (nullable text): the owner's free-text
 *   behaviour prompt, layered on top of the internal hardened prompt.
 * - `knowledge_documents`: one row per uploaded file, storing the extracted plain
 *   text (never the original bytes).
 * - `knowledge_chunks`: ~1200-char slices used by the large-KB retrieval path.
 *   `searchVector` is a STORED GENERATED `tsvector` (Spanish text-search config)
 *   with a GIN index — the whole reason this is hand-authored raw SQL (TypeORM
 *   can't model a generated tsvector column). Chunks cascade-delete with their
 *   document.
 *
 * Purely additive; safe under `migrationsRun` on boot. Not idempotent (only the
 * initial migration must be). Dev `synchronize` builds the plain columns but NOT
 * the generated `searchVector`/GIN index — the retriever falls back gracefully.
 */
export class Phase5Knowledge1782895529356 implements MigrationInterface {
  name = 'Phase5Knowledge1782895529356';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "agent_configs" ADD "customInstructions" text`,
    );

    await queryRunner.query(
      `CREATE TABLE "knowledge_documents" (` +
        `"id" uuid NOT NULL DEFAULT uuid_generate_v4(), ` +
        `"agentKey" character varying NOT NULL, ` +
        `"filename" character varying NOT NULL, ` +
        `"mimeType" character varying NOT NULL, ` +
        `"fileExtension" character varying NOT NULL, ` +
        `"sizeBytes" integer NOT NULL, ` +
        `"charCount" integer NOT NULL, ` +
        `"content" text NOT NULL, ` +
        `"createdAt" TIMESTAMP NOT NULL DEFAULT now(), ` +
        `CONSTRAINT "PK_knowledge_documents" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_knowledge_documents_agentKey" ON "knowledge_documents" ("agentKey")`,
    );

    await queryRunner.query(
      `CREATE TABLE "knowledge_chunks" (` +
        `"id" uuid NOT NULL DEFAULT uuid_generate_v4(), ` +
        `"documentId" uuid NOT NULL, ` +
        `"agentKey" character varying NOT NULL, ` +
        `"chunkIndex" integer NOT NULL, ` +
        `"content" text NOT NULL, ` +
        `"searchVector" tsvector GENERATED ALWAYS AS (to_tsvector('spanish', "content")) STORED, ` +
        `CONSTRAINT "PK_knowledge_chunks" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_knowledge_chunks_agentKey" ON "knowledge_chunks" ("agentKey")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_knowledge_chunks_documentId" ON "knowledge_chunks" ("documentId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_knowledge_chunks_search" ON "knowledge_chunks" USING GIN ("searchVector")`,
    );
    await queryRunner.query(
      `ALTER TABLE "knowledge_chunks" ADD CONSTRAINT "FK_knowledge_chunks_document" ` +
        `FOREIGN KEY ("documentId") REFERENCES "knowledge_documents"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "knowledge_chunks" DROP CONSTRAINT "FK_knowledge_chunks_document"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_knowledge_chunks_search"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_knowledge_chunks_documentId"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_knowledge_chunks_agentKey"`,
    );
    await queryRunner.query(`DROP TABLE "knowledge_chunks"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_knowledge_documents_agentKey"`,
    );
    await queryRunner.query(`DROP TABLE "knowledge_documents"`);
    await queryRunner.query(
      `ALTER TABLE "agent_configs" DROP COLUMN "customInstructions"`,
    );
  }
}
