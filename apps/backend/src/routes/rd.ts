import type { FastifyInstance } from "fastify";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../db/client.js";
import { requireAuth } from "../middleware/auth.js";
import { assertNotFinalized, validateTransition, WorkflowError } from "../services/workflowEngine.js";

// ── Zod schemas ──────────────────────────────────────────────────────────────

const idParamSchema = z.object({ id: z.string().uuid() });

const rdCommentRequiredSchema = z.object({
  comment: z.string().min(1),
});

const rdDeferBodySchema = z.object({
  reason: z.string().min(1),
});

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

async function notifyApplicantAndFocal(
  tx: Prisma.TransactionClient,
  proposalId: string,
  applicantUserId: string,
  eventType: string,
  applicantMessage: string,
  focalMessage: string,
): Promise<void> {
  await tx.notification.create({
    data: { recipientUserId: applicantUserId, proposalId, eventType, message: applicantMessage },
  });
  const focalAssignments = await tx.proposalAssignment.findMany({
    where: { proposalId, roleCode: "PROJECT_FOCAL", isActive: true },
  });
  for (const assignment of focalAssignments) {
    await tx.notification.create({
      data: { recipientUserId: assignment.userId, proposalId, eventType, message: focalMessage },
    });
  }
}

// ── Route plugin ─────────────────────────────────────────────────────────────
// RD role-gating is role-based only, not assignment-based (Roles-and-
// Permissions §3.1 marks REGIONAL_DIRECTOR "✅" unconditional, not "Assigned"
// — confirmed in Phase 12 PM-D/SEC-4). Stage gating (validateTransition's
// from-status match) is the sole additional guard, same as every other actor.

