import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db/client.js";
import { auditLog } from "../services/auditLog.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const idParamSchema = z.object({ id: z.string().uuid() });
const memberParamSchema = z.object({ id: z.string().uuid(), userId: z.string().uuid() });

const createGroupSchema = z.object({
  name: z.string().min(1).max(255),
  programId: z.string().uuid().nullable().optional(),
});

const addMemberSchema = z.object({
  userId: z.string().uuid(),
  roleInGroup: z.enum(["MEMBER", "HEAD"]),
});

export default async function adminRtecGroupsRoutes(fastify: FastifyInstance) {
  // ── GET /api/admin/rtec-groups ───────────────────────────────────────────
  fastify.get(
    "/api/admin/rtec-groups",
    { preHandler: [requireAuth(), requireRole("ADMIN", "PROJECT_FOCAL", "RTEC_MEMBER", "RTEC_HEAD")] },
    async (_request, reply) => {
      const groups = await prisma.rtecGroup.findMany({
        include: { memberships: { where: { isActive: true } } },
        orderBy: { createdAt: "asc" },
      });
      return reply.status(200).send({ groups });
    },
  );

  // ── POST /api/admin/rtec-groups ──────────────────────────────────────────
  fastify.post(
    "/api/admin/rtec-groups",
    { preHandler: [requireAuth(), requireRole("ADMIN")] },
    async (request, reply) => {
      const currentUser = request.currentUser!;
      const body = createGroupSchema.parse(request.body);

      const group = await prisma.rtecGroup.create({
        data: { name: body.name, programId: body.programId ?? null, isActive: true },
      });

      await auditLog(prisma, {
        actorUserId: currentUser.id,
        actorRole: "ADMIN",
        action: "RTEC_GROUP_CREATED",
        entityType: "rtec_groups",
        entityId: group.id,
        afterState: { name: group.name, programId: group.programId },
        ipAddress: request.ip,
      });

      return reply.status(201).send({ group });
    },
  );

  // ── GET /api/admin/rtec-groups/:id/members ───────────────────────────────
  fastify.get(
    "/api/admin/rtec-groups/:id/members",
    { preHandler: [requireAuth(), requireRole("ADMIN")] },
    async (request, reply) => {
      const params = idParamSchema.parse(request.params);
      const members = await prisma.rtecMembership.findMany({
        where: { rtecGroupId: params.id },
        orderBy: { assignedAt: "asc" },
      });
      return reply.status(200).send({ members });
    },
  );

  // ── POST /api/admin/rtec-groups/:id/members ──────────────────────────────
  fastify.post(
    "/api/admin/rtec-groups/:id/members",
    { preHandler: [requireAuth(), requireRole("ADMIN")] },
    async (request, reply) => {
      const currentUser = request.currentUser!;
      const params = idParamSchema.parse(request.params);
      const body = addMemberSchema.parse(request.body);

      const targetRoleCode = body.roleInGroup === "HEAD" ? "RTEC_HEAD" : "RTEC_MEMBER";
      const hasRole = await prisma.userRole.findFirst({
        where: { userId: body.userId, role: { code: targetRoleCode } },
      });
      if (!hasRole) {
        return reply.status(400).send({
          error: "Bad Request",
          code: "USER_MISSING_ROLE",
          message: `Target user does not hold the ${targetRoleCode} role`,
          statusCode: 400,
        });
      }

      const membership = await prisma.rtecMembership.upsert({
        where: { rtecGroupId_userId: { rtecGroupId: params.id, userId: body.userId } },
        update: { roleInGroup: body.roleInGroup, isActive: true, assignedBy: currentUser.id },
        create: {
          rtecGroupId: params.id,
          userId: body.userId,
          roleInGroup: body.roleInGroup,
          isActive: true,
          assignedBy: currentUser.id,
        },
      });

      await auditLog(prisma, {
        actorUserId: currentUser.id,
        actorRole: "ADMIN",
        action: "RTEC_MEMBERSHIP_ADDED",
        entityType: "rtec_memberships",
        entityId: membership.id,
        afterState: { rtecGroupId: params.id, userId: body.userId, roleInGroup: body.roleInGroup },
        ipAddress: request.ip,
      });

      return reply.status(201).send({ membership });
    },
  );

  // ── DELETE /api/admin/rtec-groups/:id/members/:userId ────────────────────
  fastify.delete(
    "/api/admin/rtec-groups/:id/members/:userId",
    { preHandler: [requireAuth(), requireRole("ADMIN")] },
    async (request, reply) => {
      const currentUser = request.currentUser!;
      const params = memberParamSchema.parse(request.params);

      const membership = await prisma.rtecMembership.findUnique({
        where: { rtecGroupId_userId: { rtecGroupId: params.id, userId: params.userId } },
      });
      if (!membership) {
        return reply.status(404).send({ error: "Not Found", statusCode: 404 });
      }

      await prisma.rtecMembership.update({
        where: { id: membership.id },
        data: { isActive: false },
      });

      await auditLog(prisma, {
        actorUserId: currentUser.id,
        actorRole: "ADMIN",
        action: "RTEC_MEMBERSHIP_DEACTIVATED",
        entityType: "rtec_memberships",
        entityId: membership.id,
        beforeState: { isActive: true },
        afterState: { isActive: false },
        ipAddress: request.ip,
      });

      return reply.status(200).send({ id: membership.id, isActive: false });
    },
  );
}
