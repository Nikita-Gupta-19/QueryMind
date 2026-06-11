import { Router, Request, Response, NextFunction } from 'express';
import { DbType, WorkspaceRole } from '@prisma/client';
import { Client as PGClient } from 'pg';
import mysql from 'mysql2/promise';
import prisma from '../../config/db';
import { authenticateJWT } from '../../middleware/auth.middleware';
import { requireWorkspaceRole } from '../workspace/workspace.controller';
import { encrypt, decrypt } from './crypto.utils';

const router = Router();

// Helper to test database connection string by running SELECT 1
async function verifyDatabaseConnection(connectionString: string, dbType: DbType): Promise<void> {
  if (dbType === DbType.POSTGRES) {
    const client = new PGClient({
      connectionString,
      connectionTimeoutMillis: 5000, // 5s timeout
    });
    try {
      await client.connect();
      await client.query('SELECT 1');
    } finally {
      await client.end().catch(() => {});
    }
  } else if (dbType === DbType.MYSQL) {
    let connection;
    try {
      connection = await mysql.createConnection({
        uri: connectionString,
        connectTimeout: 5000,
      });
      await connection.query('SELECT 1');
    } finally {
      if (connection) {
        await connection.end().catch(() => {});
      }
    }
  } else {
    throw new Error('Unsupported database type.');
  }
}

// 1. Test Connection Endpoint (without saving)
router.post(
  '/:id/connections/test-raw',
  authenticateJWT,
  requireWorkspaceRole([WorkspaceRole.OWNER, WorkspaceRole.ADMIN]),
  async (req: Request, res: Response) => {
    const { dbType, connectionString } = req.body;

    if (!dbType || !connectionString) {
      return res.status(400).json({ error: 'Database type and connection string are required' });
    }

    if (!Object.values(DbType).includes(dbType)) {
      return res.status(400).json({ error: 'Invalid database type' });
    }

    try {
      await verifyDatabaseConnection(connectionString, dbType as DbType);
      return res.json({ success: true, message: 'Connection test succeeded. Target database is reachable.' });
    } catch (err: any) {
      return res.status(400).json({
        success: false,
        error: 'Database connection failed.',
        details: err.message || err,
      });
    }
  }
);

// 2. Add / Register DB Connection (Encrypted at rest)
router.post(
  '/:id/connections',
  authenticateJWT,
  requireWorkspaceRole([WorkspaceRole.OWNER, WorkspaceRole.ADMIN]),
  async (req: Request, res: Response) => {
    const { id: workspaceId } = req.params;
    const { name, dbType, connectionString } = req.body;
    const userId = (req as any).user.id;

    if (!name || !dbType || !connectionString) {
      return res.status(400).json({ error: 'Name, database type, and connection string are required' });
    }

    if (!Object.values(DbType).includes(dbType)) {
      return res.status(400).json({ error: 'Invalid database type' });
    }

    try {
      // 1. Verify the connection actually works before storing it
      try {
        await verifyDatabaseConnection(connectionString, dbType as DbType);
      } catch (connErr: any) {
        if (connErr.code === '53300') {
          console.warn('[ConnectionsController] Target database connection limit exceeded (53300), allowing save.');
        } else {
          return res.status(400).json({
            error: 'Database connection verification failed.',
            details: connErr.message || connErr,
          });
        }
      }

      // 2. Encrypt connection string
      const encryptedConnString = encrypt(connectionString);

      // 3. Save connection details in DB
      const dbConn = await prisma.dbConnection.create({
        data: {
          workspaceId,
          name,
          dbType: dbType as DbType,
          encryptedConnString,
        },
      });

      // Write Audit Log
      await prisma.auditLog.create({
        data: {
          workspaceId,
          userId,
          action: 'ADD_CONNECTION',
          resourceType: 'CONNECTION',
          resourceId: dbConn.id,
          metadata: { name, dbType },
        },
      });

      // Enqueue the schema embedding job automatically
      try {
        const { enqueueEmbedSchemaJob } = await import('../../jobs/embed-schema.job');
        await enqueueEmbedSchemaJob({ connectionId: dbConn.id, workspaceId });
      } catch (jobErr) {
        console.error('[ConnectionsController] Failed to automatically enqueue schema embedding job:', jobErr);
      }

      // Also trigger in-process schema sync in the background so it doesn't block the API response
      import('../schema/sync-schema.utils').then(({ syncSchemaInProcess }) => {
        syncSchemaInProcess(dbConn.id).catch(syncErr => {
          console.error('[ConnectionsController] Background in-process schema sync failed:', syncErr);
        });
      }).catch(err => {
        console.error('[ConnectionsController] Failed to import syncSchemaInProcess:', err);
      });

      // Respond without the encrypted string
      return res.status(201).json({
        id: dbConn.id,
        workspaceId: dbConn.workspaceId,
        name: dbConn.name,
        dbType: dbConn.dbType,
        createdAt: dbConn.createdAt,
      });

    } catch (err: any) {
      return res.status(400).json({
        error: 'Failed to save database connection.',
        details: err.message || err,
      });
    }
  }
);

