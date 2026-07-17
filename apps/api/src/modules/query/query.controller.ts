import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { WorkspaceRole, QueryStatus } from '@prisma/client';
import prisma from '../../config/db';
import { authenticateJWT } from '../../middleware/auth.middleware';
import { requireWorkspaceRole } from '../workspace/workspace.controller';
import { cacheGet } from '../../lib/redis';
import { queriesExecutedCounter, cacheHitsCounter } from '../../lib/metrics';

const router = Router({ mergeParams: true });

// ─── Helper: build cache key ──────────────────────────────────────────────────

function buildCacheKey(question: string, connectionId: string): string {
  const hash = crypto
    .createHash('sha256')
    .update(`${question}:${connectionId}`)
    .digest('hex')
    .slice(0, 24);
  return `query_cache:${hash}`;
}

// ─── POST /api/workspaces/:id/query ──────────────────────────────────────────
/**
 * Main query endpoint — takes a natural language question and returns
 * validated SQL, execution results, and chart metadata.
 *
 * Pipeline:
 * 1. Validate inputs & auth
 * 2. Check Redis cache
 * 3. RAG: embed question → cosine similarity → retrieve relevant schema
 * 4. Gemini: generate query plan (streamed via Socket.IO)
 * 5. Gemini: generate SQL with chain-of-thought
 * 6. 4-layer SQL safety validator
 * 7. Execute query with 10s timeout
 * 8. Persist to query_history
 * 9. Cache result & return
 */
router.post(
  ['/:id/query', '/:id/eda'],
  authenticateJWT,
  requireWorkspaceRole([WorkspaceRole.OWNER, WorkspaceRole.ADMIN, WorkspaceRole.ANALYST]),
  async (req: Request, res: Response, next: NextFunction) => {
    const { id: workspaceId } = req.params;
    const { question, connectionId } = req.body;
    const userId = (req as any).user.id;
    const io = req.app.get('io');

    // ── Input validation ────────────────────────────────────────────────────
    if (!question || typeof question !== 'string' || question.trim().length < 3) {
      return res.status(400).json({ error: 'A valid question is required (min 3 characters).' });
    }

    if (!connectionId) {
      return res.status(400).json({ error: 'connectionId is required.' });
    }

    const trimmedQuestion = question.trim();

    // ── Verify connection belongs to this workspace ─────────────────────────
    const connection = await prisma.dbConnection.findFirst({
      where: { id: connectionId, workspaceId },
      include: {
        workspace: true
      }
    });

    if (!connection) {
      return res.status(404).json({ error: 'Database connection not found in this workspace.' });
    }


    // ── Create a RUNNING query history entry early (for real-time tracking) ──
    const queryRecord = await prisma.queryHistory.create({
      data: {
        workspaceId,
        userId,
        connectionId,
        question: trimmedQuestion,
        status: QueryStatus.RUNNING,
      },
    });

    const queryId = queryRecord.id;

    // Emit socket event so frontend knows query started
    if (io) {
      io.to(`workspace:${workspaceId}`).emit('query:started', { queryId, question: trimmedQuestion });
    }

    try {
      // ── Step 1: Check Redis cache ──────────────────────────────────────────
      const cacheKey = buildCacheKey(trimmedQuestion, connectionId);
      const cached = await cacheGet(cacheKey);

      if (cached) {
        cacheHitsCounter.inc();
        const cachedResult = JSON.parse(cached);
        // Update query record as cache hit
        await prisma.queryHistory.update({
          where: { id: queryId },
          data: {
            generatedSql: cachedResult.sql,
            resultPreview: cachedResult.result,
            chartType: cachedResult.chartType,
            executionMs: 0,
            status: QueryStatus.SUCCESS,
          },
        });

        return res.json({
          queryId,
          question: trimmedQuestion,
          cached: true,
          ...cachedResult,
        });
      }

      // ── Step 2: Enqueue query execution job in background ──────────────────
      const isEda = req.path.endsWith('/eda');
      const { enqueueQueryExecutionJob } = await import('../../jobs/query-execution.job');
      await enqueueQueryExecutionJob({
        queryId,
        workspaceId,
        connectionId,
        question: trimmedQuestion,
        isEda,
        userId,
      });

      return res.json({
        queryId,
        question: trimmedQuestion,
        status: 'QUEUED',
        message: 'Query queued for background execution.',
      });
    } catch (err: any) {
      queriesExecutedCounter.inc({ status: 'failed' });
      // Mark query as failed
      await prisma.queryHistory.update({
        where: { id: queryId },
        data: { status: QueryStatus.FAILED },
      }).catch(() => {});

      if (io) {
        io.to(`workspace:${workspaceId}`).emit('query:failed', {
          queryId,
          error: err.message,
        });
      }

      return next(err);
    }
  }
);

// ─── GET /api/workspaces/:id/query/history ────────────────────────────────────

router.get(
  '/:id/query/history',
  authenticateJWT,
  requireWorkspaceRole([WorkspaceRole.OWNER, WorkspaceRole.ADMIN, WorkspaceRole.ANALYST, WorkspaceRole.VIEW]),
  async (req: Request, res: Response, next: NextFunction) => {
    const { id: workspaceId } = req.params;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = parseInt(req.query.offset as string) || 0;

    try {
      const [history, total] = await Promise.all([
        prisma.queryHistory.findMany({
          where: { workspaceId },
          orderBy: { createdAt: 'desc' },
          take: limit,
          skip: offset,
          select: {
            id: true,
            question: true,
            generatedSql: true,
            chartType: true,
            executionMs: true,
            status: true,
            createdAt: true,
            user: { select: { name: true, email: true } },
            connection: { select: { name: true, dbType: true } },
          },
        }),
        prisma.queryHistory.count({ where: { workspaceId } }),
      ]);

      return res.json({ history, total, limit, offset });
    } catch (err) {
      return next(err);
    }
  }
);

// ─── POST /api/workspaces/:id/connections/:connId/sync-schema ─────────────────

router.post(
  '/:id/connections/:connId/sync-schema',
  authenticateJWT,
  requireWorkspaceRole([WorkspaceRole.OWNER, WorkspaceRole.ADMIN]),
  async (req: Request, res: Response, next: NextFunction) => {
    const { id: workspaceId, connId } = req.params;

    try {
      const conn = await prisma.dbConnection.findFirst({
        where: { id: connId, workspaceId },
      });

      if (!conn) {
        return res.status(404).json({ error: 'Connection not found in this workspace.' });
      }

      // Import and enqueue the job (lazy import to avoid circular deps)
      const { enqueueEmbedSchemaJob } = await import('../../jobs/embed-schema.job');
      await enqueueEmbedSchemaJob({ connectionId: connId, workspaceId });

      return res.json({
        message: 'Schema sync job enqueued. Embeddings will be ready shortly.',
        connectionId: connId,
      });
    } catch (err) {
      return next(err);
    }
  }
);

export default router;
