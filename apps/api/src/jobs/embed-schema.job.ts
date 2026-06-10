import { Queue, Worker, Job } from 'bullmq';
import { DbType } from '@prisma/client';
import prisma from '../config/db';
import { getRedisConnection } from '../lib/redis';
import { decrypt } from '../modules/connections/crypto.utils';
import { introspectDatabase, computeSchemaFingerprint, TableSchema } from '../modules/schema/introspector';
import { generateEmbeddingsBatch } from '../lib/embeddings';

// ─── Queue Definition ─────────────────────────────────────────────────────────

export const embedSchemaQueue = new Queue('embed-schema', {
  connection: getRedisConnection(),
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: 100,
    removeOnFail: 50,
  },
});

export interface EmbedSchemaJobData {
  connectionId: string;
  workspaceId: string;
}

/**
 * Enqueue a new schema embedding job for a given DB connection.
 */
export async function enqueueEmbedSchemaJob(data: EmbedSchemaJobData): Promise<void> {
  await embedSchemaQueue.add('embed-schema', data, {
    jobId: `embed-${data.connectionId}`, // Deduplicate: one job per connection at a time
  });
}

// ─── HNSW Index Creation ──────────────────────────────────────────────────────

/**
 * Create HNSW vector index on schema_embeddings table if it doesn't exist.
 * HNSW is significantly faster than IVFFlat for approximate nearest neighbor search.
 */
async function ensureHNSWIndex(): Promise<void> {
  // Use raw SQL since Prisma doesn't manage vector indexes
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS schema_embeddings_embedding_hnsw_idx
    ON "schema_embeddings"
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64)
  `);
}

// ─── Worker ───────────────────────────────────────────────────────────────────

export function startEmbedSchemaWorker(): Worker {
  const worker = new Worker<EmbedSchemaJobData>(
    'embed-schema',
    async (job: Job<EmbedSchemaJobData>) => {
      const { connectionId } = job.data;

      console.log(`[EmbedSchema] Starting job for connection: ${connectionId}`);
      await job.updateProgress(5);

      // 1. Fetch connection record
      const conn = await prisma.dbConnection.findUnique({ where: { id: connectionId } });
      if (!conn) throw new Error(`Connection ${connectionId} not found`);

      // 2. Decrypt connection string
      const connectionString = decrypt(conn.encryptedConnString);
      await job.updateProgress(10);

      // 3. Introspect live database schema
      console.log(`[EmbedSchema] Introspecting ${conn.dbType} database...`);
      const tables: TableSchema[] = await introspectDatabase(connectionString, conn.dbType as DbType);
      await job.updateProgress(30);

      if (tables.length === 0) {
        console.warn(`[EmbedSchema] No tables found in connection ${connectionId}. Skipping.`);
        return { tablesEmbedded: 0 };
      }

      // 4. Compute schema fingerprint for drift detection
      const fingerprint = computeSchemaFingerprint(tables);
      console.log(`[EmbedSchema] Found ${tables.length} tables. Fingerprint: ${fingerprint}`);

      // 5. Generate embeddings for all table descriptions in batch
      const descriptions = tables.map((t) => t.description);
      console.log(`[EmbedSchema] Generating embeddings for ${descriptions.length} tables...`);
      const embeddings = await generateEmbeddingsBatch(descriptions);
      await job.updateProgress(70);

      // 6. Upsert schema embeddings into Postgres (delete old, insert new)
      // Delete stale embeddings for this connection first
      await prisma.schemaEmbedding.deleteMany({ where: { connectionId } });

      // Insert new embeddings using raw SQL (Prisma cannot write vector type directly)
      for (let i = 0; i < tables.length; i++) {
        const table = tables[i];
        const embedding = embeddings[i];
        const embeddingStr = `[${embedding.join(',')}]`;

        await prisma.$executeRawUnsafe(
          `INSERT INTO "schema_embeddings" 
             (id, "connectionId", "tableName", "columnNames", description, embedding, "updatedAt")
           VALUES (gen_random_uuid(), $1, $2, $3, $4, $5::vector, NOW())`,
          connectionId,
          table.tableName,
          table.columns.map((c) => c.columnName),
          table.description,
          embeddingStr
        );
      }

      await job.updateProgress(90);

      // 7. Ensure HNSW index exists (idempotent — only creates if missing)
      await ensureHNSWIndex();

      // 8. Update lastSyncedAt on the connection
      await prisma.dbConnection.update({
        where: { id: connectionId },
        data: { lastSyncedAt: new Date() },
      });

      await job.updateProgress(100);
      console.log(`[EmbedSchema] ✅ Done. Embedded ${tables.length} tables for connection ${connectionId}`);

      return { tablesEmbedded: tables.length, fingerprint };
    },
    {
      connection: getRedisConnection(),
      concurrency: 2, // Process max 2 embedding jobs simultaneously
    }
  );

  worker.on('completed', (job, result) => {
    console.log(`[EmbedSchema] Job ${job.id} completed:`, result);
  });

  worker.on('failed', (job, err) => {
    console.error(`[EmbedSchema] Job ${job?.id} failed:`, err.message);
  });

  return worker;
}
