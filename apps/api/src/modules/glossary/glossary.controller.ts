import { Router, Request, Response, NextFunction } from 'express';
import { WorkspaceRole } from '@prisma/client';
import prisma from '../../config/db';
import { authenticateJWT } from '../../middleware/auth.middleware';
import { requireWorkspaceRole } from '../workspace/workspace.controller';
import { generateEmbedding } from '../../lib/embeddings';

const router = Router();

// 1. List Glossary Terms
router.get(
  '/:id/glossary',
  authenticateJWT,
  requireWorkspaceRole([WorkspaceRole.OWNER, WorkspaceRole.ADMIN, WorkspaceRole.ANALYST, WorkspaceRole.VIEW]),
  async (req: Request, res: Response, next: NextFunction) => {
    const { id: workspaceId } = req.params;

    try {
      const terms = await prisma.glossaryTerm.findMany({
        where: { workspaceId },
        orderBy: { createdAt: 'desc' },
      });

      return res.json({ terms });
    } catch (err) {
      return next(err);
    }
  }
);

// 2. Create Glossary Term
router.post(
  '/:id/glossary',
  authenticateJWT,
  requireWorkspaceRole([WorkspaceRole.OWNER, WorkspaceRole.ADMIN, WorkspaceRole.ANALYST]),
  async (req: Request, res: Response, next: NextFunction) => {
    const { id: workspaceId } = req.params;
    const { businessTerm, schemaTerm, description } = req.body;
    const userId = (req as any).user?.id;

    if (!businessTerm || !schemaTerm) {
      return res.status(400).json({ error: 'businessTerm and schemaTerm are required.' });
    }

    try {
      // Generate embedding for the business term
      let embedding: number[];
      try {
        embedding = await generateEmbedding(businessTerm.trim().toLowerCase());
      } catch (err) {
        console.warn('[Glossary] Embedding generation failed. Falling back to mock 1536-dim vector.', err);
        embedding = new Array(1536).fill(0);
      }

      const embeddingStr = `[${embedding.join(',')}]`;

      // Check if term already exists in this workspace
      const existing = await prisma.glossaryTerm.findFirst({
        where: {
          workspaceId,
          businessTerm: {
            equals: businessTerm.trim(),
            mode: 'insensitive',
          },
        },
      });

      if (existing) {
        // Update existing glossary term using raw SQL to write embedding
        await prisma.$executeRawUnsafe(
          `UPDATE "GlossaryTerm"
           SET "schemaTerm" = $1, description = $2, embedding = $3::vector
           WHERE id = $4::uuid AND "workspaceId" = $5::uuid`,
          schemaTerm.trim(),
          description || null,
          embeddingStr,
          existing.id,
          workspaceId
        );

        // Fetch updated term (excluding embedding unsupported column natively)
        const updated = await prisma.glossaryTerm.findUnique({
          where: { id: existing.id },
        });

        // Audit Log
        await prisma.auditLog.create({
          data: {
            workspaceId,
            userId,
            action: 'UPDATE_GLOSSARY_TERM',
            resourceType: 'GLOSSARY',
            resourceId: existing.id,
            metadata: { businessTerm, schemaTerm },
          },
        });

        return res.json(updated);
      } else {
        // Insert new glossary term using raw SQL
        const termId = crypto.randomUUID();
        await prisma.$executeRawUnsafe(
          `INSERT INTO "GlossaryTerm" (id, "workspaceId", "businessTerm", "schemaTerm", description, embedding, "createdAt")
           VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6::vector, NOW())`,
          termId,
          workspaceId,
          businessTerm.trim(),
          schemaTerm.trim(),
          description || null,
          embeddingStr
        );

        const created = await prisma.glossaryTerm.findUnique({
          where: { id: termId },
        });

        // Audit Log
        await prisma.auditLog.create({
          data: {
            workspaceId,
            userId,
            action: 'CREATE_GLOSSARY_TERM',
            resourceType: 'GLOSSARY',
            resourceId: termId,
            metadata: { businessTerm, schemaTerm },
          },
        });

        return res.status(201).json(created);
      }
    } catch (err) {
      return next(err);
    }
  }
);

// 3. Delete Glossary Term
router.delete(
  '/:id/glossary/:termId',
  authenticateJWT,
  requireWorkspaceRole([WorkspaceRole.OWNER, WorkspaceRole.ADMIN, WorkspaceRole.ANALYST]),
  async (req: Request, res: Response, next: NextFunction) => {
    const { id: workspaceId, termId } = req.params;
    const userId = (req as any).user?.id;

    try {
      const term = await prisma.glossaryTerm.findFirst({
        where: { id: termId, workspaceId },
      });

      if (!term) {
        return res.status(404).json({ error: 'Glossary term not found in this workspace.' });
      }

      await prisma.glossaryTerm.delete({
        where: { id: termId },
      });

      // Audit Log
      await prisma.auditLog.create({
        data: {
          workspaceId,
          userId,
          action: 'DELETE_GLOSSARY_TERM',
          resourceType: 'GLOSSARY',
          resourceId: termId,
          metadata: { businessTerm: term.businessTerm, schemaTerm: term.schemaTerm },
        },
      });

      return res.json({ message: 'Glossary term deleted successfully.' });
    } catch (err) {
      return next(err);
    }
  }
);

export default router;
