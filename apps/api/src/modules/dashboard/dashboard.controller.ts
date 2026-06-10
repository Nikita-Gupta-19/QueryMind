import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { WorkspaceRole } from '@prisma/client';
import prisma from '../../config/db';
import { authenticateJWT } from '../../middleware/auth.middleware';
import { requireWorkspaceRole } from '../workspace/workspace.controller';

const router = Router();

// ─── Unauthenticated Public Share Endpoint ──────────────────────────────────
// Must be registered BEFORE endpoints with ':id' parameters to avoid conflicts.
router.get(
  '/share/:token',
  async (req: Request, res: Response, next: NextFunction) => {
    const { token } = req.params;

    try {
      const dashboard = await prisma.dashboard.findUnique({
        where: { publicToken: token },
        include: {
          items: {
            include: {
              queryHistory: {
                select: {
                  id: true,
                  question: true,
                  generatedSql: true,
                  resultPreview: true,
                  chartType: true,
                  executionMs: true,
                  status: true,
                  createdAt: true,
                },
              },
            },
          },
        },
      });

      if (!dashboard || !dashboard.isPublic) {
        return res.status(404).json({ error: 'Public dashboard not found or access revoked.' });
      }

      return res.json({ dashboard });
    } catch (err) {
      return next(err);
    }
  }
);

// ─── Workspace Authorized Dashboard Endpoints ────────────────────────────────

