import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Proposal } from "@prisma/client";
import { prisma } from "../db/client.js";
import { requireAuth } from "../middleware/auth.js";
import { auditLog } from "../services/auditLog.js";

// ── Access helper (same pattern as proposals.ts) ─────────────────────────────

async function canAccessProposal(
  proposalId: string,
  currentUserId: string,
  roles: string[],
): Promise<{ allowed: boolean; proposal: Proposal | null }> {
  if (roles.includes("ADMIN")) {
    const proposal = await prisma.proposal.findUnique({ where: { id: proposalId } });
    return { allowed: true, proposal };
  }
  const proposal = await prisma.proposal.findUnique({
    where: { id: proposalId },
    include: { assignments: { where: { userId: currentUserId, isActive: true } } },
  });
  if (!proposal) return { allowed: false, proposal: null };
  const isOwner = proposal.applicantUserId === currentUserId;
  const withAssignments = proposal as Proposal & {
    assignments: { userId: string; isActive: boolean }[];
  };
  const isAssigned = withAssignments.assignments.length > 0;
  return { allowed: isOwner || isAssigned, proposal };
}

// ── Zod schemas ──────────────────────────────────────────────────────────────

const idParamSchema = z.object({ id: z.string().uuid() });

const commentParamSchema = z.object({
  id: z.string().uuid(),
  commentId: z.string().uuid(),
});

const createCommentSchema = z.object({
  commentType: z.enum(["FIELD", "SECTION", "GENERAL"]),
  visibility: z.enum(["PUBLIC", "INTERNAL"]),
  body: z.string().min(1),
  targetFieldId: z.string().uuid().optional(),
  targetSectionId: z.string().uuid().optional(),
});

// ── Route plugin ─────────────────────────────────────────────────────────────

