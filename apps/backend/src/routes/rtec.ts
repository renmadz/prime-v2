import type { FastifyInstance } from "fastify";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../db/client.js";
import { requireAuth } from "../middleware/auth.js";
import { WorkflowError } from "../services/workflowEngine.js";
import {
  assertActiveRtecMembership,
  checkQuorumAndMaybeAdvance,
  performRtecSubmitRecommendation,
} from "../services/rtecEngine.js";

// ── Zod schemas ──────────────────────────────────────────────────────────────

const idParamSchema = z.object({ id: z.string().uuid() });
const reviewIdParamSchema = z.object({ id: z.string().uuid(), reviewId: z.string().uuid() });

const reviewItemSchema = z.object({
  formSectionId: z.string().uuid().optional(),
  remarks: z.string().min(1),
});

const upsertReviewBodySchema = z.object({
  rtecGroupId: z.string().uuid(),
  overallRemarks: z.string().optional(),
  items: z.array(reviewItemSchema).optional(),
});

const upsertConsolidationBodySchema = z.object({
  rtecGroupId: z.string().uuid(),
  recommendation: z.enum(["FOR_APPROVAL", "FOR_REVISION", "NOT_RECOMMENDED"]),
  consolidatedRemarks: z.string().min(1),
});

const reopenBodySchema = z.object({
  reason: z.string().optional(),
});

// ── Shared helpers ───────────────────────────────────────────────────────────

async function assertAssignedToProposal(
  proposalId: string,
  userId: string,
  roleCode: "RTEC_MEMBER" | "RTEC_HEAD",
  tx: Prisma.TransactionClient,
): Promise<void> {
  const assignment = await tx.proposalAssignment.findFirst({
    where: { proposalId, userId, roleCode, isActive: true },
  });
  if (!assignment) {
    throw new WorkflowError(
      403,
      "NOT_ASSIGNED",
      `You are not assigned as ${roleCode === "RTEC_HEAD" ? "RTEC Head" : "an RTEC Member"} for this proposal`,
    );
  }
}

