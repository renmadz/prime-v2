import type { FastifyInstance } from "fastify";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../db/client.js";
import { requireAuth } from "../middleware/auth.js";
import { assertNotFinalized, validateTransition, WorkflowError } from "../services/workflowEngine.js";

// ── Zod schemas ──────────────────────────────────────────────────────────────

const idParamSchema = z.object({ id: z.string().uuid() });

const accountingReturnBodySchema = z.object({
  comment: z.string().min(1),
});

const accountingEndorseBodySchema = z.object({
  comment: z.string().optional(),
});

// ── Assignment check helper ──────────────────────────────────────────────────

async function assertAccountantAssignment(
  proposalId: string,
  userId: string,
  tx: Prisma.TransactionClient,
): Promise<void> {
  const assignment = await tx.proposalAssignment.findFirst({
    where: { proposalId, userId, roleCode: "ACCOUNTANT", isActive: true },
  });
  if (!assignment) {
    throw new WorkflowError(403, "NOT_ASSIGNED", "You are not assigned as Accountant for this proposal");
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

async function markOpenAccountingReview(
  tx: Prisma.TransactionClient,
  proposalId: string,
  reviewerUserId: string,
  status: string,
  actionTaken: string,
  findings: string | null,
): Promise<void> {
  const openReview = await tx.accountingReview.findFirst({
    where: { proposalId, reviewerUserId, status: "OPEN" },
    orderBy: { createdAt: "desc" },
  });
  if (openReview) {
    await tx.accountingReview.update({
      where: { id: openReview.id },
      data: { status, findings, actionTaken, reviewedAt: new Date() },
    });
  }
}

// ── Route plugin ─────────────────────────────────────────────────────────────

export default async function accountingRoutes(fastify: FastifyInstance) {
  // ── POST /api/proposals/:id/workflow/accounting-open ────────────────────
  fastify.post(
    "/api/proposals/:id/workflow/accounting-open",
    { preHandler: requireAuth() },
    async (request, reply) => {
      const currentUser = request.currentUser!;
      const params = idParamSchema.parse(request.params);

      if (!currentUser.roles.includes("ACCOUNTANT")) {
        return reply.status(403).send({ error: "Forbidden", statusCode: 403 });
      }

      try {
        const result = await prisma.$transaction(async (tx) => {
          await assertAccountantAssignment(params.id, currentUser.id, tx);
          await assertNotFinalized(params.id, tx);
          const { proposal, transition } = await validateTransition(
            params.id, "ACCOUNTING_OPEN", "ACCOUNTANT", tx,
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
              actorRole: "ACCOUNTANT",
              workflowAction: "ACCOUNTING_OPEN",
              proposalVersionNumber: versionNumber,
              sessionReference: request.ip ?? null,
            },
          });

          await tx.auditLog.create({
            data: {
              actorUserId: currentUser.id,
              actorRole: "ACCOUNTANT",
              action: "WORKFLOW_ACCOUNTING_OPEN",
              entityType: "proposals",
              entityId: params.id,
              beforeState: JSON.stringify({ status: transition.fromStatus }),
              afterState: JSON.stringify({ status: transition.toStatus }),
              ipAddress: request.ip ?? null,
            },
          });

          if (proposal.currentVersionId) {
            await tx.accountingReview.create({
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

  // ── POST /api/proposals/:id/workflow/accounting-return-to-budget ────────
  fastify.post(
    "/api/proposals/:id/workflow/accounting-return-to-budget",
    { preHandler: requireAuth() },
    async (request, reply) => {
      const currentUser = request.currentUser!;
      const params = idParamSchema.parse(request.params);

      if (!currentUser.roles.includes("ACCOUNTANT")) {
        return reply.status(403).send({ error: "Forbidden", statusCode: 403 });
      }

      let body: z.infer<typeof accountingReturnBodySchema>;
      try {
        body = accountingReturnBodySchema.parse(request.body);
      } catch {
        return reply.status(422).send({
          error: "Unprocessable Entity",
          code: "COMMENT_REQUIRED",
          message: "A comment is required for accounting-return-to-budget",
          statusCode: 422,
        });
      }

      try {
        const result = await prisma.$transaction(async (tx) => {
          await assertAccountantAssignment(params.id, currentUser.id, tx);
          await assertNotFinalized(params.id, tx);
          const { proposal, transition } = await validateTransition(
            params.id, "ACCOUNTING_RETURN_BUDGET", "ACCOUNTANT", tx,
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
              actorRole: "ACCOUNTANT",
              workflowAction: "ACCOUNTING_RETURN_BUDGET",
              proposalVersionNumber: versionNumber,
              comment: body.comment,
              sessionReference: request.ip ?? null,
            },
          });

          await tx.auditLog.create({
            data: {
              actorUserId: currentUser.id,
              actorRole: "ACCOUNTANT",
              action: "WORKFLOW_ACCOUNTING_RETURN_BUDGET",
              entityType: "proposals",
              entityId: params.id,
              beforeState: JSON.stringify({ status: transition.fromStatus }),
              afterState: JSON.stringify({ status: transition.toStatus }),
              ipAddress: request.ip ?? null,
            },
          });

          await markOpenAccountingReview(
            tx, params.id, currentUser.id, "RETURNED", "ACCOUNTING_RETURN_BUDGET", body.comment,
          );

          const budgetAssignments = await tx.proposalAssignment.findMany({
            where: { proposalId: params.id, roleCode: "BUDGET_OFFICER", isActive: true },
          });
          for (const assignment of budgetAssignments) {
            await tx.notification.create({
              data: {
                recipientUserId: assignment.userId,
                proposalId: params.id,
                eventType: "PROPOSAL_RETURNED_BY_ACCOUNTING",
                message: "The Accountant has returned this proposal to Budget with findings.",
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

  // ── POST /api/proposals/:id/workflow/accounting-return-to-focal ─────────
  fastify.post(
    "/api/proposals/:id/workflow/accounting-return-to-focal",
    { preHandler: requireAuth() },
    async (request, reply) => {
      const currentUser = request.currentUser!;
      const params = idParamSchema.parse(request.params);

      if (!currentUser.roles.includes("ACCOUNTANT")) {
        return reply.status(403).send({ error: "Forbidden", statusCode: 403 });
      }

      let body: z.infer<typeof accountingReturnBodySchema>;
      try {
        body = accountingReturnBodySchema.parse(request.body);
      } catch {
        return reply.status(422).send({
          error: "Unprocessable Entity",
          code: "COMMENT_REQUIRED",
          message: "A comment is required for accounting-return-to-focal",
          statusCode: 422,
        });
      }

      try {
        const result = await prisma.$transaction(async (tx) => {
          await assertAccountantAssignment(params.id, currentUser.id, tx);
          await assertNotFinalized(params.id, tx);
          const { proposal, transition } = await validateTransition(
            params.id, "ACCOUNTING_RETURN_FOCAL", "ACCOUNTANT", tx,
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
              actorRole: "ACCOUNTANT",
              workflowAction: "ACCOUNTING_RETURN_FOCAL",
              proposalVersionNumber: versionNumber,
              comment: body.comment,
              sessionReference: request.ip ?? null,
            },
          });

          await tx.auditLog.create({
            data: {
              actorUserId: currentUser.id,
              actorRole: "ACCOUNTANT",
              action: "WORKFLOW_ACCOUNTING_RETURN_FOCAL",
              entityType: "proposals",
              entityId: params.id,
              beforeState: JSON.stringify({ status: transition.fromStatus }),
              afterState: JSON.stringify({ status: transition.toStatus }),
              ipAddress: request.ip ?? null,
            },
          });

          await markOpenAccountingReview(
            tx, params.id, currentUser.id, "RETURNED", "ACCOUNTING_RETURN_FOCAL", body.comment,
          );

          const focalAssignments = await tx.proposalAssignment.findMany({
            where: { proposalId: params.id, roleCode: "PROJECT_FOCAL", isActive: true },
          });
          for (const assignment of focalAssignments) {
            await tx.notification.create({
              data: {
                recipientUserId: assignment.userId,
                proposalId: params.id,
                eventType: "PROPOSAL_RETURNED_BY_ACCOUNTING_TO_FOCAL",
                message: "The Accountant has returned this proposal directly to you with findings.",
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

  // ── POST /api/proposals/:id/workflow/accounting-endorse-to-rd ───────────
  fastify.post(
    "/api/proposals/:id/workflow/accounting-endorse-to-rd",
    { preHandler: requireAuth() },
    async (request, reply) => {
      const currentUser = request.currentUser!;
      const params = idParamSchema.parse(request.params);

      if (!currentUser.roles.includes("ACCOUNTANT")) {
        return reply.status(403).send({ error: "Forbidden", statusCode: 403 });
      }

      const body = accountingEndorseBodySchema.safeParse(request.body);

      try {
        const result = await prisma.$transaction(async (tx) => {
          await assertAccountantAssignment(params.id, currentUser.id, tx);
          await assertNotFinalized(params.id, tx);
          const { proposal, transition } = await validateTransition(
            params.id, "ACCOUNTING_ENDORSE_RD", "ACCOUNTANT", tx,
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
              actorRole: "ACCOUNTANT",
              workflowAction: "ACCOUNTING_ENDORSE_RD",
              proposalVersionNumber: versionNumber,
              comment: body.success ? (body.data.comment ?? null) : null,
              sessionReference: request.ip ?? null,
            },
          });

          await tx.auditLog.create({
            data: {
              actorUserId: currentUser.id,
              actorRole: "ACCOUNTANT",
              action: "WORKFLOW_ACCOUNTING_ENDORSE_RD",
              entityType: "proposals",
              entityId: params.id,
              beforeState: JSON.stringify({ status: transition.fromStatus }),
              afterState: JSON.stringify({ status: transition.toStatus }),
              ipAddress: request.ip ?? null,
            },
          });

          await markOpenAccountingReview(
            tx,
            params.id,
            currentUser.id,
            "ENDORSED",
            "ACCOUNTING_ENDORSE_RD",
            body.success ? (body.data.comment ?? null) : null,
          );

          // Notify all active REGIONAL_DIRECTOR role-holders — RD is
          // role-based, not assignment-based (Roles-and-Permissions §3.1:
          // RD is "✅" unconditional access, not "Assigned"). Inline per
          // Phase 12 ARCH-3 decision (single call site, no shared helper yet).
          const rdUsers = await tx.user.findMany({
            where: { isActive: true, userRoles: { some: { role: { code: "REGIONAL_DIRECTOR" } } } },
          });
          for (const rdUser of rdUsers) {
            await tx.notification.create({
              data: {
                recipientUserId: rdUser.id,
                proposalId: params.id,
                eventType: "PROPOSAL_ENDORSED_TO_RD",
                message: "A proposal has been endorsed to you for final decision.",
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
