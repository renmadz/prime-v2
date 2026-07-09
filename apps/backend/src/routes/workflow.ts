import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db/client.js";
import { requireAuth } from "../middleware/auth.js";
import { assertNotFinalized, validateTransition, WorkflowError } from "../services/workflowEngine.js";
import {
  getActiveRtecGroupForProposal,
  notifyRtecGroup,
  performRtecSubmitRecommendation,
} from "../services/rtecEngine.js";

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

          await tx.proposal.update({
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

          // Assign every active member/head of the endorsed RTEC group to this
          // proposal (mirrors the Focal/Budget assignment pattern) so RTEC
          // routes can verify "am I assigned to this proposal" the same way.
          const memberships = await tx.rtecMembership.findMany({
            where: { rtecGroupId: body.rtecGroupId, isActive: true },
          });
          for (const membership of memberships) {
            const existingAssignment = await tx.proposalAssignment.findFirst({
              where: {
                proposalId: params.id,
                userId: membership.userId,
                roleCode: membership.roleInGroup === "HEAD" ? "RTEC_HEAD" : "RTEC_MEMBER",
                isActive: true,
              },
            });
            if (!existingAssignment) {
              await tx.proposalAssignment.create({
                data: {
                  proposalId: params.id,
                  userId: membership.userId,
                  roleCode: membership.roleInGroup === "HEAD" ? "RTEC_HEAD" : "RTEC_MEMBER",
                  assignedBy: currentUser.id,
                  isActive: true,
                },
              });
            }
          }

          await notifyRtecGroup(
            body.rtecGroupId,
            params.id,
            "PROPOSAL_ENDORSED_TO_RTEC",
            "A proposal has been endorsed to your RTEC group for review.",
            tx,
          );

          // Auto-advance ENDORSED_TO_RTEC -> UNDER_RTEC_REVIEW now that RTEC
          // assignment is confirmed (no separate manual confirmation step
          // exists in this MVP). actorRole is SYSTEM to match the seeded
          // transition row; the human actor (Focal) is already recorded above.
          const autoAdvance = await validateTransition(
            params.id, "CONFIRM_RTEC_ASSIGNMENT", "SYSTEM", tx,
          );
          const autoUpdated = await tx.proposal.update({
            where: { id: params.id },
            data: { status: autoAdvance.transition.toStatus },
          });
          await tx.proposalWorkflowHistory.create({
            data: {
              proposalId: params.id,
              fromStatus: autoAdvance.transition.fromStatus,
              toStatus: autoAdvance.transition.toStatus,
              actorUserId: currentUser.id,
              actorRole: "PROJECT_FOCAL",
              workflowAction: "CONFIRM_RTEC_ASSIGNMENT",
              proposalVersionNumber: versionNumber,
              sessionReference: request.ip ?? null,
            },
          });
          await tx.auditLog.create({
            data: {
              actorUserId: currentUser.id,
              actorRole: "PROJECT_FOCAL",
              action: "WORKFLOW_CONFIRM_RTEC_ASSIGNMENT",
              entityType: "proposals",
              entityId: params.id,
              beforeState: JSON.stringify({ status: autoAdvance.transition.fromStatus }),
              afterState: JSON.stringify({ status: autoAdvance.transition.toStatus }),
              ipAddress: request.ip ?? null,
            },
          });

          return autoUpdated;
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

          const rtecGroupId = await getActiveRtecGroupForProposal(params.id, tx);
          await notifyRtecGroup(
            rtecGroupId,
            params.id,
            "PROPOSAL_RETURNED_TO_RTEC",
            "The Project Focal has returned this proposal to your RTEC group for re-review.",
            tx,
          );

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

  // ── POST /api/proposals/:id/workflow/rtec-begin-consolidation ─────────────
  fastify.post(
    "/api/proposals/:id/workflow/rtec-begin-consolidation",
    { preHandler: requireAuth() },
    async (request, reply) => {
      const currentUser = request.currentUser!;
      const params = idParamSchema.parse(request.params);

      if (!currentUser.roles.includes("RTEC_HEAD")) {
        return reply.status(403).send({ error: "Forbidden", statusCode: 403 });
      }

      try {
        const result = await prisma.$transaction(async (tx) => {
          const assignment = await tx.proposalAssignment.findFirst({
            where: { proposalId: params.id, userId: currentUser.id, roleCode: "RTEC_HEAD", isActive: true },
          });
          if (!assignment) {
            throw new WorkflowError(403, "NOT_ASSIGNED", "You are not assigned as RTEC Head for this proposal");
          }

          const { proposal, transition } = await validateTransition(
            params.id, "RTEC_BEGIN_CONSOLIDATION", "RTEC_HEAD", tx,
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
              actorRole: "RTEC_HEAD",
              workflowAction: "RTEC_BEGIN_CONSOLIDATION",
              proposalVersionNumber: versionNumber,
              sessionReference: request.ip ?? null,
            },
          });

          await tx.auditLog.create({
            data: {
              actorUserId: currentUser.id,
              actorRole: "RTEC_HEAD",
              action: "WORKFLOW_RTEC_BEGIN_CONSOLIDATION",
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

  // ── POST /api/proposals/:id/workflow/rtec-submit-recommendation ───────────
  fastify.post(
    "/api/proposals/:id/workflow/rtec-submit-recommendation",
    { preHandler: requireAuth() },
    async (request, reply) => {
      const currentUser = request.currentUser!;
      const params = idParamSchema.parse(request.params);

      if (!currentUser.roles.includes("RTEC_HEAD")) {
        return reply.status(403).send({ error: "Forbidden", statusCode: 403 });
      }

      try {
        const result = await prisma.$transaction(async (tx) => {
          const assignment = await tx.proposalAssignment.findFirst({
            where: { proposalId: params.id, userId: currentUser.id, roleCode: "RTEC_HEAD", isActive: true },
          });
          if (!assignment) {
            throw new WorkflowError(403, "NOT_ASSIGNED", "You are not assigned as RTEC Head for this proposal");
          }

          return performRtecSubmitRecommendation(params.id, currentUser.id, tx);
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

  // ── POST /api/proposals/:id/workflow/focal-reroute ────────────────────────
  // Project Focal re-routes a proposal that the Accountant returned directly
  // (RETURNED_BY_ACCOUNTING → UNDER_FOCAL_REVIEW), skipping Budget entirely.
  fastify.post(
    "/api/proposals/:id/workflow/focal-reroute",
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
          message: "A comment is required for focal-reroute",
          statusCode: 422,
        });
      }

      try {
        const result = await prisma.$transaction(async (tx) => {
          await assertFocalAssignment(params.id, currentUser.id, tx);
          await assertNotFinalized(params.id, tx);
          const { proposal, transition } = await validateTransition(
            params.id, "FOCAL_REROUTE", "PROJECT_FOCAL", tx,
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
              workflowAction: "FOCAL_REROUTE",
              proposalVersionNumber: versionNumber,
              comment: body.comment,
              sessionReference: request.ip ?? null,
            },
          });

          await tx.auditLog.create({
            data: {
              actorUserId: currentUser.id,
              actorRole: "PROJECT_FOCAL",
              action: "WORKFLOW_FOCAL_REROUTE",
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
