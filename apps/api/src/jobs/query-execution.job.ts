import { Queue, Worker, Job } from 'bullmq';
import { QueryStatus, DbType } from '@prisma/client';
import prisma from '../config/db';
import { getRedisConnection, cacheSet } from '../lib/redis';
import { decrypt } from '../modules/connections/crypto.utils';
import { decryptString } from '../lib/encryption';
import { publishSocketEvent } from '../lib/pubsub';
import { retrieveRelevantSchema, buildSchemaContext } from '../modules/query/rag';
import { generateSQL, generateEdaSQL, generateQueryPlan } from '../modules/query/generator';
import { validateSQL } from '../modules/query/validator';
import { executeQuery } from '../modules/query/executor';
import { resolveGlossaryTerms, buildGlossaryContext } from '../modules/query/glossary-resolver';
import { detectChartType } from '../modules/query/chart-detector';
import { queriesExecutedCounter, queryExecutionDuration } from '../lib/metrics';

// ─── Queue Definition ─────────────────────────────────────────────────────────

export const queryExecutionQueue = new Queue('query-execution', {
  connection: getRedisConnection(),
  defaultJobOptions: {
    attempts: 1, // Don't auto-retry user query executions if they fail
    removeOnComplete: 100,
    removeOnFail: 100,
  },
});

export interface QueryExecutionJobData {
  queryId: string;
  workspaceId: string;
  connectionId: string;
  question: string;
  isEda: boolean;
  userId: string;
}

/**
 * Enqueue a new query execution job.
 */
export async function enqueueQueryExecutionJob(data: QueryExecutionJobData): Promise<void> {
  await queryExecutionQueue.add('query-execution', data);
}

// ─── Worker ───────────────────────────────────────────────────────────────────

const CACHE_TTL_SECONDS = 300; // 5 minutes

