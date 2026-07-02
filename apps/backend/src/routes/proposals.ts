import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Proposal } from "@prisma/client";
import { prisma } from "../db/client.js";
import { requireAuth } from "../middleware/auth.js";

// ── Access helper ────────────────────────────────────────────────────────────

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
  // Prisma includes the `assignments` relation on the fetched object.
  // Cast to access it safely without `any`.
  const withAssignments = proposal as Proposal & {
    assignments: { userId: string; isActive: boolean }[];
  };
  const isAssigned = withAssignments.assignments.length > 0;
  return { allowed: isOwner || isAssigned, proposal };
}

// ── Zod schemas ──────────────────────────────────────────────────────────────

const idParamSchema = z.object({ id: z.string().uuid() });

const idVersionIdParamSchema = z.object({
  id: z.string().uuid(),
  versionId: z.string().uuid(),
});

const createProposalSchema = z.object({
  proposalTypeId: z.string().uuid(),
  title: z.string().min(1).max(500),
});

const autosaveFieldsSchema = z.object({
  fields: z.array(
    z.object({
      formFieldId: z.string().uuid(),
      value: z.string().nullable(),
    }),
  ),
});

// ── Route plugin ─────────────────────────────────────────────────────────────

export default async function proposalsRoutes(fastify: FastifyInstance) {
  // POST /api/proposals — APPLICANT only, create DRAFT
  fastify.post(
    "/api/proposals",
    { preHandler: requireAuth() },
    async (request, reply) => {
      const currentUser = request.currentUser!;

      // Only APPLICANT may create proposals; any other role → 403.
      const isApplicantOnly =
        currentUser.roles.includes("APPLICANT") &&
        currentUser.roles.every((r) => r === "APPLICANT");
      if (!isApplicantOnly) {
        return reply.status(403).send({ error: "Forbidden", statusCode: 403 });
      }

      const body = createProposalSchema.parse(request.body);

      // Verify proposalType exists and is active.
      const proposalType = await prisma.proposalType.findUnique({
        where: { id: body.proposalTypeId },
      });
      if (!proposalType || !proposalType.isActive) {
        return reply.status(404).send({ error: "Not Found", statusCode: 404 });
      }

      // Resolve the current FormTemplateVersion.
      if (!proposalType.defaultFormTemplateId) {
        return reply
          .status(400)
          .send({ error: "Bad Request", message: "No form template configured for this proposal type" });
      }
      const currentFormVersion = await prisma.formTemplateVersion.findFirst({
        where: {
          formTemplateId: proposalType.defaultFormTemplateId,
          isCurrent: true,
        },
      });
      if (!currentFormVersion) {
        return reply
          .status(400)
          .send({ error: "Bad Request", message: "No form template configured for this proposal type" });
      }

      // Transactionally create Proposal + ProposalVersion v1, then link them.
      const result = await prisma.$transaction(async (tx) => {
        const proposal = await tx.proposal.create({
          data: {
            applicantUserId: currentUser.id,
            proposalTypeId: body.proposalTypeId,
            title: body.title,
            status: "DRAFT",
            isLocked: false,
          },
        });

        const version = await tx.proposalVersion.create({
          data: {
            proposalId: proposal.id,
            versionNumber: 1,
            formTemplateVersionId: currentFormVersion.id,
            createdBy: currentUser.id,
            statusAtCreation: "DRAFT",
            isSubmitted: false,
          },
        });

        const updated = await tx.proposal.update({
          where: { id: proposal.id },
          data: { currentVersionId: version.id },
        });

        return { proposal: updated, version };
      });

      return reply.status(201).send({
        id: result.proposal.id,
        title: result.proposal.title,
        status: result.proposal.status,
        currentVersionId: result.proposal.currentVersionId,
        createdAt: result.proposal.createdAt,
      });
    },
  );

  // GET /api/proposals — role-filtered list
  fastify.get(
    "/api/proposals",
    { preHandler: requireAuth() },
    async (request, reply) => {
      const currentUser = request.currentUser!;

      const isApplicant = currentUser.roles.includes("APPLICANT");

      const proposals = await prisma.proposal.findMany({
        where: isApplicant ? { applicantUserId: currentUser.id } : undefined,
        include: { proposalType: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
      });

      return reply.status(200).send(
        proposals.map((p) => ({
          id: p.id,
          title: p.title,
          status: p.status,
          proposalType: { name: p.proposalType.name },
          createdAt: p.createdAt,
          updatedAt: p.updatedAt,
        })),
      );
    },
  );

  // GET /api/proposals/:id — detail with current version
  fastify.get(
    "/api/proposals/:id",
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

      // Fetch full detail with relations.
      const full = await prisma.proposal.findUniqueOrThrow({
        where: { id: params.id },
        include: {
          proposalType: { select: { id: true, name: true } },
          currentVersion: {
            include: {
              fieldValues: {
                select: { formFieldId: true, value: true },
              },
            },
          },
        },
      });

      return reply.status(200).send({
        id: full.id,
        title: full.title,
        status: full.status,
        applicantUserId: full.applicantUserId,
        currentVersionId: full.currentVersionId,
        proposalType: { id: full.proposalType.id, name: full.proposalType.name },
        createdAt: full.createdAt,
        updatedAt: full.updatedAt,
        currentVersion: full.currentVersion
          ? {
              id: full.currentVersion.id,
              versionNumber: full.currentVersion.versionNumber,
              isSubmitted: full.currentVersion.isSubmitted,
              fieldValues: full.currentVersion.fieldValues.map((fv) => ({
                formFieldId: fv.formFieldId,
                value: fv.value,
              })),
            }
          : null,
      });
    },
  );

  // PATCH /api/proposals/:id/versions/draft/fields — autosave (OWNER only)
  fastify.patch(
    "/api/proposals/:id/versions/draft/fields",
    { preHandler: requireAuth() },
    async (request, reply) => {
      const currentUser = request.currentUser!;
      const params = idParamSchema.parse(request.params);

      // Load proposal + currentVersion FIRST — before any write.
      const proposal = await prisma.proposal.findUnique({
        where: { id: params.id },
        include: { currentVersion: true },
      });

      if (!proposal) {
        return reply.status(404).send({ error: "Not Found", statusCode: 404 });
      }

      // OWNER check.
      if (proposal.applicantUserId !== currentUser.id) {
        return reply.status(403).send({ error: "Forbidden", statusCode: 403 });
      }

      // CRITICAL: 409 if current version is already submitted — before any write.
      if (proposal.currentVersion?.isSubmitted === true) {
        return reply.status(409).send({
          error: "Conflict",
          message: "Version already submitted",
        });
      }

      if (!proposal.currentVersionId || !proposal.currentVersion) {
        return reply.status(400).send({ error: "Bad Request", message: "No current version" });
      }

      const body = autosaveFieldsSchema.parse(request.body);

      // Upsert each field value.
      await Promise.all(
        body.fields.map((field) =>
          prisma.proposalFieldValue.upsert({
            where: {
              proposalVersionId_formFieldId: {
                proposalVersionId: proposal.currentVersionId!,
                formFieldId: field.formFieldId,
              },
            },
            update: { value: field.value },
            create: {
              proposalVersionId: proposal.currentVersionId!,
              formFieldId: field.formFieldId,
              value: field.value,
            },
          }),
        ),
      );

      // Touch updatedAt on the proposal (Prisma @updatedAt handles this automatically).
      await prisma.proposal.update({
        where: { id: params.id },
        data: { updatedAt: new Date() },
      });

      return reply.status(200).send({ status: "saved", savedAt: new Date().toISOString() });
    },
  );

  // GET /api/proposals/:id/versions — version list
  fastify.get(
    "/api/proposals/:id/versions",
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

      const versions = await prisma.proposalVersion.findMany({
        where: { proposalId: params.id },
        orderBy: { versionNumber: "asc" },
        select: {
          id: true,
          versionNumber: true,
          isSubmitted: true,
          statusAtCreation: true,
          createdAt: true,
          submittedAt: true,
        },
      });

      return reply.status(200).send(versions);
    },
  );

  // GET /api/proposals/:id/versions/:versionId — full snapshot
  fastify.get(
    "/api/proposals/:id/versions/:versionId",
    { preHandler: requireAuth() },
    async (request, reply) => {
      const currentUser = request.currentUser!;
      const params = idVersionIdParamSchema.parse(request.params);

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

      const version = await prisma.proposalVersion.findFirst({
        where: { id: params.versionId, proposalId: params.id },
        include: {
          fieldValues: {
            select: { formFieldId: true, value: true },
          },
        },
      });

      if (!version) {
        return reply.status(404).send({ error: "Not Found", statusCode: 404 });
      }

      return reply.status(200).send({
        id: version.id,
        versionNumber: version.versionNumber,
        isSubmitted: version.isSubmitted,
        statusAtCreation: version.statusAtCreation,
        createdAt: version.createdAt,
        fieldValues: version.fieldValues.map((fv) => ({
          formFieldId: fv.formFieldId,
          value: fv.value,
        })),
      });
    },
  );
}
