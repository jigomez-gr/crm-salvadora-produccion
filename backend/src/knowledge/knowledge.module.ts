import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { KnowledgeDocument } from '../common/entities/knowledge-document.entity';
import { KnowledgeChunk } from '../common/entities/knowledge-chunk.entity';
import { KnowledgeService } from './knowledge.service';
import { KnowledgeController } from './knowledge.controller';
import { AuthModule } from '../auth/auth.module';

/**
 * Agent knowledge base — document upload/extraction, listing, deletion, and the
 * inject-vs-retrieve resolution used by the agent runner.
 *
 * Deliberately **Mastra-free**: it only depends on TypeORM + Auth (for the
 * guard), so it can be added to the e2e `TestAppModule` and must be registered
 * BEFORE `AgentsModule` (the Mastra `/api/*` catch-all). `AgentsModule` imports
 * this module and injects `KnowledgeService` (dependency points Mastra-side →
 * Mastra-free, never the reverse).
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([KnowledgeDocument, KnowledgeChunk]),
    AuthModule,
  ],
  controllers: [KnowledgeController],
  providers: [KnowledgeService],
  exports: [KnowledgeService],
})
export class KnowledgeModule {}
