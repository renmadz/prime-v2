import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Proposal } from "@prisma/client";
import { prisma } from "../db/client.js";
import { requireAuth } from "../middleware/auth.js";
import { uploadFile, getPresignedUrl } from "../services/minio.js";
import { auditLog } from "../services/auditLog.js";

// ── Access helper (same pattern as attachments.ts) ──────────────────────────

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
  const withAssignments = proposal as Proposal & {
    assignments: { userId: string; isActive: boolean }[];
  };
  const isAssigned = withAssignments.assignments.length > 0;
  return { allowed: isOwner || isAssigned, proposal };
}

// ── Zod schemas ──────────────────────────────────────────────────────────────

const idParamSchema = z.object({ id: z.string().uuid() });

const exportBodySchema = z.object({
  format: z.enum(["PDF", "HTML"]).optional(),
});

// ── HTML generation (no pdfkit installed — see Task 2 fallback) ─────────────

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

interface ExportProposalData {
  title: string;
  proposalTypeName: string;
  programName: string | null;
  status: string;
  applicantName: string;
  applicantEmail: string;
  generatedAt: Date;
  sections: Array<{
    title: string;
    fields: Array<{ label: string; value: string | null }>;
  }>;
  workflowHistory: Array<{
    fromStatus: string;
    toStatus: string;
    workflowAction: string;
    actorRole: string;
    transitionedAt: Date;
    comment: string | null;
  }>;
  rdDecision: { decision: string; remarks: string | null; decidedAt: Date | null } | null;
}

