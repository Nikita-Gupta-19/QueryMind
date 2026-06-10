import express, { Request, Response, NextFunction } from 'express';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import winston from 'winston';
import dotenv from 'dotenv';

// Load environment variables before importing other modules
dotenv.config();

import passport from './modules/auth/passport';
import authRouter from './modules/auth/auth.controller';
import workspaceRouter from './modules/workspace/workspace.controller';
import connectionRouter from './modules/connections/connections.controller';
import queryRouter from './modules/query/query.controller';
import glossaryRouter from './modules/glossary/glossary.controller';
import dashboardRouter from './modules/dashboard/dashboard.controller';
import agentRouter from './modules/agent/agent.controller';
import { startEmbedSchemaWorker } from './jobs/embed-schema.job';
import { startDetectDriftWorker, scheduleDailyDriftChecks } from './jobs/detect-drift.job';
import { prometheusRegistry } from './lib/metrics';

const app = express();
const server = http.createServer(app);

// Winston Logger config
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    }),
  ],
});

// Configure CORS
app.use(cors({
  origin: '*', // Allow all origins for dev/sandbox purposes
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Passport Middleware
app.use(passport.initialize());

// Setup Socket.IO
const io = new SocketIOServer(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

io.on('connection', (socket) => {
  logger.info(`Socket connected: ${socket.id}`);

  socket.on('disconnect', () => {
    logger.info(`Socket disconnected: ${socket.id}`);
  });
});

// Attach io instance to express app to make it accessible in routes/controllers
app.set('io', io);

// Request logger middleware
app.use((req: Request, _res: Response, next: NextFunction) => {
  logger.info(`${req.method} ${req.url}`);
  next();
});

// API Routes
app.use('/api/auth', authRouter);
app.use('/api/workspaces', workspaceRouter);
app.use('/api/workspaces', connectionRouter); // e.g. /api/workspaces/:id/connections
app.use('/api/workspaces', queryRouter);      // e.g. /api/workspaces/:id/query
app.use('/api/workspaces', glossaryRouter);   // e.g. /api/workspaces/:id/glossary
app.use('/api/workspaces', dashboardRouter);  // e.g. /api/workspaces/:id/dashboards
app.use('/api/workspaces', agentRouter);      // e.g. /api/workspaces/:id/agent
app.use('/api/dashboards', dashboardRouter);  // e.g. /api/dashboards/share/:token

// Root Route
app.get('/', (_req: Request, res: Response) => {
  return res.json({ message: 'QueryMind API Server is online', health: '/health', metrics: '/metrics' });
});



// Diagnostics DB Sync Route
import { exec } from 'child_process';
import { promisify } from 'util';
const execAsync = promisify(exec);

app.get('/api/diagnostics/db-sync', async (_req: Request, res: Response) => {
  try {
    const { stdout, stderr } = await execAsync('npx prisma db push --accept-data-loss', {
      env: { ...process.env }
    });
    return res.json({
      success: true,
      stdout,
      stderr
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      message: err.message,
      stdout: err.stdout,
      stderr: err.stderr,
      stack: err.stack
    });
  }
});

// Diagnostics Embed Schema Route
import { introspectDatabase } from './modules/schema/introspector';
import { generateEmbeddingsBatch } from './lib/embeddings';
import { decrypt } from './modules/connections/crypto.utils';
import { DbType } from '@prisma/client';

app.get('/api/diagnostics/embed-schema/:connId', async (req: Request, res: Response) => {
  const { connId } = req.params;
  const logs: string[] = [];
  try {
    const prisma = (await import('./config/db')).default;
    logs.push(`Fetching connection: ${connId}`);
    const conn = await prisma.dbConnection.findUnique({ where: { id: connId } });
    if (!conn) throw new Error(`Connection ${connId} not found`);

    logs.push(`Decrypting connection string...`);
    const connectionString = decrypt(conn.encryptedConnString);

    logs.push(`Introspecting database...`);
    const tables = await introspectDatabase(connectionString, conn.dbType as DbType);
    logs.push(`Found ${tables.length} tables`);

    if (tables.length > 0) {
      logs.push(`Generating embeddings for ${tables.length} tables...`);
      const descriptions = tables.map((t) => t.description || '');
      const embeddings = await generateEmbeddingsBatch(descriptions);
      logs.push(`Generated ${embeddings.length} embeddings`);

      logs.push(`Deleting stale embeddings...`);
      await prisma.schemaEmbedding.deleteMany({ where: { connectionId: connId } });

      logs.push(`Inserting new embeddings...`);
      for (let i = 0; i < tables.length; i++) {
        const table = tables[i];
        const embedding = embeddings[i];
        const embeddingStr = `[${embedding.join(',')}]`;

        await prisma.$executeRawUnsafe(
          `INSERT INTO "schema_embeddings" 
             (id, "connectionId", "tableName", "columnNames", description, embedding, "updatedAt")
           VALUES (gen_random_uuid(), $1::uuid, $2, $3, $4, $5::vector, NOW())`,
          connId,
          table.tableName,
          table.columns.map((c) => c.columnName),
          table.description || '',
          embeddingStr
        );
      }
      logs.push(`Embeddings inserted successfully`);
    }

    return res.json({
      success: true,
      logs
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      logs,
      error: err.message,
      stack: err.stack
    });
  }
});

// Health Check Route
app.get('/health', (_req: Request, res: Response) => {
  return res.json({ status: 'healthy', timestamp: new Date() });
});


// Prometheus Metrics Route
app.get('/metrics', async (_req: Request, res: Response) => {
  res.set('Content-Type', prometheusRegistry.contentType);
  return res.end(await prometheusRegistry.metrics());
});

// Global Error Handler Middleware
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  logger.error('Unhandled Exception:', err);
  
  const status = err.status || err.statusCode || 500;
  const message = err.message || 'Internal Server Error';
  
  return res.status(status).json({
    error: message,
    code: err.code || 'INTERNAL_ERROR',
    ...(process.env.NODE_ENV === 'development' ? { stack: err.stack } : {}),
  });
});

const PORT = process.env.PORT || 4000;

if (process.env.NODE_ENV !== 'test') {
  server.listen(PORT, () => {
    logger.info(`QueryMind API server running on port ${PORT}`);

    // Start BullMQ workers
    startEmbedSchemaWorker();
    logger.info('BullMQ embed-schema worker started');

    startDetectDriftWorker();
    logger.info('BullMQ detect-drift worker started');

    scheduleDailyDriftChecks().catch((err) => logger.error('Failed to schedule daily drift checks:', err));
  });
}

export { app, server, io, logger };