async function resolveHeadGroupId(
  proposalId: string,
  userId: string,
  tx: Prisma.TransactionClient,
): Promise<string> {
  await assertAssignedToProposal(proposalId, userId, "RTEC_HEAD", tx);
  const membership = await tx.rtecMembership.findFirst({
    where: { userId, roleInGroup: "HEAD", isActive: true },
  });
  if (!membership) {
    throw new WorkflowError(403, "NOT_RTEC_GROUP_MEMBER", "You are not an active RTEC Head of any group");
  }
  return membership.rtecGroupId;
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

export default async function rtecRoutes(fastify: FastifyInstance) {
  // ── GET /api/proposals/:id/rtec/reviews (RTEC_HEAD + ADMIN) ─────────────────
  fastify.get(
    "/api/proposals/:id/rtec/reviews",
    { preHandler: requireAuth() },
    async (request, reply) => {
      const currentUser = request.currentUser!;
      const params = idParamSchema.parse(request.params);
      const isAdmin = currentUser.roles.includes("ADMIN");

      if (!isAdmin && !currentUser.roles.includes("RTEC_HEAD")) {
        return reply.status(403).send({ error: "Forbidden", statusCode: 403 });
      }

      try {
        const reviews = await prisma.$transaction(async (tx) => {
          const proposal = await tx.proposal.findUniqueOrThrow({ where: { id: params.id } });

          let rtecGroupId: string;
          if (isAdmin) {
            const anyReview = await tx.rtecReview.findFirst({
              where: { proposalId: params.id },
              orderBy: { createdAt: "desc" },
            });
            const consolidation = await tx.rtecConsolidation.findFirst({
              where: { proposalId: params.id },
              orderBy: { createdAt: "desc" },
            });
            rtecGroupId = consolidation?.rtecGroupId ?? anyReview?.rtecGroupId ?? "";
          } else {
            rtecGroupId = await resolveHeadGroupId(params.id, currentUser.id, tx);
          }

          if (!rtecGroupId) {
            return [];
          }

          return tx.rtecReview.findMany({
            where: {
              proposalId: params.id,
              proposalVersionId: proposal.currentVersionId ?? undefined,
              rtecGroupId,
            },
            include: { items: true },
          });
        });

        return reply.status(200).send({ reviews });
      } catch (err) {
        const handled = handleWorkflowError(err);
        return reply.status(handled.statusCode).send(handled.body);
      }
    },
  );

  // ── GET /api/proposals/:id/rtec/reviews/mine (RTEC_MEMBER) ──────────────────
  fastify.get(
    "/api/proposals/:id/rtec/reviews/mine",
    { preHandler: requireAuth() },
    async (request, reply) => {
      const currentUser = request.currentUser!;
      const params = idParamSchema.parse(request.params);

      if (!currentUser.roles.includes("RTEC_MEMBER")) {
        return reply.status(403).send({ error: "Forbidden", statusCode: 403 });
      }

      try {
        const review = await prisma.$transaction(async (tx) => {
          await assertAssignedToProposal(params.id, currentUser.id, "RTEC_MEMBER", tx);
          const proposal = await tx.proposal.findUniqueOrThrow({ where: { id: params.id } });

          return tx.rtecReview.findFirst({
            where: {
              proposalId: params.id,
              proposalVersionId: proposal.currentVersionId ?? undefined,
              reviewerUserId: currentUser.id,
            },
            include: { items: true },
          });
        });

        if (!review) {
          return reply.status(404).send({ error: "Not Found", statusCode: 404 });
        }
        return reply.status(200).send({ review });
      } catch (err) {
        const handled = handleWorkflowError(err);
        return reply.status(handled.statusCode).send(handled.body);
      }
    },
  );

  // ── POST /api/proposals/:id/rtec/reviews (RTEC_MEMBER) ──────────────────────
  fastify.post(
    "/api/proposals/:id/rtec/reviews",
    { preHandler: requireAuth() },
    async (request, reply) => {
      const currentUser = request.currentUser!;
      const params = idParamSchema.parse(request.params);

      if (!currentUser.roles.includes("RTEC_MEMBER")) {
        return reply.status(403).send({ error: "Forbidden", statusCode: 403 });
      }

      let body: z.infer<typeof upsertReviewBodySchema>;
      try {
        body = upsertReviewBodySchema.parse(request.body);
      } catch {
        return reply.status(422).send({
          error: "Unprocessable Entity",
          code: "VALIDATION_ERROR",
          message: "rtecGroupId (UUID) is required",
          statusCode: 422,
        });
      }

      try {
        const review = await prisma.$transaction(async (tx) => {
          await assertAssignedToProposal(params.id, currentUser.id, "RTEC_MEMBER", tx);
          await assertActiveRtecMembership(body.rtecGroupId, currentUser.id, "MEMBER", tx);

          const proposal = await tx.proposal.findUniqueOrThrow({ where: { id: params.id } });
          if (proposal.status !== "UNDER_RTEC_REVIEW") {
            throw new WorkflowError(
              409,
              "NOT_UNDER_RTEC_REVIEW",
              "This proposal is not currently under RTEC review",
            );
          }
          if (!proposal.currentVersionId) {
            throw new WorkflowError(404, "NO_CURRENT_VERSION", "Proposal has no current version");
          }

          const existing = await tx.rtecReview.findFirst({
            where: {
              proposalId: params.id,
              proposalVersionId: proposal.currentVersionId,
              reviewerUserId: currentUser.id,
            },
          });

          if (existing?.isSubmitted) {
            throw new WorkflowError(
              409,
              "REVIEW_ALREADY_SUBMITTED",
              "Your review has already been submitted. Ask the RTEC Head to reopen it before editing.",
            );
          }

          let reviewRow;
          if (existing) {
            reviewRow = await tx.rtecReview.update({
              where: { id: existing.id },
              data: { overallRemarks: body.overallRemarks ?? existing.overallRemarks },
            });
            if (body.items) {
              await tx.rtecReviewItem.deleteMany({ where: { rtecReviewId: existing.id } });
            }
          } else {
            reviewRow = await tx.rtecReview.create({
              data: {
                proposalId: params.id,
                proposalVersionId: proposal.currentVersionId,
                rtecGroupId: body.rtecGroupId,
                reviewerUserId: currentUser.id,
                status: "DRAFT",
                overallRemarks: body.overallRemarks ?? null,
              },
            });
          }

          if (body.items && body.items.length > 0) {
            await tx.rtecReviewItem.createMany({
              data: body.items.map((item) => ({
                rtecReviewId: reviewRow.id,
                formSectionId: item.formSectionId ?? null,
                remarks: item.remarks,
              })),
            });
          }

          return tx.rtecReview.findUniqueOrThrow({
            where: { id: reviewRow.id },
            include: { items: true },
          });
        });

        return reply.status(200).send({ review });
      } catch (err) {
        const handled = handleWorkflowError(err);
        return reply.status(handled.statusCode).send(handled.body);
      }
    },
  );

  // ── POST /api/proposals/:id/rtec/reviews/submit (RTEC_MEMBER) ───────────────
  fastify.post(
    "/api/proposals/:id/rtec/reviews/submit",
    { preHandler: requireAuth() },
    async (request, reply) => {
      const currentUser = request.currentUser!;
      const params = idParamSchema.parse(request.params);

      if (!currentUser.roles.includes("RTEC_MEMBER")) {
        return reply.status(403).send({ error: "Forbidden", statusCode: 403 });
      }

      try {
        const review = await prisma.$transaction(async (tx) => {
          await assertAssignedToProposal(params.id, currentUser.id, "RTEC_MEMBER", tx);

          const proposal = await tx.proposal.findUniqueOrThrow({ where: { id: params.id } });
          if (!proposal.currentVersionId) {
            throw new WorkflowError(404, "NO_CURRENT_VERSION", "Proposal has no current version");
          }

          const existing = await tx.rtecReview.findFirst({
            where: {
              proposalId: params.id,
              proposalVersionId: proposal.currentVersionId,
              reviewerUserId: currentUser.id,
            },
            include: { items: true },
          });

          if (!existing) {
            throw new WorkflowError(404, "REVIEW_NOT_FOUND", "You have not started a review for this proposal yet");
          }
          if (existing.isSubmitted) {
            throw new WorkflowError(409, "REVIEW_ALREADY_SUBMITTED", "Your review has already been submitted");
          }

          const hasContent =
            (existing.overallRemarks && existing.overallRemarks.trim().length > 0) ||
            existing.items.length > 0;
          if (!hasContent) {
            throw new WorkflowError(
              422,
              "REVIEW_CONTENT_REQUIRED",
              "A review must include overall remarks or at least one item before it can be submitted",
            );
          }

          const updated = await tx.rtecReview.update({
            where: { id: existing.id },
            data: { isSubmitted: true, submittedAt: new Date(), status: "SUBMITTED" },
            include: { items: true },
          });

          await tx.auditLog.create({
            data: {
              actorUserId: currentUser.id,
              actorRole: "RTEC_MEMBER",
              action: "RTEC_REVIEW_SUBMIT",
              entityType: "rtec_reviews",
              entityId: updated.id,
              beforeState: JSON.stringify({ isSubmitted: false }),
              afterState: JSON.stringify({ isSubmitted: true }),
              ipAddress: request.ip ?? null,
            },
          });

          await checkQuorumAndMaybeAdvance(
            params.id,
            proposal.currentVersionId,
            existing.rtecGroupId,
            currentUser.id,
            "RTEC_MEMBER",
            tx,
          );

          return updated;
        });

        return reply.status(200).send({ review });
      } catch (err) {
        const handled = handleWorkflowError(err);
        return reply.status(handled.statusCode).send(handled.body);
      }
    },
  );

  // ── GET /api/proposals/:id/rtec/consolidation (RTEC_HEAD) ───────────────────
  fastify.get(
    "/api/proposals/:id/rtec/consolidation",
    { preHandler: requireAuth() },
    async (request, reply) => {
      const currentUser = request.currentUser!;
      const params = idParamSchema.parse(request.params);

      if (!currentUser.roles.includes("RTEC_HEAD")) {
        return reply.status(403).send({ error: "Forbidden", statusCode: 403 });
      }

      try {
        const consolidation = await prisma.$transaction(async (tx) => {
          const rtecGroupId = await resolveHeadGroupId(params.id, currentUser.id, tx);
          return tx.rtecConsolidation.findFirst({
            where: { proposalId: params.id, rtecGroupId },
            orderBy: { createdAt: "desc" },
          });
        });

        if (!consolidation) {
          return reply.status(404).send({ error: "Not Found", statusCode: 404 });
        }
        return reply.status(200).send({ consolidation });
      } catch (err) {
        const handled = handleWorkflowError(err);
        return reply.status(handled.statusCode).send(handled.body);
      }
    },
  );

  // ── POST /api/proposals/:id/rtec/consolidation (RTEC_HEAD) ──────────────────
  fastify.post(
    "/api/proposals/:id/rtec/consolidation",
    { preHandler: requireAuth() },
    async (request, reply) => {
      const currentUser = request.currentUser!;
      const params = idParamSchema.parse(request.params);

      if (!currentUser.roles.includes("RTEC_HEAD")) {
        return reply.status(403).send({ error: "Forbidden", statusCode: 403 });
      }

      let body: z.infer<typeof upsertConsolidationBodySchema>;
      try {
        body = upsertConsolidationBodySchema.parse(request.body);
      } catch {
        return reply.status(422).send({
          error: "Unprocessable Entity",
          code: "VALIDATION_ERROR",
          message: "rtecGroupId, recommendation, and consolidatedRemarks are required",
          statusCode: 422,
        });
      }

      try {
        const consolidation = await prisma.$transaction(async (tx) => {
          await assertAssignedToProposal(params.id, currentUser.id, "RTEC_HEAD", tx);
          await assertActiveRtecMembership(body.rtecGroupId, currentUser.id, "HEAD", tx);

          const proposal = await tx.proposal.findUniqueOrThrow({ where: { id: params.id } });
          if (proposal.status !== "UNDER_RTEC_HEAD_CONSOLIDATION") {
            throw new WorkflowError(
              409,
              "NOT_UNDER_CONSOLIDATION",
              "This proposal is not currently under RTEC Head consolidation",
            );
          }
          if (!proposal.currentVersionId) {
            throw new WorkflowError(404, "NO_CURRENT_VERSION", "Proposal has no current version");
          }

          const existing = await tx.rtecConsolidation.findFirst({
            where: { proposalId: params.id, rtecGroupId: body.rtecGroupId },
            orderBy: { createdAt: "desc" },
          });

          if (existing?.isSubmitted) {
            throw new WorkflowError(
              409,
              "CONSOLIDATION_ALREADY_SUBMITTED",
              "The consolidation for this round has already been submitted",
            );
          }

          if (existing) {
            return tx.rtecConsolidation.update({
              where: { id: existing.id },
              data: {
                recommendation: body.recommendation,
                consolidatedRemarks: body.consolidatedRemarks,
              },
            });
          }

          return tx.rtecConsolidation.create({
            data: {
              proposalId: params.id,
              proposalVersionId: proposal.currentVersionId,
              rtecGroupId: body.rtecGroupId,
              consolidatedBy: currentUser.id,
              recommendation: body.recommendation,
              consolidatedRemarks: body.consolidatedRemarks,
            },
          });
        });

        return reply.status(200).send({ consolidation });
      } catch (err) {
        const handled = handleWorkflowError(err);
        return reply.status(handled.statusCode).send(handled.body);
      }
    },
  );

  // ── POST /api/proposals/:id/rtec/consolidation/submit (RTEC_HEAD) ───────────
  fastify.post(
    "/api/proposals/:id/rtec/consolidation/submit",
    { preHandler: requireAuth() },
    async (request, reply) => {
      const currentUser = request.currentUser!;
      const params = idParamSchema.parse(request.params);

      if (!currentUser.roles.includes("RTEC_HEAD")) {
        return reply.status(403).send({ error: "Forbidden", statusCode: 403 });
      }

      try {
        const result = await prisma.$transaction(async (tx) => {
          await assertAssignedToProposal(params.id, currentUser.id, "RTEC_HEAD", tx);
          return performRtecSubmitRecommendation(params.id, currentUser.id, tx);
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

  // ── POST /api/proposals/:id/rtec/reviews/:reviewId/reopen (RTEC_HEAD) ───────
  fastify.post(
    "/api/proposals/:id/rtec/reviews/:reviewId/reopen",
    { preHandler: requireAuth() },
    async (request, reply) => {
      const currentUser = request.currentUser!;
      const params = reviewIdParamSchema.parse(request.params);
      const body = reopenBodySchema.safeParse(request.body);

      if (!currentUser.roles.includes("RTEC_HEAD")) {
        return reply.status(403).send({ error: "Forbidden", statusCode: 403 });
      }

      try {
        const review = await prisma.$transaction(async (tx) => {
          const rtecGroupId = await resolveHeadGroupId(params.id, currentUser.id, tx);

          const existing = await tx.rtecReview.findFirst({
            where: { id: params.reviewId, proposalId: params.id, rtecGroupId },
          });
          if (!existing) {
            throw new WorkflowError(404, "REVIEW_NOT_FOUND", "Review not found for this proposal's RTEC group");
          }
          if (!existing.isSubmitted) {
            throw new WorkflowError(409, "REVIEW_NOT_SUBMITTED", "Only a submitted review can be reopened");
          }

          const updated = await tx.rtecReview.update({
            where: { id: existing.id },
            data: { isSubmitted: false, status: "DRAFT", submittedAt: null },
          });

          await tx.auditLog.create({
            data: {
              actorUserId: currentUser.id,
              actorRole: "RTEC_HEAD",
              action: "RTEC_REVIEW_REOPEN",
              entityType: "rtec_reviews",
              entityId: updated.id,
              beforeState: JSON.stringify({ isSubmitted: true }),
              afterState: JSON.stringify({ isSubmitted: false, reason: body.success ? (body.data.reason ?? null) : null }),
              ipAddress: request.ip ?? null,
            },
          });

          return updated;
        });

        return reply.status(200).send({ review });
      } catch (err) {
        const handled = handleWorkflowError(err);
        return reply.status(handled.statusCode).send(handled.body);
      }
    },
  );
}