export default async function rdRoutes(fastify: FastifyInstance) {
  // ── POST /api/proposals/:id/workflow/rd-open ────────────────────────────
  fastify.post(
    "/api/proposals/:id/workflow/rd-open",
    { preHandler: requireAuth() },
    async (request, reply) => {
      const currentUser = request.currentUser!;
      const params = idParamSchema.parse(request.params);

      if (!currentUser.roles.includes("REGIONAL_DIRECTOR")) {
        return reply.status(403).send({ error: "Forbidden", statusCode: 403 });
      }

      try {
        const result = await prisma.$transaction(async (tx) => {
          await assertNotFinalized(params.id, tx);
          const { proposal, transition } = await validateTransition(
            params.id, "RD_OPEN", "REGIONAL_DIRECTOR", tx,
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
              actorRole: "REGIONAL_DIRECTOR",
              workflowAction: "RD_OPEN",
              proposalVersionNumber: versionNumber,
              sessionReference: request.ip ?? null,
            },
          });

          await tx.auditLog.create({
            data: {
              actorUserId: currentUser.id,
              actorRole: "REGIONAL_DIRECTOR",
              action: "WORKFLOW_RD_OPEN",
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
        const handled = handleWorkflowError(err);
        return reply.status(handled.statusCode).send(handled.body);
      }
    },
  );

  // ── POST /api/proposals/:id/workflow/rd-approve ─────────────────────────
  fastify.post(
    "/api/proposals/:id/workflow/rd-approve",
    { preHandler: requireAuth() },
    async (request, reply) => {
      const currentUser = request.currentUser!;
      const params = idParamSchema.parse(request.params);

      if (!currentUser.roles.includes("REGIONAL_DIRECTOR")) {
        return reply.status(403).send({ error: "Forbidden", statusCode: 403 });
      }

      let body: z.infer<typeof rdCommentRequiredSchema>;
      try {
        body = rdCommentRequiredSchema.parse(request.body);
      } catch {
        return reply.status(422).send({
          error: "Unprocessable Entity",
          code: "COMMENT_REQUIRED",
          message: "A comment is required for rd-approve",
          statusCode: 422,
        });
      }

      try {
        const result = await prisma.$transaction(async (tx) => {
          await assertNotFinalized(params.id, tx);
          const { proposal, transition } = await validateTransition(
            params.id, "RD_APPROVE", "REGIONAL_DIRECTOR", tx,
          );

          const versionNumber = (proposal as any).currentVersion?.versionNumber ?? 0;

          const updated = await tx.proposal.update({
            where: { id: params.id },
            data: { status: transition.toStatus, isLocked: true },
          });

          await tx.proposalWorkflowHistory.create({
            data: {
              proposalId: params.id,
              fromStatus: transition.fromStatus,
              toStatus: transition.toStatus,
              actorUserId: currentUser.id,
              actorRole: "REGIONAL_DIRECTOR",
              workflowAction: "RD_APPROVE",
              proposalVersionNumber: versionNumber,
              comment: body.comment,
              sessionReference: request.ip ?? null,
            },
          });

          await tx.auditLog.create({
            data: {
              actorUserId: currentUser.id,
              actorRole: "REGIONAL_DIRECTOR",
              action: "WORKFLOW_RD_APPROVE",
              entityType: "proposals",
              entityId: params.id,
              beforeState: JSON.stringify({ status: transition.fromStatus, isLocked: false }),
              afterState: JSON.stringify({ status: transition.toStatus, isLocked: true }),
              ipAddress: request.ip ?? null,
            },
          });

          if (proposal.currentVersionId) {
            await tx.rdDecision.create({
              data: {
                proposalId: params.id,
                proposalVersionId: proposal.currentVersionId,
                decidedBy: currentUser.id,
                decision: "APPROVED",
                remarks: body.comment,
                decidedAt: new Date(),
              },
            });
          }

          await notifyApplicantAndFocal(
            tx,
            params.id,
            proposal.applicantUserId,
            "PROPOSAL_APPROVED",
            "Congratulations — your proposal has been approved by the Regional Director.",
            "The Regional Director has approved this proposal.",
          );

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

  // ── POST /api/proposals/:id/workflow/rd-reject ──────────────────────────
  fastify.post(
    "/api/proposals/:id/workflow/rd-reject",
    { preHandler: requireAuth() },
    async (request, reply) => {
      const currentUser = request.currentUser!;
      const params = idParamSchema.parse(request.params);

      if (!currentUser.roles.includes("REGIONAL_DIRECTOR")) {
        return reply.status(403).send({ error: "Forbidden", statusCode: 403 });
      }

      let body: z.infer<typeof rdCommentRequiredSchema>;
      try {
        body = rdCommentRequiredSchema.parse(request.body);
      } catch {
        return reply.status(422).send({
          error: "Unprocessable Entity",
          code: "COMMENT_REQUIRED",
          message: "A comment is required for rd-reject",
          statusCode: 422,
        });
      }

      try {
        const result = await prisma.$transaction(async (tx) => {
          await assertNotFinalized(params.id, tx);
          const { proposal, transition } = await validateTransition(
            params.id, "RD_REJECT", "REGIONAL_DIRECTOR", tx,
          );

          const versionNumber = (proposal as any).currentVersion?.versionNumber ?? 0;

          const updated = await tx.proposal.update({
            where: { id: params.id },
            data: { status: transition.toStatus, isLocked: true },
          });

          await tx.proposalWorkflowHistory.create({
            data: {
              proposalId: params.id,
              fromStatus: transition.fromStatus,
              toStatus: transition.toStatus,
              actorUserId: currentUser.id,
              actorRole: "REGIONAL_DIRECTOR",
              workflowAction: "RD_REJECT",
              proposalVersionNumber: versionNumber,
              comment: body.comment,
              sessionReference: request.ip ?? null,
            },
          });

          await tx.auditLog.create({
            data: {
              actorUserId: currentUser.id,
              actorRole: "REGIONAL_DIRECTOR",
              action: "WORKFLOW_RD_REJECT",
              entityType: "proposals",
              entityId: params.id,
              beforeState: JSON.stringify({ status: transition.fromStatus, isLocked: false }),
              afterState: JSON.stringify({ status: transition.toStatus, isLocked: true }),
              ipAddress: request.ip ?? null,
            },
          });

          if (proposal.currentVersionId) {
            await tx.rdDecision.create({
              data: {
                proposalId: params.id,
                proposalVersionId: proposal.currentVersionId,
                decidedBy: currentUser.id,
                decision: "REJECTED",
                remarks: body.comment,
                decidedAt: new Date(),
              },
            });
          }

          await notifyApplicantAndFocal(
            tx,
            params.id,
            proposal.applicantUserId,
            "PROPOSAL_REJECTED",
            "Your proposal has been rejected by the Regional Director.",
            "The Regional Director has rejected this proposal.",
          );

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

  // ── POST /api/proposals/:id/workflow/rd-defer ───────────────────────────
  fastify.post(
    "/api/proposals/:id/workflow/rd-defer",
    { preHandler: requireAuth() },
    async (request, reply) => {
      const currentUser = request.currentUser!;
      const params = idParamSchema.parse(request.params);

      if (!currentUser.roles.includes("REGIONAL_DIRECTOR")) {
        return reply.status(403).send({ error: "Forbidden", statusCode: 403 });
      }

      let body: z.infer<typeof rdDeferBodySchema>;
      try {
        body = rdDeferBodySchema.parse(request.body);
      } catch {
        return reply.status(422).send({
          error: "Unprocessable Entity",
          code: "REASON_REQUIRED",
          message: "A reason is required for rd-defer",
          statusCode: 422,
        });
      }

      try {
        const result = await prisma.$transaction(async (tx) => {
          await assertNotFinalized(params.id, tx);
          const { proposal, transition } = await validateTransition(
            params.id, "RD_DEFER", "REGIONAL_DIRECTOR", tx,
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
              actorRole: "REGIONAL_DIRECTOR",
              workflowAction: "RD_DEFER",
              proposalVersionNumber: versionNumber,
              comment: body.reason,
              sessionReference: request.ip ?? null,
            },
          });

          await tx.auditLog.create({
            data: {
              actorUserId: currentUser.id,
              actorRole: "REGIONAL_DIRECTOR",
              action: "WORKFLOW_RD_DEFER",
              entityType: "proposals",
              entityId: params.id,
              beforeState: JSON.stringify({ status: transition.fromStatus }),
              afterState: JSON.stringify({ status: transition.toStatus }),
              ipAddress: request.ip ?? null,
            },
          });

          if (proposal.currentVersionId) {
            await tx.rdDecision.create({
              data: {
                proposalId: params.id,
                proposalVersionId: proposal.currentVersionId,
                decidedBy: currentUser.id,
                decision: "DEFERRED",
                remarks: body.reason,
                decidedAt: new Date(),
              },
            });
          }

          // No Applicant notification — deferral is an internal RD hold.
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

  // ── POST /api/proposals/:id/workflow/rd-resume ──────────────────────────
  fastify.post(
    "/api/proposals/:id/workflow/rd-resume",
    { preHandler: requireAuth() },
    async (request, reply) => {
      const currentUser = request.currentUser!;
      const params = idParamSchema.parse(request.params);

      if (!currentUser.roles.includes("REGIONAL_DIRECTOR")) {
        return reply.status(403).send({ error: "Forbidden", statusCode: 403 });
      }

      try {
        const result = await prisma.$transaction(async (tx) => {
          await assertNotFinalized(params.id, tx);
          const { proposal, transition } = await validateTransition(
            params.id, "RD_RESUME", "REGIONAL_DIRECTOR", tx,
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
              actorRole: "REGIONAL_DIRECTOR",
              workflowAction: "RD_RESUME",
              proposalVersionNumber: versionNumber,
              sessionReference: request.ip ?? null,
            },
          });

          await tx.auditLog.create({
            data: {
              actorUserId: currentUser.id,
              actorRole: "REGIONAL_DIRECTOR",
              action: "WORKFLOW_RD_RESUME",
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
        const handled = handleWorkflowError(err);
        return reply.status(handled.statusCode).send(handled.body);
      }
    },
  );

  // ── POST /api/proposals/:id/workflow/rd-return ──────────────────────────
  fastify.post(
    "/api/proposals/:id/workflow/rd-return",
    { preHandler: requireAuth() },
    async (request, reply) => {
      const currentUser = request.currentUser!;
      const params = idParamSchema.parse(request.params);

      if (!currentUser.roles.includes("REGIONAL_DIRECTOR")) {
        return reply.status(403).send({ error: "Forbidden", statusCode: 403 });
      }

      let body: z.infer<typeof rdCommentRequiredSchema>;
      try {
        body = rdCommentRequiredSchema.parse(request.body);
      } catch {
        return reply.status(422).send({
          error: "Unprocessable Entity",
          code: "COMMENT_REQUIRED",
          message: "A comment is required for rd-return",
          statusCode: 422,
        });
      }

      try {
        const result = await prisma.$transaction(async (tx) => {
          await assertNotFinalized(params.id, tx);
          const { proposal, transition } = await validateTransition(
            params.id, "RD_RETURN", "REGIONAL_DIRECTOR", tx,
          );

          const versionNumber = (proposal as any).currentVersion?.versionNumber ?? 0;

          // RD return re-enables Applicant editing — unlock explicitly
          // (Phase 12 SEC-2 confirmed: isLocked = false on this transition).
          const updated = await tx.proposal.update({
            where: { id: params.id },
            data: { status: transition.toStatus, isLocked: false },
          });

          await tx.proposalWorkflowHistory.create({
            data: {
              proposalId: params.id,
              fromStatus: transition.fromStatus,
              toStatus: transition.toStatus,
              actorUserId: currentUser.id,
              actorRole: "REGIONAL_DIRECTOR",
              workflowAction: "RD_RETURN",
              proposalVersionNumber: versionNumber,
              comment: body.comment,
              sessionReference: request.ip ?? null,
            },
          });

          await tx.auditLog.create({
            data: {
              actorUserId: currentUser.id,
              actorRole: "REGIONAL_DIRECTOR",
              action: "WORKFLOW_RD_RETURN",
              entityType: "proposals",
              entityId: params.id,
              beforeState: JSON.stringify({ status: transition.fromStatus }),
              afterState: JSON.stringify({ status: transition.toStatus, isLocked: false }),
              ipAddress: request.ip ?? null,
            },
          });

          if (proposal.currentVersionId) {
            await tx.rdDecision.create({
              data: {
                proposalId: params.id,
                proposalVersionId: proposal.currentVersionId,
                decidedBy: currentUser.id,
                decision: "RETURNED",
                remarks: body.comment,
                decidedAt: new Date(),
              },
            });
          }

          // Applicant-only notification — matches every other
          // RETURNED_TO_APPLICANT transition in this workflow.
          await tx.notification.create({
            data: {
              recipientUserId: proposal.applicantUserId,
              proposalId: params.id,
              eventType: "PROPOSAL_RETURNED_TO_APPLICANT",
              message: "The Regional Director has returned your proposal for revision.",
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
        const handled = handleWorkflowError(err);
        return reply.status(handled.statusCode).send(handled.body);
      }
    },
  );
}