export default async function commentsRoutes(fastify: FastifyInstance) {
  // POST /api/proposals/:id/comments — create a comment
  fastify.post(
    "/api/proposals/:id/comments",
    { preHandler: requireAuth() },
    async (request, reply) => {
      const currentUser = request.currentUser!;
      const params = idParamSchema.parse(request.params);

      const { allowed, proposal } = await canAccessProposal(
        params.id,
        currentUser.id,
        currentUser.roles,
      );

      if (!proposal) {
        return reply.status(404).send({ error: "Not Found", statusCode: 404 });
      }
      if (!allowed) {
        return reply.status(403).send({ error: "Forbidden", statusCode: 403 });
      }

      const body = createCommentSchema.parse(request.body);

      // Validate FIELD comment requires targetFieldId
      if (body.commentType === "FIELD" && !body.targetFieldId) {
        return reply.status(400).send({
          error: "Bad Request",
          message: "targetFieldId is required for FIELD comments",
        });
      }

      // Validate SECTION comment requires targetSectionId
      if (body.commentType === "SECTION" && !body.targetSectionId) {
        return reply.status(400).send({
          error: "Bad Request",
          message: "targetSectionId is required for SECTION comments",
        });
      }

      // Visibility rule: APPLICANT cannot create INTERNAL comments
      const isApplicantOnly = currentUser.roles.every((r) => r === "APPLICANT");
      if (body.visibility === "INTERNAL" && isApplicantOnly) {
        return reply.status(403).send({ error: "Forbidden", statusCode: 403 });
      }

      if (!proposal.currentVersionId) {
        return reply.status(400).send({ error: "Bad Request", message: "No current version" });
      }

      const comment = await prisma.proposalComment.create({
        data: {
          proposalId: proposal.id,
          proposalVersionId: proposal.currentVersionId,
          authorUserId: currentUser.id,
          commentType: body.commentType,
          visibility: body.visibility,
          body: body.body,
          targetFieldId: body.targetFieldId ?? null,
          targetSectionId: body.targetSectionId ?? null,
          isResolved: false,
        },
      });

      await auditLog(prisma, {
        actorUserId: currentUser.id,
        actorRole: currentUser.roles[0] ?? null,
        action: "COMMENT_ADDED",
        entityType: "proposal_comments",
        entityId: comment.id,
        ipAddress: request.ip ?? null,
      });

      return reply.status(201).send({
        id: comment.id,
        commentType: comment.commentType,
        visibility: comment.visibility,
        body: comment.body,
        createdAt: comment.createdAt,
      });
    },
  );

  // GET /api/proposals/:id/comments — list comments
  fastify.get(
    "/api/proposals/:id/comments",
    { preHandler: requireAuth() },
    async (request, reply) => {
      const currentUser = request.currentUser!;
      const params = idParamSchema.parse(request.params);

      const { allowed, proposal } = await canAccessProposal(
        params.id,
        currentUser.id,
        currentUser.roles,
      );

      if (!proposal) {
        return reply.status(404).send({ error: "Not Found", statusCode: 404 });
      }
      if (!allowed) {
        return reply.status(403).send({ error: "Forbidden", statusCode: 403 });
      }

      // APPLICANT: never see INTERNAL comments
      const isApplicantOnly = currentUser.roles.every((r) => r === "APPLICANT");

      const comments = await prisma.proposalComment.findMany({
        where: {
          proposalId: params.id,
          ...(isApplicantOnly ? { visibility: { not: "INTERNAL" } } : {}),
        },
        orderBy: { createdAt: "asc" },
      });

      return reply.status(200).send(
        comments.map((c) => ({
          id: c.id,
          commentType: c.commentType,
          visibility: c.visibility,
          body: c.body,
          authorUserId: c.authorUserId,
          isResolved: c.isResolved,
          createdAt: c.createdAt,
        })),
      );
    },
  );

  // PATCH /api/proposals/:id/comments/:commentId/resolve
  fastify.patch(
    "/api/proposals/:id/comments/:commentId/resolve",
    { preHandler: requireAuth() },
    async (request, reply) => {
      const currentUser = request.currentUser!;
      const params = commentParamSchema.parse(request.params);

      const { allowed, proposal } = await canAccessProposal(
        params.id,
        currentUser.id,
        currentUser.roles,
      );

      if (!proposal) {
        return reply.status(404).send({ error: "Not Found", statusCode: 404 });
      }
      if (!allowed) {
        return reply.status(403).send({ error: "Forbidden", statusCode: 403 });
      }

      const comment = await prisma.proposalComment.findFirst({
        where: { id: params.commentId, proposalId: params.id },
      });

      if (!comment) {
        return reply.status(404).send({ error: "Not Found", statusCode: 404 });
      }

      // Only comment author or ADMIN may resolve
      const isAuthor = comment.authorUserId === currentUser.id;
      const isAdmin = currentUser.roles.includes("ADMIN");
      if (!isAuthor && !isAdmin) {
        return reply.status(403).send({ error: "Forbidden", statusCode: 403 });
      }

      const now = new Date();
      const updated = await prisma.proposalComment.update({
        where: { id: comment.id },
        data: { isResolved: true, resolvedBy: currentUser.id, resolvedAt: now },
      });

      await auditLog(prisma, {
        actorUserId: currentUser.id,
        actorRole: currentUser.roles[0] ?? null,
        action: "COMMENT_RESOLVED",
        entityType: "proposal_comments",
        entityId: comment.id,
        ipAddress: request.ip ?? null,
      });

      return reply.status(200).send({
        id: updated.id,
        isResolved: updated.isResolved,
        resolvedAt: updated.resolvedAt,
      });
    },
  );

  // PATCH /api/proposals/:id/comments/:commentId/reopen
  fastify.patch(
    "/api/proposals/:id/comments/:commentId/reopen",
    { preHandler: requireAuth() },
    async (request, reply) => {
      const currentUser = request.currentUser!;
      const params = commentParamSchema.parse(request.params);

      const { allowed, proposal } = await canAccessProposal(
        params.id,
        currentUser.id,
        currentUser.roles,
      );

      if (!proposal) {
        return reply.status(404).send({ error: "Not Found", statusCode: 404 });
      }
      if (!allowed) {
        return reply.status(403).send({ error: "Forbidden", statusCode: 403 });
      }

      const comment = await prisma.proposalComment.findFirst({
        where: { id: params.commentId, proposalId: params.id },
      });

      if (!comment) {
        return reply.status(404).send({ error: "Not Found", statusCode: 404 });
      }

      // Only comment author or ADMIN may reopen
      const isAuthor = comment.authorUserId === currentUser.id;
      const isAdmin = currentUser.roles.includes("ADMIN");
      if (!isAuthor && !isAdmin) {
        return reply.status(403).send({ error: "Forbidden", statusCode: 403 });
      }

      const updated = await prisma.proposalComment.update({
        where: { id: comment.id },
        data: { isResolved: false, resolvedBy: null, resolvedAt: null },
      });

      await auditLog(prisma, {
        actorUserId: currentUser.id,
        actorRole: currentUser.roles[0] ?? null,
        action: "COMMENT_REOPENED",
        entityType: "proposal_comments",
        entityId: comment.id,
        ipAddress: request.ip ?? null,
      });

      return reply.status(200).send({
        id: updated.id,
        isResolved: updated.isResolved,
      });
    },
  );
}
