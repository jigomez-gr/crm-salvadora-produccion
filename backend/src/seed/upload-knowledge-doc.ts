import { Client } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
dotenv.config();

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://crm:crm@localhost:5432/crm_salvadora';

async function uploadKnowledge() {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  console.log('Connected to DB for Knowledge Base injection...');

  try {
    const mdPath = path.resolve(__dirname, '../../../docs/conocimiento_centro_yoga_salvadora.md');
    const content = fs.readFileSync(mdPath, 'utf8');
    const filename = 'conocimiento_centro_yoga_salvadora.md';
    const charCount = content.length;
    const sizeBytes = Buffer.byteLength(content, 'utf8');
    const agentKey = 'booking';

    // 1. Clean previous knowledge documents for this agent
    await client.query('DELETE FROM knowledge_chunks WHERE "agentKey" = $1', [agentKey]);
    await client.query('DELETE FROM knowledge_documents WHERE "agentKey" = $1', [agentKey]);

    // 2. Insert KnowledgeDocument
    const docRes = await client.query(
      `INSERT INTO knowledge_documents (
        id, "agentKey", filename, "mimeType", "fileExtension", "sizeBytes", "charCount", content, "createdAt"
      ) VALUES (
        gen_random_uuid(), $1, $2, 'text/markdown', 'md', $3, $4, $5, NOW()
      ) RETURNING id`,
      [agentKey, filename, sizeBytes, charCount, content]
    );
    const documentId = docRes.rows[0].id;
    console.log(`Document inserted with ID: ${documentId} (${charCount} characters).`);

    // 3. Simple paragraph chunking for KnowledgeChunk
    const paragraphs = content
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter((p) => p.length > 20);

    for (let i = 0; i < paragraphs.length; i++) {
      const chunkText = paragraphs[i];
      await client.query(
        `INSERT INTO knowledge_chunks (
          id, "documentId", "agentKey", "chunkIndex", content
        ) VALUES (
          gen_random_uuid(), $1, $2, $3, $4
        )`,
        [documentId, agentKey, i, chunkText]
      );
    }
    console.log(`Inserted ${paragraphs.length} knowledge chunks for agent "${agentKey}".`);
    console.log('Knowledge Base is now fully operational for AI Agent.');
  } finally {
    await client.end();
  }
}

uploadKnowledge().catch((err) => {
  console.error('Error uploading knowledge base:', err);
  process.exit(1);
});
