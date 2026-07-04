import { Router, Request, Response, NextFunction } from 'express';
import { WorkspaceRole } from '@prisma/client';
import prisma from '../../config/db';
import { authenticateJWT } from '../../middleware/auth.middleware';
import { requireWorkspaceRole } from '../workspace/workspace.controller';
import { runAnalystAgent } from './analyst-agent';
import { agentRunsCounter } from '../../lib/metrics';
import { decryptString } from '../../lib/encryption';

const router = Router();

// POST /api/workspaces/:id/agent
router.post(
  '/:id/agent',
  authenticateJWT,
  requireWorkspaceRole([WorkspaceRole.OWNER, WorkspaceRole.ADMIN, WorkspaceRole.ANALYST]),
  async (req: Request, res: Response, next: NextFunction) => {
    const { id: workspaceId } = req.params;
    const { question, connectionId } = req.body;
    const userId = (req as any).user?.id;
    const io = req.app.get('io');

    if (!question || typeof question !== 'string' || question.trim().length < 5) {
      return res.status(400).json({ error: 'A valid question is required (min 5 characters).' });
    }

    if (!connectionId) {
      return res.status(400).json({ error: 'connectionId is required.' });
    }

    const trimmedQuestion = question.trim();

    try {
      const workspace = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { encryptedGeminiKey: true }
      });
      const customGeminiKey = workspace?.encryptedGeminiKey ? decryptString(workspace.encryptedGeminiKey) : undefined;

      agentRunsCounter.inc({ status: 'started' });

      // Emit start event
      if (io) {
        io.to(`workspace:${workspaceId}`).emit('agent:started', { question: trimmedQuestion });
      }

      const answer = await runAnalystAgent(
        trimmedQuestion,
        connectionId,
        workspaceId,
        (step) => {
          console.log('[AgentController] Step thought:', step.thought);
          if (io) {
            io.to(`workspace:${workspaceId}`).emit('agent:step', { step });
          }
        },
        (result) => {
          console.log('[AgentController] Tool result action:', result.action);
          if (io) {
            io.to(`workspace:${workspaceId}`).emit('agent:result', { result });
          }
        },
        customGeminiKey
      );

      // Audit Log
      await prisma.auditLog.create({
        data: {
          workspaceId,
          userId,
          action: 'AGENT_RUN_SUCCESS',
          resourceType: 'AGENT',
          resourceId: connectionId,
          metadata: { question: trimmedQuestion, answer },
        },
      });

      agentRunsCounter.inc({ status: 'success' });

      // Emit complete event
      if (io) {
        io.to(`workspace:${workspaceId}`).emit('agent:completed', { answer });
      }

      return res.json({ answer });
    } catch (err: any) {
      agentRunsCounter.inc({ status: 'failed' });

      // Emit fail event
      if (io) {
        io.to(`workspace:${workspaceId}`).emit('agent:failed', { error: err.message });
      }

      return next(err);
    }
  }
);

export default router;
