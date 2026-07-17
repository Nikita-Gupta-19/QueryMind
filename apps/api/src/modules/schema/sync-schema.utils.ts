import { DbType } from '@prisma/client';
import prisma from '../../config/db';
import { decrypt } from '../connections/crypto.utils';
import { introspectDatabase, computeSchemaFingerprint, TableSchema } from './introspector';
import { generateEmbeddingsBatch } from '../../lib/embeddings';

async function ensureHNSWIndex(): Promise<void> {
  try {
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS schema_embeddings_embedding_hnsw_idx
      ON "schema_embeddings"
      USING hnsw (embedding vector_cosine_ops)
      WITH (m = 16, ef_construction = 64)
    `);
  } catch (err: any) {
    console.warn('[SyncSchemaUtils] HNSW Index creation failed (can happen if dimensions > 2000). Skipping index creation.', err.message || err);
  }
}

export async function syncSchemaInProcess(connectionId: string): Promise<void> {
  console.log(`[SyncSchemaUtils] Starting in-process schema sync for connection: ${connectionId}`);

  // 1. Fetch connection record
  const conn = await prisma.dbConnection.findUnique({ where: { id: connectionId } });
  if (!conn) throw new Error(`Connection ${connectionId} not found`);

  // 2. Decrypt connection string
  const connectionString = decrypt(conn.encryptedConnString);

  // 3. Introspect live database schema
  console.log(`[SyncSchemaUtils] Introspecting ${conn.dbType} database...`);
  const tables: TableSchema[] = await introspectDatabase(connectionString, conn.dbType as DbType);

  if (tables.length === 0) {
    console.warn(`[SyncSchemaUtils] No tables found in connection ${connectionId}. Skipping.`);
    return;
  }

  // 4. Compute schema fingerprint for drift detection
  const fingerprint = computeSchemaFingerprint(tables);
  console.log(`[SyncSchemaUtils] Found ${tables.length} tables. Fingerprint: ${fingerprint}`);

  // 5. Generate embeddings for all table descriptions in batch
  const descriptions = tables.map((t) => t.description);
  console.log(`[SyncSchemaUtils] Generating embeddings for ${descriptions.length} tables...`);
  const embeddings = await generateEmbeddingsBatch(descriptions);

  // 6. Delete stale embeddings for this connection first
  await prisma.schemaEmbedding.deleteMany({ where: { connectionId } });

  // 7. Insert new embeddings using raw SQL
  for (let i = 0; i < tables.length; i++) {
    const table = tables[i];
    const embedding = embeddings[i];
    const embeddingStr = `[${embedding.join(',')}]`;

    await prisma.$executeRawUnsafe(
      `INSERT INTO "schema_embeddings" 
         (id, "connectionId", "tableName", "columnNames", description, embedding, "updatedAt")
       VALUES (gen_random_uuid(), $1::uuid, $2, $3, $4, $5::vector, NOW())`,
      connectionId,
      table.tableName,
      table.columns.map((c) => c.columnName),
      table.description,
      embeddingStr
    );
  }

  // 8. Ensure HNSW index exists
  await ensureHNSWIndex();

  // 9. Update lastSyncedAt on the connection
  await prisma.dbConnection.update({
    where: { id: connectionId },
    data: { lastSyncedAt: new Date() },
  });

  console.log(`[SyncSchemaUtils] ✅ Done. Embedded ${tables.length} tables for connection ${connectionId}`);
}
