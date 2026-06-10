import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { WorkspaceRole, QueryStatus } from '@prisma/client';
import prisma from '../../config/db';
import { authenticateJWT } from '../../middleware/auth.middleware';
import { requireWorkspaceRole } from '../workspace/workspace.controller';
import { decrypt } from '../connections/crypto.utils';
import { retrieveRelevantSchema, buildSchemaContext } from './rag';
import { generateSQL, generateQueryPlan } from './generator';
import { validateSQL } from './validator';
import { executeQuery } from './executor';
import { cacheGet, cacheSet } from '../../lib/redis';

const router = Router({ mergeParams: true });

const CACHE_TTL_SECONDS = 300; // 5 minutes

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
  '/:id/query',
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

      // ── Step 2: RAG — retrieve relevant schema via cosine similarity ────────
      if (io) {
        io.to(`workspace:${workspaceId}`).emit('query:progress', {
          queryId,
          stage: 'schema_retrieval',
          message: 'Searching relevant tables...',
        });
      }

      const relevantTables = await retrieveRelevantSchema(trimmedQuestion, connectionId, 5);

      if (relevantTables.length === 0) {
        await prisma.queryHistory.update({
          where: { id: queryId },
          data: { status: QueryStatus.FAILED },
        });
        return res.status(422).json({
          error: 'No schema embeddings found for this connection. Please trigger schema sync first.',
          hint: 'POST /api/workspaces/:id/connections/:connId/sync-schema',
        });
      }

      const schemaContext = buildSchemaContext(relevantTables);

      // ── Step 3: Generate query plan (streamed via Socket.IO) ───────────────
      if (io) {
        io.to(`workspace:${workspaceId}`).emit('query:progress', {
          queryId,
          stage: 'planning',
          message: 'Generating query plan...',
        });
      }

      const queryPlan = await generateQueryPlan(trimmedQuestion, schemaContext);

      if (io) {
        io.to(`workspace:${workspaceId}`).emit('query:plan', {
          queryId,
          plan: queryPlan,
        });
      }

      // ── Step 4: Generate SQL with Gemini 2.0 Flash ─────────────────────────
      if (io) {
        io.to(`workspace:${workspaceId}`).emit('query:progress', {
          queryId,
          stage: 'sql_generation',
          message: 'Generating SQL...',
        });
      }

      const { sql: rawSQL, explanation, confidence } = await generateSQL(
        trimmedQuestion,
        schemaContext,
        connection.dbType as 'POSTGRES' | 'MYSQL'
      );

      // ── Step 5: 4-layer SQL safety validation ──────────────────────────────
      const validation = validateSQL(rawSQL);

      if (!validation.valid) {
        // Log rejection to audit_logs
        await prisma.auditLog.create({
          data: {
            workspaceId,
            userId,
            action: 'SQL_REJECTED',
            resourceType: 'QUERY',
            resourceId: queryId,
            metadata: {
              question: trimmedQuestion,
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

        return res.status(422).json({
          queryId,
          error: 'Generated SQL failed safety validation.',
          rejectionReason: validation.rejectionReason,
          rejectionLayer: validation.rejectionLayer,
          generatedSql: rawSQL,
        });
      }

      const safeSQL = validation.sql;

      if (io) {
        io.to(`workspace:${workspaceId}`).emit('query:sql_ready', {
          queryId,
          sql: safeSQL,
          explanation,
          confidence,
          modifications: validation.modifications,
        });
      }

      // ── Step 6: Execute query ───────────────────────────────────────────────
      if (io) {
        io.to(`workspace:${workspaceId}`).emit('query:progress', {
          queryId,
          stage: 'executing',
          message: 'Executing query...',
        });
      }

      const connectionString = decrypt(connection.encryptedConnString);
      const queryResult = await executeQuery(connectionString, connection.dbType, safeSQL);

      // ── Step 7: Determine chart type from result shape ─────────────────────
      const chartType = detectChartType(queryResult.fields, queryResult.rows);

      // ── Step 8: Persist to query_history ───────────────────────────────────
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
            question: trimmedQuestion,
            executionMs: queryResult.executionMs,
            rowCount: queryResult.rowCount,
            connectionId,
          },
        },
      });

      // ── Step 9: Cache result ────────────────────────────────────────────────
      const cachePayload = {
        sql: safeSQL,
        explanation,
        confidence,
        queryPlan,
        result: resultPreview,
        chartType,
        modifications: validation.modifications,
      };
      await cacheSet(cacheKey, JSON.stringify(cachePayload), CACHE_TTL_SECONDS);

      // ── Emit completion event ───────────────────────────────────────────────
      if (io) {
        io.to(`workspace:${workspaceId}`).emit('query:completed', {
          queryId,
          executionMs: queryResult.executionMs,
          rowCount: queryResult.rowCount,
          chartType,
        });
      }

      // ── Return response ─────────────────────────────────────────────────────
      return res.json({
        queryId,
        question: trimmedQuestion,
        cached: false,
        queryPlan,
        sql: safeSQL,
        explanation,
        confidence,
        modifications: validation.modifications,
        result: {
          rows: queryResult.rows,
          fields: queryResult.fields,
          rowCount: queryResult.rowCount,
          executionMs: queryResult.executionMs,
          truncated: queryResult.truncated,
        },
        chartType,
        relevantTables: relevantTables.map((t) => ({
          tableName: t.tableName,
          similarity: Math.round(t.similarity * 100) / 100,
        })),
      });
    } catch (err: any) {
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

// ─── Chart Type Detector ──────────────────────────────────────────────────────

/**
 * Determine appropriate chart type from query result shape.
 *
 * Logic:
 * - 1 row × 1 col  → "kpi"   (big number card)
 * - 1 col, many    → "bar"
 * - 2 cols (str+num) → "bar" or "pie" (≤10 rows → pie, >10 → bar)
 * - 2 cols (date+num) → "line"
 * - 3+ cols         → "table"
 */
function detectChartType(fields: string[], rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return 'table';
  if (rows.length === 1 && fields.length === 1) return 'kpi';
  if (fields.length === 1) return 'bar';

  if (fields.length === 2) {
    const firstVal = rows[0][fields[0]];
    const secondVal = rows[0][fields[1]];

    // Check if second column is numeric
    const secondIsNumeric = typeof secondVal === 'number' ||
      (typeof secondVal === 'string' && !isNaN(Number(secondVal)));

    if (secondIsNumeric) {
      // Check if first column looks like a date
      const firstStr = String(firstVal);
      const looksLikeDate = /^\d{4}[-/]/.test(firstStr) ||
        /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(firstStr);

      if (looksLikeDate) return 'line';

      // Pie for small categorical data, bar for larger
      return rows.length <= 10 ? 'pie' : 'bar';
    }
  }

  return 'table';
}

export default router;
