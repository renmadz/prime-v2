import crypto from "crypto";
import type { FastifyInstance } from "fastify";
import "@fastify/multipart"; // augments FastifyRequest with .file()
import { z } from "zod";
import type { Proposal } from "@prisma/client";
import { prisma } from "../db/client.js";
import { requireAuth } from "../middleware/auth.js";
import { uploadFile, getPresignedUrl } from "../services/minio.js";
import { auditLog } from "../services/auditLog.js";
import { fileTypeFromBuffer } from "file-type";

// ── Constants ────────────────────────────────────────────────────────────────

const BLOCKED_EXTENSIONS = new Set([
  ".exe", ".bat", ".sh", ".ps1", ".cmd", ".scr",
  ".dll", ".js", ".py", ".php", ".rb", ".msi", ".vbs", ".jar",
]);

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "image/jpeg",
  "image/png",
]);

const MIME_TO_EXT: Record<string, string> = {
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "image/jpeg": "jpg",
  "image/png": "png",
};

const MAX_FILE_SIZE = 52428800; // 50 MB

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

const proposalIdParamSchema = z.object({ id: z.string().uuid() });

const attachmentParamSchema = z.object({
  id: z.string().uuid(),
  attachmentId: z.string().uuid(),
});

// ── Route plugin ─────────────────────────────────────────────────────────────

export default async function attachmentsRoutes(fastify: FastifyInstance) {
  // POST /api/proposals/:id/attachments — OWNER only
  fastify.post(
    "/api/proposals/:id/attachments",
    { preHandler: requireAuth() },
    async (request, reply) => {
      const currentUser = request.currentUser!;
      const params = proposalIdParamSchema.parse(request.params);

      // OWNER check — load proposal first
      const proposal = await prisma.proposal.findUnique({
        where: { id: params.id },
      });
      if (!proposal) {
        return reply.status(404).send({ error: "Not Found", statusCode: 404 });
      }
      if (proposal.applicantUserId !== currentUser.id) {
        return reply.status(403).send({ error: "Forbidden", statusCode: 403 });
      }

      // Parse multipart
      const data = await request.file();
      if (!data) {
        return reply.status(400).send({ error: "No file uploaded", statusCode: 400 });
      }

      const buffer = await data.toBuffer();
      const originalFilename = data.filename;

      // ── 1. Extension check (before MinIO write) ──────────────────────────
      const lastDot = originalFilename.lastIndexOf(".");
      const extension =
        lastDot !== -1 ? originalFilename.slice(lastDot).toLowerCase() : "";
      if (BLOCKED_EXTENSIONS.has(extension)) {
        return reply
          .status(400)
          .send({ error: "File type not allowed", statusCode: 400 });
      }

      // ── 2. MIME magic byte check (before MinIO write) ────────────────────
      const detected = await fileTypeFromBuffer(buffer);
      if (!detected || !ALLOWED_MIME_TYPES.has(detected.mime)) {
        return reply
          .status(400)
          .send({ error: "File MIME type not allowed", statusCode: 400 });
      }
      const detectedMimeType = detected.mime;

      // ── 3. Size check (before MinIO write) ───────────────────────────────
      if (buffer.length > MAX_FILE_SIZE) {
        return reply
          .status(400)
          .send({ error: "File too large (max 50MB)", statusCode: 400 });
      }

      // Resolve current version
      if (!proposal.currentVersionId) {
        return reply
          .status(400)
          .send({ error: "Proposal has no current version", statusCode: 400 });
      }

      const ext = MIME_TO_EXT[detectedMimeType];
      const key = `${params.id}/${proposal.currentVersionId}/${crypto.randomUUID()}.${ext}`;

      // Upload to MinIO
      await uploadFile(key, buffer, buffer.length, detectedMimeType);

      // Insert ProposalAttachment record
      const attachment = await prisma.proposalAttachment.create({
        data: {
          proposalId: params.id,
          proposalVersionId: proposal.currentVersionId,
          minioKey: key,
          originalFilename,
          contentType: detectedMimeType,
          sizeBytes: buffer.length,
          uploadedBy: currentUser.id,
        },
      });

      // Audit log
      await auditLog(prisma, {
        actorUserId: currentUser.id,
        actorRole: currentUser.roles[0] ?? null,
        action: "ATTACHMENT_UPLOADED",
        entityType: "proposal_attachments",
        entityId: attachment.id,
        ipAddress: request.ip ?? null,
      });

      return reply.status(201).send({
        id: attachment.id,
        originalFilename: attachment.originalFilename,
        contentType: attachment.contentType,
        sizeBytes: Number(attachment.sizeBytes),
        uploadedAt: attachment.uploadedAt,
      });
    },
  );

  // GET /api/proposals/:id/attachments — OWNER or ASSIGNED or ADMIN
  fastify.get(
    "/api/proposals/:id/attachments",
    { preHandler: requireAuth() },
    async (request, reply) => {
      const currentUser = request.currentUser!;
      const params = proposalIdParamSchema.parse(request.params);

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

      const attachments = await prisma.proposalAttachment.findMany({
        where: { proposalId: params.id, isDeleted: false },
        orderBy: { uploadedAt: "asc" },
      });

      return reply.status(200).send(
        attachments.map((a) => ({
          id: a.id,
          originalFilename: a.originalFilename,
          contentType: a.contentType,
          sizeBytes: Number(a.sizeBytes),
          uploadedAt: a.uploadedAt,
        })),
      );
    },
  );

  // GET /api/proposals/:id/attachments/:attachmentId/download — OWNER or ASSIGNED or ADMIN
  fastify.get(
    "/api/proposals/:id/attachments/:attachmentId/download",
    { preHandler: requireAuth() },
    async (request, reply) => {
      const currentUser = request.currentUser!;
      const params = attachmentParamSchema.parse(request.params);

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

      const attachment = await prisma.proposalAttachment.findFirst({
        where: { id: params.attachmentId, proposalId: params.id, isDeleted: false },
      });

      if (!attachment) {
        return reply.status(404).send({ error: "Not Found", statusCode: 404 });
      }

      // 60-second TTL presigned URL
      const url = await getPresignedUrl(attachment.minioKey, 60);

      // Audit log
      await auditLog(prisma, {
        actorUserId: currentUser.id,
        actorRole: currentUser.roles[0] ?? null,
        action: "ATTACHMENT_DOWNLOADED",
        entityType: "proposal_attachments",
        entityId: attachment.id,
        ipAddress: request.ip ?? null,
      });

      return reply.status(200).send({ url });
    },
  );
}