// 3. List DB Connections for a Workspace (Excluding credentials)
router.get(
  '/:id/connections',
  authenticateJWT,
  requireWorkspaceRole([WorkspaceRole.OWNER, WorkspaceRole.ADMIN, WorkspaceRole.ANALYST, WorkspaceRole.VIEW]),
  async (req: Request, res: Response, next: NextFunction) => {
    const { id: workspaceId } = req.params;

    try {
      const connections = await prisma.dbConnection.findMany({
        where: { workspaceId },
        select: {
          id: true,
          workspaceId: true,
          name: true,
          dbType: true,
          lastSyncedAt: true,
          createdAt: true,
        },
      });

      return res.json(connections);
    } catch (err) {
      return next(err);
    }
  }
);

// 4. Test Stored Connection (Ping stored DB)
router.post(
  '/:id/connections/:connId/test',
  authenticateJWT,
  requireWorkspaceRole([WorkspaceRole.OWNER, WorkspaceRole.ADMIN, WorkspaceRole.ANALYST]),
  async (req: Request, res: Response, _next: NextFunction) => {
    const { connId } = req.params;

    try {
      const conn = await prisma.dbConnection.findUnique({
        where: { id: connId },
      });

      if (!conn) {
        return res.status(404).json({ error: 'Connection not found' });
      }

      // Decrypt connection string
      const connectionString = decrypt(conn.encryptedConnString);

      // Verify connection
      await verifyDatabaseConnection(connectionString, conn.dbType);

      // Update last synced / verified timestamp
      await prisma.dbConnection.update({
        where: { id: connId },
        data: { lastSyncedAt: new Date() },
      });

      return res.json({ success: true, message: 'Stored database connection is working!' });
    } catch (err: any) {
      return res.status(400).json({
        success: false,
        error: 'Stored database connection test failed.',
        details: err.message || err,
      });
    }
  }
);

// 5. Delete DB Connection
router.delete(
  '/:id/connections/:connId',
  authenticateJWT,
  requireWorkspaceRole([WorkspaceRole.OWNER, WorkspaceRole.ADMIN]),
  async (req: Request, res: Response, next: NextFunction) => {
    const { id: workspaceId, connId } = req.params;
    const userId = (req as any).user.id;

    try {
      const conn = await prisma.dbConnection.findUnique({ where: { id: connId } });
      if (!conn) {
        return res.status(404).json({ error: 'Connection not found' });
      }

      await prisma.dbConnection.delete({ where: { id: connId } });

      await prisma.auditLog.create({
        data: {
          workspaceId,
          userId,
          action: 'DELETE_CONNECTION',
          resourceType: 'CONNECTION',
          resourceId: connId,
          metadata: { name: conn.name },
        },
      });

      return res.json({ message: 'Database connection deleted successfully' });
    } catch (err) {
      return next(err);
    }
  }
);

// 5. Trigger Schema Drift Detection
router.post(
  '/:id/connections/:connId/detect-drift',
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

      // Enqueue the drift detection job
      const { enqueueDetectDriftJob } = await import('../../jobs/detect-drift.job');
      await enqueueDetectDriftJob({ connectionId: connId, workspaceId });

      return res.json({
        message: 'Schema drift detection job enqueued. Diffs and auto re-embeddings will run shortly.',
        connectionId: connId,
      });
    } catch (err) {
      return next(err);
    }
  }
);

export default router;
