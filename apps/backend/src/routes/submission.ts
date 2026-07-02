import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db/client.js";
import { requireAuth } from "../middleware/auth.js";
import { auditLog } from "../services/auditLog.js";

// ── Zod schemas ──────────────────────────────────────────────────────────────

const idParamSchema = z.object({ id: z.string().uuid() });

// ── Route plugin ─────────────────────────────────────────────────────────────

export default async function submissionRoutes(fastify: FastifyInstance) {
  // POST /api/proposals/:id/submit — APPLICANT owner only
  fastify.post(
    "/api/proposals/:id/submit",
    { preHandler: requireAuth() },
    async (request, reply) => {
      const currentUser = request.currentUser!;
      const params = idParamSchema.parse(request.params);

      const proposal = await prisma.proposal.findUnique({
        where: { id: params.id },
        include: { currentVersion: true },
      });

      if (!proposal) {
        return reply.status(404).send({ error: "Not Found", statusCode: 404 });
      }

      // APPLICANT + owner check
      const isApplicant =
        currentUser.roles.includes("APPLICANT") &&
        currentUser.roles.every((r) => r === "APPLICANT");
      if (!isApplicant || proposal.applicantUserId !== currentUser.id) {
        return reply.status(403).send({ error: "Forbidden", statusCode: 403 });
      }

      // Status guard: must be DRAFT
      if (proposal.status !== "DRAFT") {
        return reply.status(409).send({
          error: "Conflict",
          message: "Proposal is not in DRAFT status",
        });
      }

      // Version guard: must not already be submitted
      if (!proposal.currentVersion) {
        return reply.status(400).send({ error: "Bad Request", message: "No current version" });
      }
      if (proposal.currentVersion.isSubmitted) {
        return reply.status(409).send({
          error: "Conflict",
          message: "Version already submitted",
        });
      }

      const now = new Date();

      // Update version: isSubmitted = true, submittedAt = now
      await prisma.proposalVersion.update({
        where: { id: proposal.currentVersionId! },
        data: { isSubmitted: true, submittedAt: now },
      });

      // Update proposal: status = SUBMITTED_TO_FOCAL, submittedAt = now
      const updated = await prisma.proposal.update({
        where: { id: proposal.id },
        data: { status: "SUBMITTED_TO_FOCAL", submittedAt: now },
      });

      // Audit log
      await auditLog(prisma, {
        actorUserId: currentUser.id,
        actorRole: currentUser.roles[0] ?? null,
        action: "PROPOSAL_SUBMITTED",
        entityType: "proposals",
        entityId: proposal.id,
        ipAddress: request.ip ?? null,
      });

      return reply.status(200).send({
        id: updated.id,
        status: updated.status,
        submittedAt: updated.submittedAt,
        currentVersionId: updated.currentVersionId,
      });
    },
  );

  // POST /api/proposals/:id/resubmit — APPLICANT owner only
  fastify.post(
    "/api/proposals/:id/resubmit",
    { preHandler: requireAuth() },
    async (request, reply) => {
      const currentUser = request.currentUser!;
      const params = idParamSchema.parse(request.params);

      const proposal = await prisma.proposal.findUnique({
        where: { id: params.id },
        include: { currentVersion: true },
      });

      if (!proposal) {
        return reply.status(404).send({ error: "Not Found", statusCode: 404 });
      }

      // APPLICANT + owner check
      const isApplicant =
        currentUser.roles.includes("APPLICANT") &&
        currentUser.roles.every((r) => r === "APPLICANT");
      if (!isApplicant || proposal.applicantUserId !== currentUser.id) {
        return reply.status(403).send({ error: "Forbidden", statusCode: 403 });
      }

      // Status guard: must be RETURNED_TO_APPLICANT
      if (proposal.status !== "RETURNED_TO_APPLICANT") {
        return reply.status(409).send({
          error: "Conflict",
          message: "Proposal is not in RETURNED_TO_APPLICANT status",
        });
      }

      if (!proposal.currentVersion) {
        return reply.status(400).send({ error: "Bad Request", message: "No current version" });
      }

      const previousVersion = proposal.currentVersion;

      // Create new version
      const newVersion = await prisma.proposalVersion.create({
        data: {
          proposalId: proposal.id,
          versionNumber: previousVersion.versionNumber + 1,
          formTemplateVersionId: previousVersion.formTemplateVersionId,
          createdBy: currentUser.id,
          isSubmitted: false,
          sourceVersionId: previousVersion.id,
          statusAtCreation: "RETURNED_TO_APPLICANT",
        },
      });

      // Update proposal: currentVersionId, status = RESUBMITTED_TO_FOCAL
      const updated = await prisma.proposal.update({
        where: { id: proposal.id },
        data: {
          currentVersionId: newVersion.id,
          status: "RESUBMITTED_TO_FOCAL",
        },
      });

      // Audit log
      await auditLog(prisma, {
        actorUserId: currentUser.id,
        actorRole: currentUser.roles[0] ?? null,
        action: "PROPOSAL_RESUBMITTED",
        entityType: "proposals",
        entityId: proposal.id,
        ipAddress: request.ip ?? null,
      });

      return reply.status(201).send({
        id: updated.id,
        status: updated.status,
        currentVersionId: updated.currentVersionId,
        versionNumber: newVersion.versionNumber,
      });
    },
  );
}
