import { Queue, Worker, Job } from 'bullmq';
import crypto from 'crypto';
import prisma from '../config/db';
import { getRedisConnection } from '../lib/redis';
import { decrypt } from '../modules/connections/crypto.utils';
import { introspectDatabase, computeSchemaFingerprint, TableSchema } from '../modules/schema/introspector';
import { enqueueEmbedSchemaJob } from './embed-schema.job';
import { publishSocketEvent } from '../lib/pubsub';


// ─── Queue Definition ─────────────────────────────────────────────────────────

export const detectDriftQueue = new Queue('detect-drift', {
  connection: getRedisConnection(),
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'exponential', delay: 10000 },
    removeOnComplete: 100,
    removeOnFail: 50,
  },
});

export interface DetectDriftJobData {
  connectionId: string;
  workspaceId: string;
}

/**
 * Enqueue a manual/immediate drift check.
 */
export async function enqueueDetectDriftJob(data: DetectDriftJobData): Promise<void> {
  await detectDriftQueue.add('detect-drift', data, {
    jobId: `drift-${data.connectionId}-${Date.now()}`,
  });
}

/**
 * Schedule recurring daily schema drift checks for all connections.
 */
export async function scheduleDailyDriftChecks(): Promise<void> {
  // Clear any existing repeatable jobs to avoid duplicates
  const repeatableJobs = await detectDriftQueue.getRepeatableJobs();
  for (const job of repeatableJobs) {
    await detectDriftQueue.removeRepeatableByKey(job.key);
  }

  // Add a repeatable job that runs daily at 2 AM
  await detectDriftQueue.add(
    'daily-drift-check-scheduler',
    {},
    {
      repeat: { pattern: '0 2 * * *' },
      jobId: 'daily-drift-scheduler',
    }
  );
}

// ─── Drift Diffs Helper ───────────────────────────────────────────────────────

export interface DriftDiffResult {
  driftDetected: boolean;
  addedTables: string[];
  removedTables: string[];
  changedTables: Array<{
    tableName: string;
    addedColumns: string[];
    removedColumns: string[];
  }>;
}

export function diffSchemaStructure(
  lastEmbeddings: Array<{ tableName: string; columnNames: string[] }>,
  liveTables: TableSchema[]
): DriftDiffResult {
  const lastMap = new Map<string, string[]>(
    lastEmbeddings.map((t) => [t.tableName, t.columnNames])
  );
  const liveMap = new Map<string, string[]>(
    liveTables.map((t) => [t.tableName, t.columns.map((c) => c.columnName)])
  );

  const addedTables: string[] = [];
  const removedTables: string[] = [];
  const changedTables: DriftDiffResult['changedTables'] = [];

  // 1. Check for added tables or column changes in existing tables
  for (const [tableName, liveCols] of liveMap.entries()) {
    const lastCols = lastMap.get(tableName);
    if (!lastCols) {
      addedTables.push(tableName);
    } else {
      const liveSet = new Set(liveCols);
      const lastSet = new Set(lastCols);

      const addedColumns = liveCols.filter((c) => !lastSet.has(c));
      const removedColumns = lastCols.filter((c) => !liveSet.has(c));

      if (addedColumns.length > 0 || removedColumns.length > 0) {
        changedTables.push({
          tableName,
          addedColumns,
          removedColumns,
        });
      }
    }
  }

  // 2. Check for removed tables
  for (const tableName of lastMap.keys()) {
    if (!liveMap.has(tableName)) {
      removedTables.push(tableName);
    }
  }

  const driftDetected =
    addedTables.length > 0 || removedTables.length > 0 || changedTables.length > 0;

  return {
    driftDetected,
    addedTables,
    removedTables,
    changedTables,
  };
}

// ─── Worker ───────────────────────────────────────────────────────────────────

export function startDetectDriftWorker(): Worker {
  const worker = new Worker<any>(
    'detect-drift',
    async (job: Job<any>) => {
      // Scheduler job simply dispatches drift checks for all connections in the database
      if (job.name === 'daily-drift-check-scheduler') {
        console.log('[DetectDrift] Running daily drift scheduler for all connections...');
        const connections = await prisma.dbConnection.findMany({
          select: { id: true, workspaceId: true },
        });

        for (const conn of connections) {
          await enqueueDetectDriftJob({
            connectionId: conn.id,
            workspaceId: conn.workspaceId,
          });
        }
        return { scheduledChecksCount: connections.length };
      }

      // Individual connection drift check
      const { connectionId, workspaceId } = job.data as DetectDriftJobData;
      console.log(`[DetectDrift] Analyzing drift on connection: ${connectionId}`);

      const conn = await prisma.dbConnection.findUnique({
        where: { id: connectionId },
      });

      if (!conn) throw new Error(`Connection ${connectionId} not found`);

      // 1. Fetch last synced embeddings to rebuild schema structure representation
      const lastEmbeddings = await prisma.schemaEmbedding.findMany({
        where: { connectionId },
        select: { tableName: true, columnNames: true },
      });

      if (lastEmbeddings.length === 0) {
        console.log(`[DetectDrift] No sync embeddings found for ${conn.name}. Syncing first time.`);
        await enqueueEmbedSchemaJob({ connectionId, workspaceId });
        return { action: 'initial_sync_enqueued' };
      }

      // Re-calculate last fingerprint
      const lastStructure = lastEmbeddings
        .sort((a, b) => a.tableName.localeCompare(b.tableName))
        .map((t) => `${t.tableName}:${t.columnNames.sort().join(',')}`)
        .join('|');
      const lastFingerprint = crypto.createHash('sha256').update(lastStructure).digest('hex').slice(0, 16);

      // 2. Introspect live DB
      const connectionString = decrypt(conn.encryptedConnString);
      const liveTables = await introspectDatabase(connectionString, conn.dbType);
      const liveFingerprint = computeSchemaFingerprint(liveTables);

      console.log(`[DetectDrift] Fingerprints - Sync: ${lastFingerprint}, Live: ${liveFingerprint}`);

      if (lastFingerprint === liveFingerprint) {
        console.log(`[DetectDrift] ✅ No schema drift detected for connection ${conn.name}`);
        return { driftDetected: false };
      }

      // 3. Diff structure to identify changes
      const diff = diffSchemaStructure(lastEmbeddings, liveTables);
      console.warn(`[DetectDrift] ⚠️ Schema drift detected for connection ${conn.name}:`, diff);

      // 4. Trigger re-embedding job to sync embeddings
      await enqueueEmbedSchemaJob({ connectionId, workspaceId });

      // 5. Save audit log detail
      await prisma.auditLog.create({
        data: {
          workspaceId,
          action: 'SCHEMA_DRIFT_DETECTED',
          resourceType: 'CONNECTION',
          resourceId: connectionId,
          metadata: {
            connectionName: conn.name,
            lastFingerprint,
            liveFingerprint,
            diff: diff as any,
          },
        },
      });

      // 6. Notify active workspace users via Socket.IO Redis bridge
      await publishSocketEvent(`workspace:${workspaceId}`, 'schema:drift', {
        connectionId,
        connectionName: conn.name,
        diff,
      });

      return {
        driftDetected: true,
        diff,
      };
    },
    {
      connection: getRedisConnection(),
      concurrency: 2,
    }
  );

  return worker;
}

