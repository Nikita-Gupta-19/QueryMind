import dotenv from 'dotenv';
// Load environment variables before importing other modules
dotenv.config();

import { startEmbedSchemaWorker } from './jobs/embed-schema.job';
import { startDetectDriftWorker, scheduleDailyDriftChecks } from './jobs/detect-drift.job';
import { startQueryExecutionWorker } from './jobs/query-execution.job';

console.log('[Worker] Starting QueryMind background worker process...');

// Initialize workers
const embedSchemaWorker = startEmbedSchemaWorker();
console.log('[Worker] BullMQ embed-schema worker initialized');

const detectDriftWorker = startDetectDriftWorker();
console.log('[Worker] BullMQ detect-drift worker initialized');

const queryExecutionWorker = startQueryExecutionWorker();
console.log('[Worker] BullMQ query-execution worker initialized');

// Schedule recurring drift checks
scheduleDailyDriftChecks()
  .then(() => {
    console.log('[Worker] Daily schema drift checks scheduled successfully');
  })
  .catch((err) => {
    console.error('[Worker] Failed to schedule daily drift checks:', err);
  });

// Handle graceful shutdown
const gracefulShutdown = async (signal: string) => {
  console.log(`[Worker] Received ${signal}. Shutting down workers gracefully...`);
  
  await Promise.all([
    embedSchemaWorker.close(),
    detectDriftWorker.close(),
    queryExecutionWorker.close()
  ]);
  
  console.log('[Worker] Workers closed. Exiting process.');
  process.exit(0);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