// 1. List Dashboards in Workspace
router.get(
  '/:id/dashboards',
  authenticateJWT,
  requireWorkspaceRole([WorkspaceRole.OWNER, WorkspaceRole.ADMIN, WorkspaceRole.ANALYST, WorkspaceRole.VIEW]),
  async (req: Request, res: Response, next: NextFunction) => {
    const { id: workspaceId } = req.params;

    try {
      const dashboards = await prisma.dashboard.findMany({
        where: { workspaceId },
        include: {
          items: {
            include: {
              queryHistory: {
                select: {
                  id: true,
                  question: true,
                  generatedSql: true,
                  resultPreview: true,
                  chartType: true,
                  executionMs: true,
                  status: true,
                  createdAt: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      return res.json({ dashboards });
    } catch (err) {
      return next(err);
    }
  }
);

// 2. Create Dashboard
router.post(
  '/:id/dashboards',
  authenticateJWT,
  requireWorkspaceRole([WorkspaceRole.OWNER, WorkspaceRole.ADMIN, WorkspaceRole.ANALYST]),
  async (req: Request, res: Response, next: NextFunction) => {
    const { id: workspaceId } = req.params;
    const { name, isPublic } = req.body;
    const userId = (req as any).user?.id;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ error: 'Dashboard name is required.' });
    }

    try {
      const publicToken = isPublic ? crypto.randomBytes(24).toString('hex') : null;

      const dashboard = await prisma.dashboard.create({
        data: {
          workspaceId,
          name: name.trim(),
          isPublic: !!isPublic,
          publicToken,
        },
      });

      // Audit Log
      await prisma.auditLog.create({
        data: {
          workspaceId,
          userId,
          action: 'CREATE_DASHBOARD',
          resourceType: 'DASHBOARD',
          resourceId: dashboard.id,
          metadata: { name: dashboard.name, isPublic: dashboard.isPublic },
        },
      });

      return res.status(201).json(dashboard);
    } catch (err) {
      return next(err);
    }
  }
);

// 3. Update Dashboard Settings
router.put(
  '/:id/dashboards/:dashId',
  authenticateJWT,
  requireWorkspaceRole([WorkspaceRole.OWNER, WorkspaceRole.ADMIN, WorkspaceRole.ANALYST]),
  async (req: Request, res: Response, next: NextFunction) => {
    const { id: workspaceId, dashId } = req.params;
    const { name, isPublic } = req.body;
    const userId = (req as any).user?.id;

    try {
      const existing = await prisma.dashboard.findFirst({
        where: { id: dashId, workspaceId },
      });

      if (!existing) {
        return res.status(404).json({ error: 'Dashboard not found in this workspace.' });
      }

      // Handle token update on privacy toggle
      let publicToken = existing.publicToken;
      if (isPublic && !existing.isPublic) {
        publicToken = crypto.randomBytes(24).toString('hex');
      } else if (!isPublic) {
        publicToken = null;
      }

      const updated = await prisma.dashboard.update({
        where: { id: dashId },
        data: {
          name: name !== undefined ? name.trim() : existing.name,
          isPublic: isPublic !== undefined ? !!isPublic : existing.isPublic,
          publicToken,
        },
      });

      // Audit Log
      await prisma.auditLog.create({
        data: {
          workspaceId,
          userId,
          action: 'UPDATE_DASHBOARD',
          resourceType: 'DASHBOARD',
          resourceId: dashId,
          metadata: { isPublic: updated.isPublic },
        },
      });

      return res.json(updated);
    } catch (err) {
      return next(err);
    }
  }
);

// 4. Delete Dashboard
router.delete(
  '/:id/dashboards/:dashId',
  authenticateJWT,
  requireWorkspaceRole([WorkspaceRole.OWNER, WorkspaceRole.ADMIN]),
  async (req: Request, res: Response, next: NextFunction) => {
    const { id: workspaceId, dashId } = req.params;
    const userId = (req as any).user?.id;

    try {
      const dashboard = await prisma.dashboard.findFirst({
        where: { id: dashId, workspaceId },
      });

      if (!dashboard) {
        return res.status(404).json({ error: 'Dashboard not found in this workspace.' });
      }

      await prisma.dashboard.delete({
        where: { id: dashId },
      });

      // Audit Log
      await prisma.auditLog.create({
        data: {
          workspaceId,
          userId,
          action: 'DELETE_DASHBOARD',
          resourceType: 'DASHBOARD',
          resourceId: dashId,
          metadata: { name: dashboard.name },
        },
      });

      return res.json({ message: 'Dashboard deleted successfully.' });
    } catch (err) {
      return next(err);
    }
  }
);

// 5. Add Item to Dashboard
router.post(
  '/:id/dashboards/:dashId/items',
  authenticateJWT,
  requireWorkspaceRole([WorkspaceRole.OWNER, WorkspaceRole.ADMIN, WorkspaceRole.ANALYST]),
  async (req: Request, res: Response, next: NextFunction) => {
    const { id: workspaceId, dashId } = req.params;
    const { queryHistoryId, chartType, gridPosition, refreshIntervalMins } = req.body;

    if (!queryHistoryId) {
      return res.status(400).json({ error: 'queryHistoryId is required.' });
    }

    try {
      // Verify dashboard belongs to this workspace
      const dashboard = await prisma.dashboard.findFirst({
        where: { id: dashId, workspaceId },
      });
      if (!dashboard) {
        return res.status(404).json({ error: 'Dashboard not found in this workspace.' });
      }

      // Verify query history belongs to this workspace
      const query = await prisma.queryHistory.findFirst({
        where: { id: queryHistoryId, workspaceId },
      });
      if (!query) {
        return res.status(404).json({ error: 'Query history record not found.' });
      }

      const item = await prisma.dashboardItem.create({
        data: {
          dashboardId: dashId,
          queryHistoryId,
          chartType: chartType || query.chartType || 'table',
          gridPosition: gridPosition || null,
          refreshIntervalMins: refreshIntervalMins || null,
        },
        include: {
          queryHistory: true,
        },
      });

      return res.status(201).json(item);
    } catch (err) {
      return next(err);
    }
  }
);

// 6. Delete Item from Dashboard
router.delete(
  '/:id/dashboards/:dashId/items/:itemId',
  authenticateJWT,
  requireWorkspaceRole([WorkspaceRole.OWNER, WorkspaceRole.ADMIN, WorkspaceRole.ANALYST]),
  async (req: Request, res: Response, next: NextFunction) => {
    const { id: workspaceId, dashId, itemId } = req.params;

    try {
      // Verify dashboard belongs to this workspace
      const dashboard = await prisma.dashboard.findFirst({
        where: { id: dashId, workspaceId },
      });
      if (!dashboard) {
        return res.status(404).json({ error: 'Dashboard not found in this workspace.' });
      }

      const item = await prisma.dashboardItem.findFirst({
        where: { id: itemId, dashboardId: dashId },
      });

      if (!item) {
        return res.status(404).json({ error: 'Dashboard item not found.' });
      }

      await prisma.dashboardItem.delete({
        where: { id: itemId },
      });

      return res.json({ message: 'Dashboard item removed successfully.' });
    } catch (err) {
      return next(err);
    }
  }
);

export default router;
