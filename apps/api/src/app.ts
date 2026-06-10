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
import { startEmbedSchemaWorker } from './jobs/embed-schema.job';

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

// Health Check Route
app.get('/health', (_req: Request, res: Response) => {
  return res.json({ status: 'healthy', timestamp: new Date() });
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
  });
}

export { app, server, io, logger };
