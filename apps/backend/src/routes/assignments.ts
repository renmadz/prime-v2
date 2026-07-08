import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db/client.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const idParamSchema = z.object({ id: z.string().uuid() });
const assignmentIdParamSchema = z.object({
  id: z.string().uuid(),
  assignmentId: z.string().uuid(),
});
const createAssignmentBodySchema = z.object({
  userId: z.string().uuid(),
  roleCode: z.string().min(1),
});

function serializeAssignment(a: {
  id: string;
  proposalId: string;
  userId: string;
  roleCode: string;
  assignedAt: Date;
  assignedBy: string;
  isActive: boolean;
  user: { id: string; email: string; firstName: string; lastName: string };
}) {
  return {
    id: a.id,
    proposalId: a.proposalId,
    userId: a.userId,
    roleCode: a.roleCode,
    assignedAt: a.assignedAt,
    assignedBy: a.assignedBy,
    isActive: a.isActive,
    user: {
      id: a.user.id,
      email: a.user.email,
      firstName: a.user.firstName,
      lastName: a.user.lastName,
    },
  };
}

export default async function assignmentsRoutes(fastify: FastifyInstance) {
  // ── POST /api/proposals/:id/assignments ───────────────────────────────────
  fastify.post(
    "/api/proposals/:id/assignments",
    { preHandler: [requireAuth(), requireRole("ADMIN")] },
    async (request, reply) => {
      const params = idParamSchema.parse(request.params);
      const body = createAssignmentBodySchema.parse(request.body);
      const currentUser = request.currentUser!;

      const proposal = await prisma.proposal.findUnique({ where: { id: params.id } });
      if (!proposal) {
        return reply.status(404).send({ error: "Not Found", statusCode: 404 });
      }

      const targetUser = await prisma.user.findUnique({ where: { id: body.userId } });
      if (!targetUser) {
        return reply.status(422).send({
          error: "Unprocessable Entity",
          code: "USER_NOT_FOUND",
          message: "userId does not match an existing user",
          statusCode: 422,
        });
      }

      // Reactivate an existing (possibly soft-deactivated) assignment for this
      // proposal/user/role instead of creating a duplicate row.
      const existing = await prisma.proposalAssignment.findFirst({
        where: { proposalId: params.id, userId: body.userId, roleCode: body.roleCode },
      });

      const assignment = existing
        ? await prisma.proposalAssignment.update({
            where: { id: existing.id },
            data: { isActive: true, assignedBy: currentUser.id, assignedAt: new Date() },
            include: { user: { select: { id: true, email: true, firstName: true, lastName: true } } },
          })
        : await prisma.proposalAssignment.create({
            data: {
              proposalId: params.id,
              userId: body.userId,
              roleCode: body.roleCode,
              assignedBy: currentUser.id,
              isActive: true,
            },
            include: { user: { select: { id: true, email: true, firstName: true, lastName: true } } },
          });

      return reply.status(existing ? 200 : 201).send(serializeAssignment(assignment));
    },
  );

  // ── GET /api/proposals/:id/assignments ─────────────────────────────────────
  fastify.get(
    "/api/proposals/:id/assignments",
    { preHandler: [requireAuth(), requireRole("ADMIN")] },
    async (request, reply) => {
      const params = idParamSchema.parse(request.params);

      const proposal = await prisma.proposal.findUnique({ where: { id: params.id } });
      if (!proposal) {
        return reply.status(404).send({ error: "Not Found", statusCode: 404 });
      }

      const assignments = await prisma.proposalAssignment.findMany({
        where: { proposalId: params.id, isActive: true },
        include: { user: { select: { id: true, email: true, firstName: true, lastName: true } } },
        orderBy: { assignedAt: "desc" },
      });

      return reply.status(200).send(assignments.map(serializeAssignment));
    },
  );

  // ── DELETE /api/proposals/:id/assignments/:assignmentId ────────────────────
  fastify.delete(
    "/api/proposals/:id/assignments/:assignmentId",
    { preHandler: [requireAuth(), requireRole("ADMIN")] },
    async (request, reply) => {
      const params = assignmentIdParamSchema.parse(request.params);

      const assignment = await prisma.proposalAssignment.findFirst({
        where: { id: params.assignmentId, proposalId: params.id },
      });
      if (!assignment) {
        return reply.status(404).send({ error: "Not Found", statusCode: 404 });
      }

      const updated = await prisma.proposalAssignment.update({
        where: { id: params.assignmentId },
        data: { isActive: false },
        include: { user: { select: { id: true, email: true, firstName: true, lastName: true } } },
      });

      return reply.status(200).send(serializeAssignment(updated));
    },
  );
}
