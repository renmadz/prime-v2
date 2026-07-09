import type { FastifyInstance } from "fastify";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../db/client.js";
import { requireAuth } from "../middleware/auth.js";
import { assertNotFinalized, validateTransition, WorkflowError } from "../services/workflowEngine.js";

// ── Zod schemas ──────────────────────────────────────────────────────────────

const idParamSchema = z.object({ id: z.string().uuid() });

const budgetReturnBodySchema = z.object({
  comment: z.string().min(1),
});

const budgetEndorseBodySchema = z.object({
  comment: z.string().optional(),
});

const budgetReEndorseBodySchema = z.object({
  comment: z.string().optional(),
});

// ── Assignment check helper ──────────────────────────────────────────────────

async function assertBudgetAssignment(
  proposalId: string,
  userId: string,
  tx: Prisma.TransactionClient,
): Promise<void> {
  const assignment = await tx.proposalAssignment.findFirst({
    where: { proposalId, userId, roleCode: "BUDGET_OFFICER", isActive: true },
  });
  if (!assignment) {
    throw new WorkflowError(403, "NOT_ASSIGNED", "You are not assigned as Budget Officer for this proposal");
  }
}

function handleWorkflowError(err: unknown) {
  if (err instanceof WorkflowError) {
    return {
      statusCode: err.statusCode,
      body: {
        error:
          err.statusCode === 409
            ? "Conflict"
            : err.statusCode === 422
              ? "Unprocessable Entity"
              : err.statusCode === 404
                ? "Not Found"
                : "Forbidden",
        code: err.code,
        message: err.message,
        statusCode: err.statusCode,
      },
    };
  }
  throw err;
}

// ── Route plugin ─────────────────────────────────────────────────────────────

