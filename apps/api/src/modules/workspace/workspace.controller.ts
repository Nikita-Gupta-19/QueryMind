import { Router, Request, Response, NextFunction } from 'express';
import { WorkspaceRole } from '@prisma/client';
import prisma from '../../config/db';
import { authenticateJWT } from '../../middleware/auth.middleware';

const router = Router();

// Express Request declaration override for workspace membership
interface AuthenticatedRequest extends Request {
  user?: any;
  workspaceMember?: {
    workspaceId: string;
    userId: string;
    role: WorkspaceRole;
  };
}

// Workspace Authorization Middleware
export function requireWorkspaceRole(allowedRoles: WorkspaceRole[]) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const { id: workspaceId } = req.params;
    const userId = req.user?.id;

    if (!workspaceId || !userId) {
      return res.status(400).json({ error: 'Workspace ID and User context are required' });
    }

    try {
      const member = await prisma.workspaceMember.findUnique({
        where: {
          workspaceId_userId: {
            workspaceId,
            userId,
          },
        },
      });

      if (!member) {
        return res.status(403).json({ error: 'Forbidden: You are not a member of this workspace' });
      }

      if (!allowedRoles.includes(member.role)) {
        return res.status(403).json({ error: 'Forbidden: Insufficient permissions within workspace' });
      }

      req.workspaceMember = member;
      return next();
    } catch (err) {
      return next(err);
    }
  };
}

// 1. Create Workspace
router.post('/', authenticateJWT, async (req: Request, res: Response, next: NextFunction) => {
  const { name } = req.body;
  const userId = (req as any).user.id;

  if (!name) {
    return res.status(400).json({ error: 'Workspace name is required' });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      // Create the workspace
      const workspace = await tx.workspace.create({
        data: {
          name,
          ownerId: userId,
        },
      });

      // Add owner as OWNER member
      const membership = await tx.workspaceMember.create({
        data: {
          workspaceId: workspace.id,
          userId,
          role: WorkspaceRole.OWNER,
        },
      });

      return { workspace, membership };
    });

    // Create Audit Log
    await prisma.auditLog.create({
      data: {
        workspaceId: result.workspace.id,
        userId,
        action: 'CREATE_WORKSPACE',
        resourceType: 'WORKSPACE',
        resourceId: result.workspace.id,
        metadata: { name },
      },
    });

    return res.status(201).json(result.workspace);
  } catch (err) {
    return next(err);
  }
});

// 2. List User Workspaces
router.get('/', authenticateJWT, async (req: Request, res: Response, next: NextFunction) => {
  const userId = (req as any).user.id;

  try {
    const memberships = await prisma.workspaceMember.findMany({
      where: { userId },
      include: {
        workspace: {
          include: {
            owner: {
              select: { id: true, email: true, name: true },
            },
          },
        },
      },
    });

    const workspaces = memberships.map((m) => ({
      id: m.workspace.id,
      name: m.workspace.name,
      role: m.role,
      owner: m.workspace.owner,
      createdAt: m.workspace.createdAt,
    }));

    return res.json(workspaces);
  } catch (err) {
    return next(err);
  }
});

// 3. Get Workspace Details
router.get('/:id', authenticateJWT, requireWorkspaceRole([WorkspaceRole.OWNER, WorkspaceRole.ADMIN, WorkspaceRole.ANALYST, WorkspaceRole.VIEW]), async (req: Request, res: Response, next: NextFunction) => {
  const { id } = req.params;

  try {
    const workspace = await prisma.workspace.findUnique({
      where: { id },
      include: {
        owner: {
          select: { id: true, email: true, name: true },
        },
        members: {
          include: {
            user: {
              select: { id: true, email: true, name: true, avatarUrl: true },
            },
          },
        },
        dbConnections: {
          select: {
            id: true,
            name: true,
            dbType: true,
            lastSyncedAt: true,
            createdAt: true,
          },
        },
      },
    });

    if (!workspace) {
      return res.status(404).json({ error: 'Workspace not found' });
    }

    return res.json(workspace);
  } catch (err) {
    return next(err);
  }
});

// 4. Update Workspace Name
router.put('/:id', authenticateJWT, requireWorkspaceRole([WorkspaceRole.OWNER, WorkspaceRole.ADMIN]), async (req: Request, res: Response, next: NextFunction) => {
  const { id } = req.params;
  const { name } = req.body;
  const userId = (req as any).user.id;

  if (!name) {
    return res.status(400).json({ error: 'Workspace name is required' });
  }

  try {
    const updated = await prisma.workspace.update({
      where: { id },
      data: { name },
    });

    await prisma.auditLog.create({
      data: {
        workspaceId: id,
        userId,
        action: 'UPDATE_WORKSPACE',
        resourceType: 'WORKSPACE',
        resourceId: id,
        metadata: { name },
      },
    });

    return res.json(updated);
  } catch (err) {
    return next(err);
  }
});