function generateExportHtml(data: ExportProposalData): string {
  const sectionsHtml = data.sections
    .map(
      (section) => `
      <h2>${escapeHtml(section.title)}</h2>
      <dl>
        ${section.fields
          .map(
            (f) => `
          <dt>${escapeHtml(f.label)}</dt>
          <dd>${f.value ? escapeHtml(f.value) : "—"}</dd>
        `,
          )
          .join("")}
      </dl>
    `,
    )
    .join("");

  const historyHtml = data.workflowHistory
    .map(
      (h) => `
      <li>
        <strong>${escapeHtml(h.workflowAction.replace(/_/g, " "))}</strong>
        — ${escapeHtml(h.actorRole)} · ${escapeHtml(h.fromStatus)} → ${escapeHtml(h.toStatus)}
        · ${h.transitionedAt.toLocaleString()}
        ${h.comment ? `<br /><em>${escapeHtml(h.comment)}</em>` : ""}
      </li>
    `,
    )
    .join("");

  const rdHtml = data.rdDecision
    ? `
      <h2>RD Decision</h2>
      <dl>
        <dt>Decision</dt><dd>${escapeHtml(data.rdDecision.decision)}</dd>
        <dt>Remarks</dt><dd>${data.rdDecision.remarks ? escapeHtml(data.rdDecision.remarks) : "—"}</dd>
        <dt>Decided</dt><dd>${data.rdDecision.decidedAt ? data.rdDecision.decidedAt.toLocaleString() : "—"}</dd>
      </dl>
    `
    : "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>${escapeHtml(data.title)} — Export</title>
<style>
  body { font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif; max-width: 800px; margin: 2rem auto; padding: 0 1rem; color: #111827; }
  h1 { font-size: 1.5rem; margin-bottom: 0.25rem; }
  h2 { font-size: 1.125rem; margin-top: 2rem; border-bottom: 1px solid #e5e7eb; padding-bottom: 0.375rem; }
  .meta { color: #6b7280; font-size: 0.875rem; margin-bottom: 0.25rem; }
  dl { margin: 0.75rem 0; }
  dt { font-weight: 600; font-size: 0.8125rem; color: #6b7280; margin-top: 0.75rem; }
  dd { margin: 0.125rem 0 0 0; font-size: 0.9375rem; }
  ul { list-style: none; padding: 0; }
  li { padding: 0.75rem; border: 1px solid #e5e7eb; border-radius: 0.375rem; margin-bottom: 0.5rem; font-size: 0.875rem; }
  footer { margin-top: 3rem; padding-top: 1rem; border-top: 1px solid #e5e7eb; font-size: 0.75rem; color: #9ca3af; }
</style>
</head>
<body>
  <h1>${escapeHtml(data.title)}</h1>
  <p class="meta">${escapeHtml(data.proposalTypeName)}${data.programName ? ` · ${escapeHtml(data.programName)}` : ""}</p>
  <p class="meta">Status: ${escapeHtml(data.status)}</p>
  <p class="meta">Applicant: ${escapeHtml(data.applicantName)} (${escapeHtml(data.applicantEmail)})</p>
  <p class="meta">Generated: ${data.generatedAt.toLocaleString()}</p>

  <h2>Proposal Information</h2>
  ${sectionsHtml || "<p>No form responses recorded.</p>"}

  <h2>Workflow History</h2>
  <ul>
    ${historyHtml || "<li>No workflow history recorded.</li>"}
  </ul>

  ${rdHtml}

  <footer>PRIME v2 — DOST Region 02 | Generated: ${data.generatedAt.toLocaleString()}</footer>
</body>
</html>`;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
}

// ── Route plugin ─────────────────────────────────────────────────────────────

export default async function exportRoutes(fastify: FastifyInstance) {
  // ── POST /api/proposals/:id/export ───────────────────────────────────────
  fastify.post(
    "/api/proposals/:id/export",
    { preHandler: requireAuth() },
    async (request, reply) => {
      const currentUser = request.currentUser!;
      const params = idParamSchema.parse(request.params);
      const body = exportBodySchema.safeParse(request.body ?? {});
      const requestedFormat = body.success ? body.data.format : undefined;

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
      if (proposal.status !== "APPROVED") {
        return reply.status(409).send({
          error: "Conflict",
          code: "NOT_APPROVED",
          message: "Only approved proposals can be exported",
          statusCode: 409,
        });
      }

      try {
        const full = await prisma.proposal.findUniqueOrThrow({
          where: { id: params.id },
          include: {
            proposalType: { include: { program: true } },
            currentVersion: {
              include: {
                fieldValues: {
                  include: {
                    formField: {
                      include: { formSection: true },
                    },
                  },
                  orderBy: [
                    { formField: { formSection: { displayOrder: "asc" } } },
                    { formField: { displayOrder: "asc" } },
                  ],
                },
              },
            },
            workflowHistory: { orderBy: { transitionedAt: "asc" } },
            rdDecisions: { orderBy: { decidedAt: "desc" }, take: 1 },
            applicant: { select: { firstName: true, lastName: true, email: true } },
          },
        });

        if (!full.currentVersionId || !full.currentVersion) {
          return reply.status(409).send({
            error: "Conflict",
            code: "NO_CURRENT_VERSION",
            message: "Proposal has no current version to export",
            statusCode: 409,
          });
        }

        const sectionMap = new Map<string, { title: string; displayOrder: number; fields: Array<{ label: string; value: string | null; displayOrder: number }> }>();
        for (const fv of full.currentVersion.fieldValues) {
          const section = fv.formField.formSection;
          const key = section.id;
          if (!sectionMap.has(key)) {
            sectionMap.set(key, { title: section.title, displayOrder: section.displayOrder, fields: [] });
          }
          sectionMap.get(key)!.fields.push({
            label: fv.formField.label,
            value: fv.value,
            displayOrder: fv.formField.displayOrder,
          });
        }
        const sections = Array.from(sectionMap.values())
          .sort((a, b) => a.displayOrder - b.displayOrder)
          .map((s) => ({
            title: s.title,
            fields: s.fields.sort((a, b) => a.displayOrder - b.displayOrder),
          }));

        const generatedAt = new Date();
        // pdfkit is not installed in this environment — always fall back to HTML
        // regardless of the requested format (see Task 2 spec).
        void requestedFormat;
        const format: "PDF" | "HTML" = "HTML";

        const exportData: ExportProposalData = {
          title: full.title,
          proposalTypeName: full.proposalType.name,
          programName: full.proposalType.program?.name ?? null,
          status: full.status,
          applicantName: `${full.applicant.firstName} ${full.applicant.lastName}`,
          applicantEmail: full.applicant.email,
          generatedAt,
          sections,
          workflowHistory: full.workflowHistory.map((h) => ({
            fromStatus: h.fromStatus,
            toStatus: h.toStatus,
            workflowAction: h.workflowAction,
            actorRole: h.actorRole,
            transitionedAt: h.transitionedAt,
            comment: h.comment,
          })),
          rdDecision: full.rdDecisions[0]
            ? {
                decision: full.rdDecisions[0].decision,
                remarks: full.rdDecisions[0].remarks,
                decidedAt: full.rdDecisions[0].decidedAt,
              }
            : null,
        };

        const html = generateExportHtml(exportData);
        const buffer = Buffer.from(html, "utf-8");
        const contentType = "text/html";
        const ext = "html";

        const timestamp = Date.now();
        const key = `exports/${params.id}/${timestamp}.${ext}`;
        await uploadFile(key, buffer, buffer.length, contentType);

        const filename = `proposal-${slugify(full.title)}-${timestamp}.${ext}`;

        const exportRow = await prisma.proposalExport.create({
          data: {
            proposalId: params.id,
            proposalVersionId: full.currentVersionId,
            generatedBy: currentUser.id,
            exportFormat: format,
            minioKey: key,
            originalFilename: filename,
            sizeBytes: buffer.length,
            generatedAt,
          },
        });

        const url = await getPresignedUrl(key, 300);

        await auditLog(prisma, {
          actorUserId: currentUser.id,
          actorRole: currentUser.roles[0] ?? null,
          action: "PROPOSAL_EXPORT_GENERATED",
          entityType: "proposal_exports",
          entityId: exportRow.id,
          ipAddress: request.ip ?? null,
        });

        return reply.status(200).send({
          exportId: exportRow.id,
          url,
          filename,
          format,
          generatedAt: generatedAt.toISOString(),
        });
      } catch (err) {
        request.log.error({ err }, "export generation failed");
        return reply.status(500).send({
          error: "Export generation failed",
          code: "EXPORT_FAILED",
          statusCode: 500,
        });
      }
    },
  );

  // ── GET /api/proposals/:id/export/latest ─────────────────────────────────
  fastify.get(
    "/api/proposals/:id/export/latest",
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

      const latest = await prisma.proposalExport.findFirst({
        where: { proposalId: params.id },
        orderBy: { generatedAt: "desc" },
      });

      if (!latest) {
        return reply.status(404).send({ error: "Not Found", statusCode: 404 });
      }

      const url = await getPresignedUrl(latest.minioKey, 300);

      return reply.status(200).send({
        exportId: latest.id,
        url,
        filename: latest.originalFilename,
        format: latest.exportFormat,
        generatedAt: latest.generatedAt.toISOString(),
      });
    },
  );
}