export function startQueryExecutionWorker(): Worker {
  const worker = new Worker<QueryExecutionJobData>(
    'query-execution',
    async (job: Job<QueryExecutionJobData>) => {
      const { queryId, workspaceId, connectionId, question, isEda, userId } = job.data;
      const room = `workspace:${workspaceId}`;

      console.log(`[QueryJob] Starting execution for query: ${queryId} (question: "${question}")`);
      
      try {
        // 1. Load connection details
        const connection = await prisma.dbConnection.findUnique({
          where: { id: connectionId },
          include: { workspace: true },
        });

        if (!connection) {
          throw new Error('Database connection not found');
        }

        const customGeminiKey = connection.workspace.encryptedGeminiKey
          ? decryptString(connection.workspace.encryptedGeminiKey)
          : undefined;

        // ── Step 2: RAG — retrieve relevant schema ───────────────────────────
        await publishSocketEvent(room, 'query:progress', {
          queryId,
          stage: 'schema_retrieval',
          message: 'Searching relevant tables...',
        });

        let relevantTables = await retrieveRelevantSchema(question, connectionId, 5, customGeminiKey);
        let syncError: string | null = null;

        if (relevantTables.length === 0) {
          try {
            await publishSocketEvent(room, 'query:progress', {
              queryId,
              stage: 'schema_sync',
              message: 'Database schema not synced. Syncing schema dynamically now...',
            });
            const { syncSchemaInProcess } = await import('../modules/schema/sync-schema.utils');
            await syncSchemaInProcess(connectionId);
            relevantTables = await retrieveRelevantSchema(question, connectionId, 5, customGeminiKey);
          } catch (syncErr: any) {
            console.error('[QueryJob] Dynamic inline schema sync failed:', syncErr);
            syncError = syncErr.message || String(syncErr);
          }
        }

        if (relevantTables.length === 0) {
          await prisma.queryHistory.update({
            where: { id: queryId },
            data: { status: QueryStatus.FAILED },
          });
          const errorMsg = syncError 
            ? `Failed to sync database schema: ${syncError}`
            : 'No schema embeddings found for this connection. Please trigger schema sync first.';
          await publishSocketEvent(room, 'query:failed', {
            queryId,
            error: errorMsg,
          });
          return;
        }

        const schemaContext = buildSchemaContext(relevantTables);

        // ── Step 2.5: Resolve business glossary terms ──────────────────────────
        const glossaryTerms = await resolveGlossaryTerms(question, workspaceId, 3, 0.5, customGeminiKey);
        const glossaryContext = buildGlossaryContext(glossaryTerms);

        // ── Step 3: Generate query plan ──────────────────────────────────────
        await publishSocketEvent(room, 'query:progress', {
          queryId,
          stage: 'planning',
          message: 'Generating query plan...',
        });

        const queryPlan = await generateQueryPlan(question, schemaContext, customGeminiKey);
        await publishSocketEvent(room, 'query:plan', {
          queryId,
          plan: queryPlan,
        });

        // ── Step 4: Generate SQL with Gemini ─────────────────────────────────
        await publishSocketEvent(room, 'query:progress', {
          queryId,
          stage: 'sql_generation',
          message: 'Generating SQL...',
        });

        const generateFn = isEda ? generateEdaSQL : generateSQL;
        const { sql: rawSQL, explanation, confidence } = await generateFn(
          question,
          schemaContext,
          connection.dbType as 'POSTGRES' | 'MYSQL',
          glossaryContext,
          customGeminiKey
        );

        // ── Step 5: SQL safety validation ────────────────────────────────────
        const validation = validateSQL(rawSQL, { isEda });

        if (!validation.valid) {
          await prisma.auditLog.create({
            data: {
              workspaceId,
              userId,
              action: 'SQL_REJECTED',
              resourceType: 'QUERY',
              resourceId: queryId,
              metadata: {
                question,
                generatedSql: rawSQL,
                rejectionReason: validation.rejectionReason,
                rejectionLayer: validation.rejectionLayer,
              },
            },
          });

          await prisma.queryHistory.update({
            where: { id: queryId },
            data: {
              generatedSql: rawSQL,
              status: QueryStatus.FAILED,
            },
          });

          await publishSocketEvent(room, 'query:failed', {
            queryId,
            error: 'Generated SQL failed safety validation.',
            rejectionReason: validation.rejectionReason,
            rejectionLayer: validation.rejectionLayer,
            generatedSql: rawSQL,
          });
          return;
        }

        const safeSQL = validation.sql;
        await publishSocketEvent(room, 'query:sql_ready', {
          queryId,
          sql: safeSQL,
          explanation,
          confidence,
          modifications: validation.modifications,
        });

        // ── Step 6: Execute query ────────────────────────────────────────────
        await publishSocketEvent(room, 'query:progress', {
          queryId,
          stage: 'executing',
          message: 'Executing query...',
        });

        const connectionString = decrypt(connection.encryptedConnString);
        const queryResult = await executeQuery(connectionString, connection.dbType as DbType, safeSQL);

        // Record metrics
        queriesExecutedCounter.inc({ status: 'success' });
        queryExecutionDuration.observe(queryResult.executionMs / 1000);

        // ── Step 7: Determine chart type ─────────────────────────────────────
        const chartType = detectChartType(queryResult.fields, queryResult.rows);

        // ── Step 8: Persist to query_history ──────────────────────────────────
        const resultPreview = {
          rows: queryResult.rows.slice(0, 50), // Store only first 50 rows as preview
          fields: queryResult.fields,
          rowCount: queryResult.rowCount,
          truncated: queryResult.truncated,
        };

        await prisma.queryHistory.update({
          where: { id: queryId },
          data: {
            generatedSql: safeSQL,
            resultPreview: resultPreview as any,
            chartType,
            executionMs: queryResult.executionMs,
            status: QueryStatus.SUCCESS,
          },
        });

        // Audit log
        await prisma.auditLog.create({
          data: {
            workspaceId,
            userId,
            action: 'QUERY_EXECUTED',
            resourceType: 'QUERY',
            resourceId: queryId,
            metadata: {
              question,
              executionMs: queryResult.executionMs,
              rowCount: queryResult.rowCount,
              connectionId,
            },
          },
        });

        // ── Step 9: Cache result ─────────────────────────────────────────────
        const cachePayload = {
          sql: safeSQL,
          explanation,
          confidence,
          queryPlan,
          result: resultPreview,
          chartType,
          modifications: validation.modifications,
        };
        const hash = require('crypto')
          .createHash('sha256')
          .update(`${question}:${connectionId}`)
          .digest('hex')
          .slice(0, 24);
        const cacheKey = `query_cache:${hash}`;
        await cacheSet(cacheKey, JSON.stringify(cachePayload), CACHE_TTL_SECONDS);

        // ── Emit completion event ────────────────────────────────────────────
        await publishSocketEvent(room, 'query:completed', {
          queryId,
          chartType,
          result: {
            rows: queryResult.rows,
            fields: queryResult.fields,
            rowCount: queryResult.rowCount,
            executionMs: queryResult.executionMs,
            truncated: queryResult.truncated,
          },
        });

      } catch (err: any) {
        console.error(`[QueryJob] Execution failed for query ${queryId}:`, err);
        queriesExecutedCounter.inc({ status: 'failed' });

        await prisma.queryHistory.update({
          where: { id: queryId },
          data: { status: QueryStatus.FAILED },
        });

        await publishSocketEvent(room, 'query:failed', {
          queryId,
          error: err.message || 'Internal query execution failed',
        });
      }
    },
    {
      connection: getRedisConnection(),
      concurrency: 4, // Process max 4 queries concurrently
    }
  );

  worker.on('completed', (job) => {
    console.log(`[QueryJob] Job ${job.id} completed successfully`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[QueryJob] Job ${job?.id} failed:`, err.message);
  });

  return worker;
}
