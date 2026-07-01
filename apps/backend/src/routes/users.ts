import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db/client.js";
import { auditLog } from "../services/auditLog.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { generateToken, hashPassword } from "../services/auth.js";
import { invalidateUserSessions } from "../services/sessionStore.js";
import { STAFF_ROLE_CODES } from "../utils/roles.js";

const createUserSchema = z.object({
  email: z.string().email(),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  roleCodes: z.array(z.enum(STAFF_ROLE_CODES as [string, ...string[]])).min(1),
});

const updateUserSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  displayName: z.string().max(200).nullable().optional(),
});

const assignRolesSchema = z.object({
  roleCodes: z.array(z.enum(STAFF_ROLE_CODES as [string, ...string[]])).min(1),
});

function serializeUser(user: {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  displayName: string | null;
  isActive: boolean;
  mustChangePassword: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
}) {
  // Never include password_hash.
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    displayName: user.displayName,
    isActive: user.isActive,
    mustChangePassword: user.mustChangePassword,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
  };
}

export default async function usersRoutes(fastify: FastifyInstance) {
  fastify.get(
    "/api/users/me/profile",
    { preHandler: requireAuth() },
    async (request, reply) => {
      const currentUser = request.currentUser!;
      const user = await prisma.user.findUniqueOrThrow({
        where: { id: currentUser.id },
      });
      return reply.status(200).send(serializeUser(user));
    },
  );

  fastify.post(
    "/api/users",
    { preHandler: [requireAuth(), requireRole("ADMIN")] },
    async (request, reply) => {
      const body = createUserSchema.parse(request.body);
      const currentUser = request.currentUser!;

      const roles = await prisma.role.findMany({
        where: { code: { in: body.roleCodes } },
      });
      if (roles.length !== body.roleCodes.length) {
        return reply.status(400).send({ error: "Bad Request", statusCode: 400 });
      }

      const tempPassword = generateToken();
      const passwordHash = await hashPassword(tempPassword);

      const user = await prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: {
            email: body.email,
            firstName: body.firstName,
            lastName: body.lastName,
            passwordHash,
            isActive: true,
            mustChangePassword: true,
          },
        });

        await tx.userRole.createMany({
          data: roles.map((role) => ({
            userId: created.id,
            roleId: role.id,
            assignedBy: currentUser.id,
          })),
        });

        await tx.staffProfile.create({ data: { userId: created.id } });

        return created;
      });

      const invitationToken = generateToken();
      await prisma.userInvitation.create({
        data: {
          userId: user.id,
          token: invitationToken,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });

      await auditLog(prisma, {
        actorUserId: currentUser.id,
        actorRole: "ADMIN",
        action: "USER_CREATED",
        entityType: "users",
        entityId: user.id,
        afterState: { email: user.email, roleCodes: body.roleCodes },
        ipAddress: request.ip,
      });

      // MVP: invitation token displayed to Admin rather than emailed (no SMTP).
      return reply.status(201).send({
        ...serializeUser(user),
        invitationToken,
      });
    },
  );

  fastify.patch(
    "/api/users/:id",
    { preHandler: [requireAuth(), requireRole("ADMIN")] },
    async (request, reply) => {
      const params = z.object({ id: z.string().uuid() }).parse(request.params);
      const body = updateUserSchema.parse(request.body);
      const currentUser = request.currentUser!;

      const before = await prisma.user.findUnique({ where: { id: params.id } });
      if (!before) {
        return reply.status(404).send({ error: "Not Found", statusCode: 404 });
      }

      const updated = await prisma.user.update({
        where: { id: params.id },
        data: body,
      });

      await auditLog(prisma, {
        actorUserId: currentUser.id,
        actorRole: "ADMIN",
        action: "USER_UPDATED",
        entityType: "users",
        entityId: updated.id,
        beforeState: serializeUser(before),
        afterState: serializeUser(updated),
        ipAddress: request.ip,
      });

      return reply.status(200).send(serializeUser(updated));
    },
  );

  fastify.post(
    "/api/users/:id/deactivate",
    { preHandler: [requireAuth(), requireRole("ADMIN")] },
    async (request, reply) => {
      const params = z.object({ id: z.string().uuid() }).parse(request.params);
      const currentUser = request.currentUser!;

      const user = await prisma.user.findUnique({ where: { id: params.id } });
      if (!user) {
        return reply.status(404).send({ error: "Not Found", statusCode: 404 });
      }

      const updated = await prisma.user.update({
        where: { id: params.id },
        data: { isActive: false },
      });

      await invalidateUserSessions(prisma, params.id);

      await auditLog(prisma, {
        actorUserId: currentUser.id,
        actorRole: "ADMIN",
        action: "USER_DEACTIVATED",
        entityType: "users",
        entityId: updated.id,
        beforeState: { isActive: user.isActive },
        afterState: { isActive: updated.isActive },
        ipAddress: request.ip,
      });

      return reply.status(200).send(serializeUser(updated));
    },
  );

  fastify.post(
    "/api/users/:id/reactivate",
    { preHandler: [requireAuth(), requireRole("ADMIN")] },
    async (request, reply) => {
      const params = z.object({ id: z.string().uuid() }).parse(request.params);
      const currentUser = request.currentUser!;

      const user = await prisma.user.findUnique({ where: { id: params.id } });
      if (!user) {
        return reply.status(404).send({ error: "Not Found", statusCode: 404 });
      }

      const updated = await prisma.user.update({
        where: { id: params.id },
        data: { isActive: true, mustChangePassword: true },
      });

      await auditLog(prisma, {
        actorUserId: currentUser.id,
        actorRole: "ADMIN",
        action: "USER_REACTIVATED",
        entityType: "users",
        entityId: updated.id,
        beforeState: { isActive: user.isActive },
        afterState: { isActive: updated.isActive },
        ipAddress: request.ip,
      });

      return reply.status(200).send(serializeUser(updated));
    },
  );

  fastify.post(
    "/api/users/:id/roles",
    { preHandler: [requireAuth(), requireRole("ADMIN")] },
    async (request, reply) => {
      const params = z.object({ id: z.string().uuid() }).parse(request.params);
      const body = assignRolesSchema.parse(request.body);
      const currentUser = request.currentUser!;

      const user = await prisma.user.findUnique({ where: { id: params.id } });
      if (!user) {
        return reply.status(404).send({ error: "Not Found", statusCode: 404 });
      }

      const roles = await prisma.role.findMany({
        where: { code: { in: body.roleCodes } },
      });
      if (roles.length !== body.roleCodes.length) {
        return reply.status(400).send({ error: "Bad Request", statusCode: 400 });
      }

      for (const role of roles) {
        await prisma.userRole.upsert({
          where: { userId_roleId: { userId: params.id, roleId: role.id } },
          update: {},
          create: { userId: params.id, roleId: role.id, assignedBy: currentUser.id },
        });
      }

      await auditLog(prisma, {
        actorUserId: currentUser.id,
        actorRole: "ADMIN",
        action: "ROLE_ASSIGNED",
        entityType: "users",
        entityId: params.id,
        afterState: { roleCodes: body.roleCodes },
        ipAddress: request.ip,
      });

      return reply.status(200).send({ status: "ok" });
    },
  );

  fastify.delete(
    "/api/users/:id/roles/:roleId",
    { preHandler: [requireAuth(), requireRole("ADMIN")] },
    async (request, reply) => {
      const params = z
        .object({ id: z.string().uuid(), roleId: z.string().uuid() })
        .parse(request.params);
      const currentUser = request.currentUser!;

      await prisma.userRole.deleteMany({
        where: { userId: params.id, roleId: params.roleId },
      });

      await auditLog(prisma, {
        actorUserId: currentUser.id,
        actorRole: "ADMIN",
        action: "ROLE_REMOVED",
        entityType: "users",
        entityId: params.id,
        afterState: { roleId: params.roleId },
        ipAddress: request.ip,
      });

      return reply.status(200).send({ status: "ok" });
    },
  );
}
