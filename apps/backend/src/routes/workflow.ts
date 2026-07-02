import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db/client.js";
import { requireAuth } from "../middleware/auth.js";
import { validateTransition, WorkflowError } from "../services/workflowEngine.js";

// ── Zod schemas ──────────────────────────────────────────────────────────────

const idParamSchema = z.object({ id: z.string().uuid() });

const returnToApplicantBodySchema = z.object({
  comment: z.string().min(1),
});

const endorseToRtecBodySchema = z.object({
  rtecGroupId: z.string().uuid(),
  comment: z.string().optional(),
});

const returnToRtecBodySchema = z.object({
  comment: z.string().min(1),
});

const endorseToBudgetBodySchema = z.object({
  comment: z.string().optional(),
});

// ── Assignment check helper ──────────────────────────────────────────────────

async function assertFocalAssignment(
  proposalId: string,
  userId: string,
  tx: import("@prisma/client").Prisma.TransactionClient,
): Promise<void> {
  const assignment = await tx.proposalAssignment.findFirst({
    where: { proposalId, userId, roleCode: "PROJECT_FOCAL", isActive: true },
  });
  if (!assignment) {
    throw new WorkflowError(403, "NOT_ASSIGNED", "You are not assigned as Project Focal for this proposal");
  }
}

// ── Route plugin ─────────────────────────────────────────────────────────────