export default async function budgetRoutes(fastify: FastifyInstance) {
  // ── POST /api/proposals/:id/workflow/budget-open ────────────────────────
  fastify.post(
    "/api/proposals/:id/workflow/budget-open",
    { preHandler: requireAuth() },
    async (request, reply) => {
      const currentUser = request.currentUser!;
      const params = idParamSchema.parse(request.params);

      if (!currentUser.roles.includes("BUDGET_OFFICER")) {
        return reply.status(403).send({ error: "Forbidden", statusCode: 403 });
      }

      try {
        const result = await prisma.$transaction(async (tx) => {
          await assertBudgetAssignment(params.id, currentUser.id, tx);
          await assertNotFinalized(params.id, tx);
          const { proposal, transition } = await validateTransition(
            params.id, "BUDGET_OPEN", "BUDGET_OFFICER", tx,
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
              actorRole: "BUDGET_OFFICER",
              workflowAction: "BUDGET_OPEN",
              proposalVersionNumber: versionNumber,
              sessionReference: request.ip ?? null,
            },
          });

          await tx.auditLog.create({
            data: {
              actorUserId: currentUser.id,
              actorRole: "BUDGET_OFFICER",
              action: "WORKFLOW_BUDGET_OPEN",
              entityType: "proposals",
              entityId: params.id,
              beforeState: JSON.stringify({ status: transition.fromStatus }),
              afterState: JSON.stringify({ status: transition.toStatus }),
              ipAddress: request.ip ?? null,
            },
          });

          if (proposal.currentVersionId) {
            await tx.budgetReview.create({
              data: {
                proposalId: params.id,
                proposalVersionId: proposal.currentVersionId,
                reviewerUserId: currentUser.id,
                status: "OPEN",
              },
            });
          }

          return updated;
        });

        return reply.status(200).send({
          id: result.id,
          status: result.status,
          transitionedAt: new Date().toISOString(),
        });
      } catch (err) {
        const handled = handleWorkflowError(err);
        return reply.status(handled.statusCode).send(handled.body);
      }
    },
  );

  // ── POST /api/proposals/:id/workflow/budget-return ──────────────────────
  fastify.post(
    "/api/proposals/:id/workflow/budget-return",
    { preHandler: requireAuth() },
    async (request, reply) => {
      const currentUser = request.currentUser!;
      const params = idParamSchema.parse(request.params);

      if (!currentUser.roles.includes("BUDGET_OFFICER")) {
        return reply.status(403).send({ error: "Forbidden", statusCode: 403 });
      }

      let body: z.infer<typeof budgetReturnBodySchema>;
      try {
        body = budgetReturnBodySchema.parse(request.body);
      } catch {
        return reply.status(422).send({
          error: "Unprocessable Entity",
          code: "COMMENT_REQUIRED",
          message: "A comment is required for budget-return",
          statusCode: 422,
        });
      }

      try {
        const result = await prisma.$transaction(async (tx) => {
          await assertBudgetAssignment(params.id, currentUser.id, tx);
          await assertNotFinalized(params.id, tx);
          const { proposal, transition } = await validateTransition(
            params.id, "BUDGET_RETURN", "BUDGET_OFFICER", tx,
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
              actorRole: "BUDGET_OFFICER",
              workflowAction: "BUDGET_RETURN",
              proposalVersionNumber: versionNumber,
              comment: body.comment,
              sessionReference: request.ip ?? null,
            },
          });

          await tx.auditLog.create({
            data: {
              actorUserId: currentUser.id,
              actorRole: "BUDGET_OFFICER",
              action: "WORKFLOW_BUDGET_RETURN",
              entityType: "proposals",
              entityId: params.id,
              beforeState: JSON.stringify({ status: transition.fromStatus }),
              afterState: JSON.stringify({ status: transition.toStatus }),
              ipAddress: request.ip ?? null,
            },
          });

          const openReview = await tx.budgetReview.findFirst({
            where: { proposalId: params.id, reviewerUserId: currentUser.id, status: "OPEN" },
            orderBy: { createdAt: "desc" },
          });
          if (openReview) {
            await tx.budgetReview.update({
              where: { id: openReview.id },
              data: {
                status: "RETURNED",
                findings: body.comment,
                actionTaken: "BUDGET_RETURN",
                reviewedAt: new Date(),
              },
            });
          }

          // Notify all active Project Focal assignments
          const focalAssignments = await tx.proposalAssignment.findMany({
            where: { proposalId: params.id, roleCode: "PROJECT_FOCAL", isActive: true },
          });
          for (const assignment of focalAssignments) {
            await tx.notification.create({
              data: {
                recipientUserId: assignment.userId,
                proposalId: params.id,
                eventType: "PROPOSAL_RETURNED_BY_BUDGET",
                message: "The Budget Officer has returned this proposal with findings.",
              },
            });
          }

          return updated;
        });

        return reply.status(200).send({
          id: result.id,
          status: result.status,
          transitionedAt: new Date().toISOString(),
        });
      } catch (err) {
        const handled = handleWorkflowError(err);
        return reply.status(handled.statusCode).send(handled.body);
      }
    },
  );

  // ── POST /api/proposals/:id/workflow/budget-endorse ─────────────────────
  fastify.post(
    "/api/proposals/:id/workflow/budget-endorse",
    { preHandler: requireAuth() },
    async (request, reply) => {
      const currentUser = request.currentUser!;
      const params = idParamSchema.parse(request.params);

      if (!currentUser.roles.includes("BUDGET_OFFICER")) {
        return reply.status(403).send({ error: "Forbidden", statusCode: 403 });
      }

      const body = budgetEndorseBodySchema.safeParse(request.body);

      try {
        const result = await prisma.$transaction(async (tx) => {
          await assertBudgetAssignment(params.id, currentUser.id, tx);
          await assertNotFinalized(params.id, tx);
          const { proposal, transition } = await validateTransition(
            params.id, "BUDGET_ENDORSE", "BUDGET_OFFICER", tx,
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
              actorRole: "BUDGET_OFFICER",
              workflowAction: "BUDGET_ENDORSE",
              proposalVersionNumber: versionNumber,
              comment: body.success ? (body.data.comment ?? null) : null,
              sessionReference: request.ip ?? null,
            },
          });

          await tx.auditLog.create({
            data: {
              actorUserId: currentUser.id,
              actorRole: "BUDGET_OFFICER",
              action: "WORKFLOW_BUDGET_ENDORSE",
              entityType: "proposals",
              entityId: params.id,
              beforeState: JSON.stringify({ status: transition.fromStatus }),
              afterState: JSON.stringify({ status: transition.toStatus }),
              ipAddress: request.ip ?? null,
            },
          });

          const openReview = await tx.budgetReview.findFirst({
            where: { proposalId: params.id, reviewerUserId: currentUser.id, status: "OPEN" },
            orderBy: { createdAt: "desc" },
          });
          if (openReview) {
            await tx.budgetReview.update({
              where: { id: openReview.id },
              data: {
                status: "ENDORSED",
                findings: body.success ? (body.data.comment ?? null) : null,
                actionTaken: "BUDGET_ENDORSE",
                reviewedAt: new Date(),
              },
            });
          }

          // Notify all active Accountant assignments
          const accountantAssignments = await tx.proposalAssignment.findMany({
            where: { proposalId: params.id, roleCode: "ACCOUNTANT", isActive: true },
          });
          for (const assignment of accountantAssignments) {
            await tx.notification.create({
              data: {
                recipientUserId: assignment.userId,
                proposalId: params.id,
                eventType: "PROPOSAL_ENDORSED_TO_ACCOUNTING",
                message: "A proposal has been endorsed to Accounting for your review.",
              },
            });
          }

          return updated;
        });

        return reply.status(200).send({
          id: result.id,
          status: result.status,
          transitionedAt: new Date().toISOString(),
        });
      } catch (err) {
        const handled = handleWorkflowError(err);
        return reply.status(handled.statusCode).send(handled.body);
      }
    },
  );

  // ── POST /api/proposals/:id/workflow/budget-re-endorse ──────────────────
  fastify.post(
    "/api/proposals/:id/workflow/budget-re-endorse",
    { preHandler: requireAuth() },
    async (request, reply) => {
      const currentUser = request.currentUser!;
      const params = idParamSchema.parse(request.params);

      if (!currentUser.roles.includes("BUDGET_OFFICER")) {
        return reply.status(403).send({ error: "Forbidden", statusCode: 403 });
      }

      const body = budgetReEndorseBodySchema.safeParse(request.body);

      try {
        const result = await prisma.$transaction(async (tx) => {
          await assertBudgetAssignment(params.id, currentUser.id, tx);
          await assertNotFinalized(params.id, tx);
          const { proposal, transition } = await validateTransition(
            params.id, "BUDGET_RE_ENDORSE", "BUDGET_OFFICER", tx,
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
              actorRole: "BUDGET_OFFICER",
              workflowAction: "BUDGET_RE_ENDORSE",
              proposalVersionNumber: versionNumber,
              comment: body.success ? (body.data.comment ?? null) : null,
              sessionReference: request.ip ?? null,
            },
          });

          await tx.auditLog.create({
            data: {
              actorUserId: currentUser.id,
              actorRole: "BUDGET_OFFICER",
              action: "WORKFLOW_BUDGET_RE_ENDORSE",
              entityType: "proposals",
              entityId: params.id,
              beforeState: JSON.stringify({ status: transition.fromStatus }),
              afterState: JSON.stringify({ status: transition.toStatus }),
              ipAddress: request.ip ?? null,
            },
          });

          if (proposal.currentVersionId) {
            await tx.budgetReview.create({
              data: {
                proposalId: params.id,
                proposalVersionId: proposal.currentVersionId,
                reviewerUserId: currentUser.id,
                status: "ENDORSED",
                findings: body.success ? (body.data.comment ?? null) : null,
                actionTaken: "BUDGET_RE_ENDORSE",
                reviewedAt: new Date(),
              },
            });
          }

          // Notify all active Accountant assignments
          const accountantAssignments = await tx.proposalAssignment.findMany({
            where: { proposalId: params.id, roleCode: "ACCOUNTANT", isActive: true },
          });
          for (const assignment of accountantAssignments) {
            await tx.notification.create({
              data: {
                recipientUserId: assignment.userId,
                proposalId: params.id,
                eventType: "PROPOSAL_ENDORSED_TO_ACCOUNTING",
                message: "The Budget Officer has re-endorsed this proposal to Accounting.",
              },
            });
          }

          return updated;
        });

        return reply.status(200).send({
          id: result.id,
          status: result.status,
          transitionedAt: new Date().toISOString(),
        });
      } catch (err) {
        const handled = handleWorkflowError(err);
        return reply.status(handled.statusCode).send(handled.body);
      }
    },
  );
}