// 5. Delete Workspace
router.delete('/:id', authenticateJWT, requireWorkspaceRole([WorkspaceRole.OWNER]), async (req: Request, res: Response, next: NextFunction) => {
  const { id } = req.params;
  const userId = (req as any).user.id;

  try {
    await prisma.workspace.delete({ where: { id } });

    await prisma.auditLog.create({
      data: {
        userId,
        action: 'DELETE_WORKSPACE',
        resourceType: 'WORKSPACE',
        resourceId: id,
        metadata: { id },
      },
    });

    return res.json({ message: 'Workspace deleted successfully' });
  } catch (err) {
    return next(err);
  }
});

// 6. Invite / Add Member by Email
router.post('/:id/members/invite', authenticateJWT, requireWorkspaceRole([WorkspaceRole.OWNER, WorkspaceRole.ADMIN]), async (req: Request, res: Response, next: NextFunction) => {
  const { id: workspaceId } = req.params;
  const { email, role } = req.body;
  const userId = (req as any).user.id;

  if (!email || !role) {
    return res.status(400).json({ error: 'Email and role are required' });
  }

  if (!Object.values(WorkspaceRole).includes(role)) {
    return res.status(400).json({ error: 'Invalid workspace role' });
  }

  try {
    // Find if user exists
    const targetUser = await prisma.user.findUnique({ where: { email } });
    if (!targetUser) {
      return res.status(404).json({ error: `User with email ${email} not found in the system. Let them register first.` });
    }

    // Check if already a member
    const existingMember = await prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId,
          userId: targetUser.id,
        },
      },
    });

    if (existingMember) {
      return res.status(400).json({ error: 'User is already a member of this workspace' });
    }

    const membership = await prisma.workspaceMember.create({
      data: {
        workspaceId,
        userId: targetUser.id,
        role: role as WorkspaceRole,
      },
      include: {
        user: {
          select: { id: true, email: true, name: true },
        },
      },
    });

    await prisma.auditLog.create({
      data: {
        workspaceId,
        userId,
        action: 'INVITE_MEMBER',
        resourceType: 'MEMBER',
        resourceId: targetUser.id,
        metadata: { email, role },
      },
    });

    return res.status(201).json(membership);
  } catch (err) {
    return next(err);
  }
});

// 7. Update Member Role
router.put('/:id/members', authenticateJWT, requireWorkspaceRole([WorkspaceRole.OWNER, WorkspaceRole.ADMIN]), async (req: Request, res: Response, next: NextFunction) => {
  const { id: workspaceId } = req.params;
  const { userId: targetUserId, role } = req.body;
  const activeUserId = (req as any).user.id;

  if (!targetUserId || !role) {
    return res.status(400).json({ error: 'User ID and role are required' });
  }

  if (!Object.values(WorkspaceRole).includes(role)) {
    return res.status(400).json({ error: 'Invalid workspace role' });
  }

  try {
    // Check if target is owner. Owner role cannot be changed casually.
    const targetMembership = await prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId,
          userId: targetUserId,
        },
      },
    });

    if (!targetMembership) {
      return res.status(404).json({ error: 'Member not found' });
    }

    if (targetMembership.role === WorkspaceRole.OWNER && role !== WorkspaceRole.OWNER) {
      return res.status(400).json({ error: 'Cannot change the workspace owner\'s role. Transfer ownership instead.' });
    }

    const updated = await prisma.workspaceMember.update({
      where: {
        workspaceId_userId: {
          workspaceId,
          userId: targetUserId,
        },
      },
      data: { role: role as WorkspaceRole },
    });

    await prisma.auditLog.create({
      data: {
        workspaceId,
        userId: activeUserId,
        action: 'UPDATE_MEMBER_ROLE',
        resourceType: 'MEMBER',
        resourceId: targetUserId,
        metadata: { role },
      },
    });

    return res.json(updated);
  } catch (err) {
    return next(err);
  }
});

// 8. Remove Member from Workspace
router.delete('/:id/members', authenticateJWT, requireWorkspaceRole([WorkspaceRole.OWNER, WorkspaceRole.ADMIN]), async (req: Request, res: Response, next: NextFunction) => {
  const { id: workspaceId } = req.params;
  const { userId: targetUserId } = req.body;
  const activeUserId = (req as any).user.id;

  if (!targetUserId) {
    return res.status(400).json({ error: 'User ID is required' });
  }

  try {
    const targetMembership = await prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId,
          userId: targetUserId,
        },
      },
    });

    if (!targetMembership) {
      return res.status(404).json({ error: 'Member not found' });
    }

    if (targetMembership.role === WorkspaceRole.OWNER) {
      return res.status(400).json({ error: 'Cannot remove the workspace owner.' });
    }

    await prisma.workspaceMember.delete({
      where: {
        workspaceId_userId: {
          workspaceId,
          userId: targetUserId,
        },
      },
    });

    await prisma.auditLog.create({
      data: {
        workspaceId,
        userId: activeUserId,
        action: 'REMOVE_MEMBER',
        resourceType: 'MEMBER',
        resourceId: targetUserId,
      },
    });

    return res.json({ message: 'Member removed successfully' });
  } catch (err) {
    return next(err);
  }
});

export default router;