export default async function workflowRoutes(fastify: FastifyInstance) {

  // ── POST /api/proposals/:id/workflow/acknowledge ───────────────────────────
  fastify.post(
    "/api/proposals/:id/workflow/acknowledge",
    { preHandler: requireAuth() },
    async (request, reply) => {
      const currentUser = request.currentUser!;
      const params = idParamSchema.parse(request.params);

      if (!currentUser.roles.includes("PROJECT_FOCAL")) {
        return reply.status(403).send({ error: "Forbidden", statusCode: 403 });
      }

      try {
        const result = await prisma.$transaction(async (tx) => {
          await assertFocalAssignment(params.id, currentUser.id, tx);
          const { proposal, transition } = await validateTransition(
            params.id, "ACKNOWLEDGE", "PROJECT_FOCAL", tx,
          );

          const versionNumber = (proposal as any).currentVersion?.versionNumber ?? 0;

          const updated = await tx.proposal.update({
            where: { id: params.id },
            data: { status: transition.toStatus },
          });

          await tx.proposalWorkflowHistory.create({
            data: {
              proposalId: params.id,
              fromStatus: transition.fromStatus,
              toStatus: transition.toStatus,
              actorUserId: currentUser.id,
              actorRole: "PROJECT_FOCAL",
              workflowAction: "ACKNOWLEDGE",
              proposalVersionNumber: versionNumber,
              sessionReference: request.ip ?? null,
            },
          });

          await tx.auditLog.create({
            data: {
              actorUserId: currentUser.id,
              actorRole: "PROJECT_FOCAL",
              action: "WORKFLOW_ACKNOWLEDGE",
              entityType: "proposals",
              entityId: params.id,
              beforeState: JSON.stringify({ status: transition.fromStatus }),
              afterState: JSON.stringify({ status: transition.toStatus }),
              ipAddress: request.ip ?? null,
            },
          });

          return updated;
        });

        return reply.status(200).send({
          id: result.id,
          status: result.status,
          transitionedAt: new Date().toISOString(),
        });
      } catch (err) {
        if (err instanceof WorkflowError) {
          return reply.status(err.statusCode).send({
            error: err.statusCode === 409 ? "Conflict" : err.statusCode === 422 ? "Unprocessable Entity" : "Forbidden",
            code: err.code,
            message: err.message,
            statusCode: err.statusCode,
          });
        }
        throw err;
      }
    },
  );

  // ── POST /api/proposals/:id/workflow/return-to-applicant ──────────────────
  fastify.post(
    "/api/proposals/:id/workflow/return-to-applicant",
    { preHandler: requireAuth() },
    async (request, reply) => {
      const currentUser = request.currentUser!;
      const params = idParamSchema.parse(request.params);

      if (!currentUser.roles.includes("PROJECT_FOCAL")) {
        return reply.status(403).send({ error: "Forbidden", statusCode: 403 });
      }

      // Validate body BEFORE opening transaction — 422 if comment missing
      let body: z.infer<typeof returnToApplicantBodySchema>;
      try {
        body = returnToApplicantBodySchema.parse(request.body);
      } catch {
        return reply.status(422).send({
          error: "Unprocessable Entity",
          code: "COMMENT_REQUIRED",
          message: "A comment is required for return-to-applicant",
          statusCode: 422,
        });
      }

      try {
        const result = await prisma.$transaction(async (tx) => {
          await assertFocalAssignment(params.id, currentUser.id, tx);
          const { proposal, transition } = await validateTransition(
            params.id, "RETURN_TO_APPLICANT", "PROJECT_FOCAL", tx,
          );

          const versionNumber = (proposal as any).currentVersion?.versionNumber ?? 0;

          const updated = await tx.proposal.update({
            where: { id: params.id },
            data: { status: transition.toStatus },
          });

          await tx.proposalWorkflowHistory.create({
            data: {
              proposalId: params.id,
              fromStatus: transition.fromStatus,
              toStatus: transition.toStatus,
              actorUserId: currentUser.id,
              actorRole: "PROJECT_FOCAL",
              workflowAction: "RETURN_TO_APPLICANT",
              proposalVersionNumber: versionNumber,
              comment: body.comment,
              sessionReference: request.ip ?? null,
            },
          });

          await tx.auditLog.create({
            data: {
              actorUserId: currentUser.id,
              actorRole: "PROJECT_FOCAL",
              action: "WORKFLOW_RETURN_TO_APPLICANT",
              entityType: "proposals",
              entityId: params.id,
              beforeState: JSON.stringify({ status: transition.fromStatus }),
              afterState: JSON.stringify({ status: transition.toStatus }),
              ipAddress: request.ip ?? null,
            },
          });

          // Notify applicant
          await tx.notification.create({
            data: {
              recipientUserId: proposal.applicantUserId,
              proposalId: params.id,
              eventType: "PROPOSAL_RETURNED_TO_APPLICANT",
              message: "Your proposal has been returned with comments. Please review and resubmit.",
            },
          });

          return updated;
        });

        return reply.status(200).send({
          id: result.id,
          status: result.status,
          transitionedAt: new Date().toISOString(),
        });
      } catch (err) {
        if (err instanceof WorkflowError) {
          return reply.status(err.statusCode).send({
            error: err.statusCode === 409 ? "Conflict" : err.statusCode === 422 ? "Unprocessable Entity" : "Forbidden",
            code: err.code,
            message: err.message,
            statusCode: err.statusCode,
          });
        }
        throw err;
      }
    },
  );

  // ── POST /api/proposals/:id/workflow/endorse-to-rtec ─────────────────────
  fastify.post(
    "/api/proposals/:id/workflow/endorse-to-rtec",
    { preHandler: requireAuth() },
    async (request, reply) => {
      const currentUser = request.currentUser!;
      const params = idParamSchema.parse(request.params);

      if (!currentUser.roles.includes("PROJECT_FOCAL")) {
        return reply.status(403).send({ error: "Forbidden", statusCode: 403 });
      }

      let body: z.infer<typeof endorseToRtecBodySchema>;
      try {
        body = endorseToRtecBodySchema.parse(request.body);
      } catch {
        return reply.status(422).send({
          error: "Unprocessable Entity",
          code: "VALIDATION_ERROR",
          message: "rtecGroupId (UUID) is required",
          statusCode: 422,
        });
      }

      try {
        const result = await prisma.$transaction(async (tx) => {
          await assertFocalAssignment(params.id, currentUser.id, tx);
          const { proposal, transition } = await validateTransition(
            params.id, "ENDORSE_TO_RTEC", "PROJECT_FOCAL", tx,
          );

          const versionNumber = (proposal as any).currentVersion?.versionNumber ?? 0;

          const updated = await tx.proposal.update({
            where: { id: params.id },
            data: { status: transition.toStatus },
          });

          await tx.proposalWorkflowHistory.create({
            data: {
              proposalId: params.id,
              fromStatus: transition.fromStatus,
              toStatus: transition.toStatus,
              actorUserId: currentUser.id,
              actorRole: "PROJECT_FOCAL",
              workflowAction: "ENDORSE_TO_RTEC",
              proposalVersionNumber: versionNumber,
              comment: body.comment ?? null,
              sessionReference: request.ip ?? null,
            },
          });

          await tx.auditLog.create({
            data: {
              actorUserId: currentUser.id,
              actorRole: "PROJECT_FOCAL",
              action: "WORKFLOW_ENDORSE_TO_RTEC",
              entityType: "proposals",
              entityId: params.id,
              beforeState: JSON.stringify({ status: transition.fromStatus }),
              afterState: JSON.stringify({ status: transition.toStatus }),
              ipAddress: request.ip ?? null,
            },
          });

          // TODO Phase 11: notify RTEC members via rtec_memberships
          // When RtecMembership model is available, query active members of body.rtecGroupId
          // and create one Notification per member with eventType PROPOSAL_ENDORSED_TO_RTEC

          void body; // suppress unused warning after TODO
          return updated;
        });

        return reply.status(200).send({
          id: result.id,
          status: result.status,
          transitionedAt: new Date().toISOString(),
        });
      } catch (err) {
        if (err instanceof WorkflowError) {
          return reply.status(err.statusCode).send({
            error: err.statusCode === 409 ? "Conflict" : err.statusCode === 422 ? "Unprocessable Entity" : "Forbidden",
            code: err.code,
            message: err.message,
            statusCode: err.statusCode,
          });
        }
        throw err;
      }
    },
  );

  // ── POST /api/proposals/:id/workflow/return-to-rtec ───────────────────────
  fastify.post(
    "/api/proposals/:id/workflow/return-to-rtec",
    { preHandler: requireAuth() },
    async (request, reply) => {
      const currentUser = request.currentUser!;
      const params = idParamSchema.parse(request.params);

      if (!currentUser.roles.includes("PROJECT_FOCAL")) {
        return reply.status(403).send({ error: "Forbidden", statusCode: 403 });
      }

      let body: z.infer<typeof returnToRtecBodySchema>;
      try {
        body = returnToRtecBodySchema.parse(request.body);
      } catch {
        return reply.status(422).send({
          error: "Unprocessable Entity",
          code: "COMMENT_REQUIRED",
          message: "A comment is required for return-to-rtec",
          statusCode: 422,
        });
      }

      try {
        const result = await prisma.$transaction(async (tx) => {
          await assertFocalAssignment(params.id, currentUser.id, tx);
          const { proposal, transition } = await validateTransition(
            params.id, "RETURN_TO_RTEC", "PROJECT_FOCAL", tx,
          );

          const versionNumber = (proposal as any).currentVersion?.versionNumber ?? 0;

          const updated = await tx.proposal.update({
            where: { id: params.id },
            data: { status: transition.toStatus },
          });

          await tx.proposalWorkflowHistory.create({
            data: {
              proposalId: params.id,
              fromStatus: transition.fromStatus,
              toStatus: transition.toStatus,
              actorUserId: currentUser.id,
              actorRole: "PROJECT_FOCAL",
              workflowAction: "RETURN_TO_RTEC",
              proposalVersionNumber: versionNumber,
              comment: body.comment,
              sessionReference: request.ip ?? null,
            },
          });

          await tx.auditLog.create({
            data: {
              actorUserId: currentUser.id,
              actorRole: "PROJECT_FOCAL",
              action: "WORKFLOW_RETURN_TO_RTEC",
              entityType: "proposals",
              entityId: params.id,
              beforeState: JSON.stringify({ status: transition.fromStatus }),
              afterState: JSON.stringify({ status: transition.toStatus }),
              ipAddress: request.ip ?? null,
            },
          });

          // TODO Phase 11: notify RTEC members
          void proposal; // suppress unused warning

          return updated;
        });

        return reply.status(200).send({
          id: result.id,
          status: result.status,
          transitionedAt: new Date().toISOString(),
        });
      } catch (err) {
        if (err instanceof WorkflowError) {
          return reply.status(err.statusCode).send({
            error: err.statusCode === 409 ? "Conflict" : err.statusCode === 422 ? "Unprocessable Entity" : "Forbidden",
            code: err.code,
            message: err.message,
            statusCode: err.statusCode,
          });
        }
        throw err;
      }
    },
  );

  // ── POST /api/proposals/:id/workflow/endorse-to-budget ────────────────────
  fastify.post(
    "/api/proposals/:id/workflow/endorse-to-budget",
    { preHandler: requireAuth() },
    async (request, reply) => {
      const currentUser = request.currentUser!;
      const params = idParamSchema.parse(request.params);

      if (!currentUser.roles.includes("PROJECT_FOCAL")) {
        return reply.status(403).send({ error: "Forbidden", statusCode: 403 });
      }

      const body = endorseToBudgetBodySchema.safeParse(request.body);

      try {
        const result = await prisma.$transaction(async (tx) => {
          await assertFocalAssignment(params.id, currentUser.id, tx);
          const { proposal, transition } = await validateTransition(
            params.id, "ENDORSE_TO_BUDGET", "PROJECT_FOCAL", tx,
          );

          const versionNumber = (proposal as any).currentVersion?.versionNumber ?? 0;

          const updated = await tx.proposal.update({
            where: { id: params.id },
            data: { status: transition.toStatus },
          });

          await tx.proposalWorkflowHistory.create({
            data: {
              proposalId: params.id,
              fromStatus: transition.fromStatus,
              toStatus: transition.toStatus,
              actorUserId: currentUser.id,
              actorRole: "PROJECT_FOCAL",
              workflowAction: "ENDORSE_TO_BUDGET",
              proposalVersionNumber: versionNumber,
              comment: body.success ? (body.data.comment ?? null) : null,
              sessionReference: request.ip ?? null,
            },
          });

          await tx.auditLog.create({
            data: {
              actorUserId: currentUser.id,
              actorRole: "PROJECT_FOCAL",
              action: "WORKFLOW_ENDORSE_TO_BUDGET",
              entityType: "proposals",
              entityId: params.id,
              beforeState: JSON.stringify({ status: transition.fromStatus }),
              afterState: JSON.stringify({ status: transition.toStatus }),
              ipAddress: request.ip ?? null,
            },
          });

          // Notify active BUDGET_OFFICER assignments on this proposal
          const budgetAssignments = await tx.proposalAssignment.findMany({
            where: { proposalId: params.id, roleCode: "BUDGET_OFFICER", isActive: true },
          });
          for (const assignment of budgetAssignments) {
            await tx.notification.create({
              data: {
                recipientUserId: assignment.userId,
                proposalId: params.id,
                eventType: "PROPOSAL_ENDORSED_TO_BUDGET",
                message: "A proposal has been endorsed to Budget for your review.",
              },
            });
          }

          void proposal;
          return updated;
        });

        return reply.status(200).send({
          id: result.id,
          status: result.status,
          transitionedAt: new Date().toISOString(),
        });
      } catch (err) {
        if (err instanceof WorkflowError) {
          return reply.status(err.statusCode).send({
            error: err.statusCode === 409 ? "Conflict" : err.statusCode === 422 ? "Unprocessable Entity" : "Forbidden",
            code: err.code,
            message: err.message,
            statusCode: err.statusCode,
          });
        }
        throw err;
      }
    },
  );

  // ── GET /api/proposals/:id/workflow/history ───────────────────────────────
  fastify.get(
    "/api/proposals/:id/workflow/history",
    { preHandler: requireAuth() },
    async (request, reply) => {
      const currentUser = request.currentUser!;
      const params = idParamSchema.parse(request.params);

      // Load proposal for access check
      const proposal = await prisma.proposal.findUnique({
        where: { id: params.id },
        include: {
          assignments: { where: { userId: currentUser.id, isActive: true } },
        },
      });

      if (!proposal) {
        return reply.status(404).send({ error: "Not Found", statusCode: 404 });
      }

      const isAdmin = currentUser.roles.includes("ADMIN");
      const isOwner = proposal.applicantUserId === currentUser.id;
      const isAssigned = (proposal as any).assignments?.length > 0;

      if (!isAdmin && !isOwner && !isAssigned) {
        return reply.status(403).send({ error: "Forbidden", statusCode: 403 });
      }

      const history = await prisma.proposalWorkflowHistory.findMany({
        where: { proposalId: params.id },
        orderBy: { transitionedAt: "asc" },
      });

      return reply.status(200).send({ history });
    },
  );
}
