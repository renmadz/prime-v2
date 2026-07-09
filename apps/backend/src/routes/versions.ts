import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Proposal } from "@prisma/client";
import { prisma } from "../db/client.js";
import { requireAuth } from "../middleware/auth.js";

// ── Access helper (same pattern as proposals.ts) ─────────────────────────────

async function canAccessProposal(
  proposalId: string,
  currentUserId: string,
  roles: string[],
): Promise<{ allowed: boolean; proposal: Proposal | null }> {
  // ADMIN and REGIONAL_DIRECTOR both get unconditional access — Roles-and-
  // Permissions §3.1 marks REGIONAL_DIRECTOR "✅", not "Assigned", and no
  // workflow route ever creates a REGIONAL_DIRECTOR ProposalAssignment.
  if (roles.includes("ADMIN") || roles.includes("REGIONAL_DIRECTOR")) {
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

const compareParamSchema = z.object({
  id: z.string().uuid(),
  vId: z.string().uuid(),
  vId2: z.string().uuid(),
});

// ── Route plugin ─────────────────────────────────────────────────────────────

export default async function versionsRoutes(fastify: FastifyInstance) {
  // GET /api/proposals/:id/versions/:vId/compare/:vId2 — diff two versions
  fastify.get(
    "/api/proposals/:id/versions/:vId/compare/:vId2",
    { preHandler: requireAuth() },
    async (request, reply) => {
      const currentUser = request.currentUser!;
      const params = compareParamSchema.parse(request.params);

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

      // Roles-and-Permissions §3.1 "Compare versions": RTEC_MEMBER is ❌ (only
      // RTEC_HEAD is "Assigned"). RTEC_MEMBER still holds a real
      // ProposalAssignment (for viewing/reviewing), so the generic allowed
      // check above isn't enough — block a caller whose only basis for access
      // is an RTEC_MEMBER assignment.
      if (!currentUser.roles.includes("ADMIN") && !currentUser.roles.includes("REGIONAL_DIRECTOR")) {
        const isOwner = proposal.applicantUserId === currentUser.id;
        if (!isOwner) {
          const nonMemberAssignment = await prisma.proposalAssignment.findFirst({
            where: {
              proposalId: params.id,
              userId: currentUser.id,
              isActive: true,
              roleCode: { not: "RTEC_MEMBER" },
            },
          });
          if (!nonMemberAssignment) {
            return reply.status(403).send({ error: "Forbidden", statusCode: 403 });
          }
        }
      }

      // Both versions must belong to this proposal
      const [version1, version2] = await Promise.all([
        prisma.proposalVersion.findFirst({
          where: { id: params.vId, proposalId: params.id },
        }),
        prisma.proposalVersion.findFirst({
          where: { id: params.vId2, proposalId: params.id },
        }),
      ]);

      if (!version1 || !version2) {
        return reply.status(403).send({ error: "Forbidden", statusCode: 403 });
      }

      // Fetch field values for both versions
      const [fieldValues1, fieldValues2] = await Promise.all([
        prisma.proposalFieldValue.findMany({
          where: { proposalVersionId: params.vId },
          include: { formField: { select: { id: true, label: true } } },
        }),
        prisma.proposalFieldValue.findMany({
          where: { proposalVersionId: params.vId2 },
          include: { formField: { select: { id: true, label: true } } },
        }),
      ]);

      // Build maps keyed by formFieldId
      const map1 = new Map(fieldValues1.map((fv) => [fv.formFieldId, fv]));
      const map2 = new Map(fieldValues2.map((fv) => [fv.formFieldId, fv]));

      // Union of all fieldIds across both versions
      const allFieldIds = new Set([...map1.keys(), ...map2.keys()]);

      const diff = Array.from(allFieldIds).map((fieldId) => {
        const fv1 = map1.get(fieldId);
        const fv2 = map2.get(fieldId);
        const label = fv1?.formField.label ?? fv2?.formField.label ?? "";
        const v1Value = fv1?.value ?? null;
        const v2Value = fv2?.value ?? null;
        return {
          fieldId,
          label,
          v1Value,
          v2Value,
          changed: v1Value !== v2Value,
        };
      });

      return reply.status(200).send(diff);
    },
  );

  // GET /api/proposals/:id/history — audit log history for a proposal
  fastify.get(
    "/api/proposals/:id/history",
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

      const logs = await prisma.auditLog.findMany({
        where: {
          entityType: "proposals",
          entityId: params.id,
          action: {
            in: [
              "PROPOSAL_SUBMITTED",
              "PROPOSAL_RESUBMITTED",
              "STATUS_CHANGED",
              "COMMENT_ADDED",
              "COMMENT_RESOLVED",
            ],
          },
        },
        orderBy: { createdAt: "asc" },
      });

      return reply.status(200).send(
        logs.map((l) => ({
          action: l.action,
          actorUserId: l.actorUserId,
          createdAt: l.createdAt,
          beforeState: l.beforeState,
          afterState: l.afterState,
        })),
      );
    },
  );
}
