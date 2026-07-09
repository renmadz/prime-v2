import type { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../db/client.js";
import { auditLog } from "../services/auditLog.js";
import { requireAuth } from "../middleware/auth.js";
import { checkStaffLoginRateLimit, RateLimitExceededError } from "../services/rateLimit.js";
import {
  completeApplicantConsent,
  findApplicantByGoogleId,
  generateToken,
  hashPassword,
  issueApplicantSession,
  issueStaffSession,
  userHasStaffRole,
  verifyStaffCredentials,
  verifyDevLocalCredentials,
} from "../services/auth.js";

export const SESSION_COOKIE_NAME = "sessionId";

const CONSENT_PENDING_TTL_MS = 15 * 60 * 1000;

const staffLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z
    .string()
    .min(12)
    .regex(/[A-Z]/, "Password must include an uppercase letter")
    .regex(/[a-z]/, "Password must include a lowercase letter")
    .regex(/[0-9]/, "Password must include a digit")
    .regex(/[^A-Za-z0-9]/, "Password must include a special character"),
});

const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

const resetPasswordSchema = z.object({
  token: z.string().min(1),
  newPassword: z
    .string()
    .min(12)
    .regex(/[A-Z]/)
    .regex(/[a-z]/)
    .regex(/[0-9]/)
    .regex(/[^A-Za-z0-9]/),
});

const consentSchema = z.object({
  accepted: z.boolean(),
});

export default async function authRoutes(fastify: FastifyInstance) {
  // ── Applicant path: Google OAuth ──────────────────────────────
  fastify.get("/api/auth/google", async (request, reply) => {
    return fastify.oauth2Google!.generateAuthorizationUri(
      request,
      reply,
      (err, authorizationEndpoint) => {
        if (err) {
          fastify.log.error(err);
          return reply.status(500).send({ error: "Internal Server Error", statusCode: 500 });
        }
        return reply.redirect(authorizationEndpoint);
      },
    );
  });

  fastify.get("/api/auth/google/callback", async (request, reply) => {
    let token;
    try {
      token = await fastify.oauth2Google!.getAccessTokenFromAuthorizationCodeFlow(request);
    } catch (error) {
      fastify.log.warn({ error }, "Google OAuth state/code validation failed");
      await auditLog(prisma, {
        action: "AUTH_CSRF_FAILURE",
        entityType: "users",
        ipAddress: request.ip,
      });
      return reply.status(400).send({ error: "Bad Request", statusCode: 400 });
    }

    const userInfoResponse = await fetch(
      "https://www.googleapis.com/oauth2/v2/userinfo",
      { headers: { Authorization: `Bearer ${token.token.access_token}` } },
    );
    if (!userInfoResponse.ok) {
      return reply.status(502).send({ error: "Bad Gateway", statusCode: 502 });
    }
    const profile = (await userInfoResponse.json()) as {
      id: string;
      email: string;
      given_name?: string;
      family_name?: string;
      name?: string;
    };

    const existing = await findApplicantByGoogleId(prisma, profile.id);

    if (existing) {
      if (userHasStaffRole(existing)) {
        await auditLog(prisma, {
          actorUserId: existing.id,
          action: "USER_LOGIN_FAILED",
          entityType: "users",
          entityId: existing.id,
          ipAddress: request.ip,
          afterState: { reason: "staff_role_via_google" },
        });
        return reply.status(403).send({ error: "Forbidden", statusCode: 403 });
      }
      if (!existing.isActive) {
        return reply.status(403).send({ error: "Forbidden", statusCode: 403 });
      }

      await prisma.user.update({
        where: { id: existing.id },
        data: { lastLoginAt: new Date() },
      });
      issueApplicantSession(request.session as never, existing);
      await auditLog(prisma, {
        actorUserId: existing.id,
        actorRole: "APPLICANT",
        action: "USER_LOGIN_SUCCESS",
        entityType: "users",
        entityId: existing.id,
        ipAddress: request.ip,
      });
      return reply.redirect(`${fastify.config.FRONTEND_URL}/dashboard`);
    }

    // First login — do not create a users row until consent is accepted.
    (request.session as unknown as { pendingConsent?: unknown }).pendingConsent = {
      googleId: profile.id,
      email: profile.email,
      firstName: profile.given_name ?? profile.name ?? "Applicant",
      lastName: profile.family_name ?? "",
      expiresAt: Date.now() + CONSENT_PENDING_TTL_MS,
    };
    return reply.redirect(`${fastify.config.FRONTEND_URL}/consent`);
  });

  fastify.post("/api/auth/consent", async (request, reply) => {
    const body = consentSchema.parse(request.body);
    const pending = (
      request.session as unknown as {
        pendingConsent?: {
          googleId: string;
          email: string;
          firstName: string;
          lastName: string;
          expiresAt: number;
        };
      }
    ).pendingConsent;

    if (!pending || Date.now() > pending.expiresAt) {
      return reply.status(400).send({ error: "Bad Request", statusCode: 400 });
    }

    if (!body.accepted) {
      await auditLog(prisma, {
        action: "CONSENT_DECLINED",
        entityType: "users",
        ipAddress: request.ip,
      });
      delete (request.session as unknown as { pendingConsent?: unknown }).pendingConsent;
      return reply.status(200).send({ status: "declined" });
    }

    const user = await completeApplicantConsent(prisma, {
      googleId: pending.googleId,
      email: pending.email,
      firstName: pending.firstName,
      lastName: pending.lastName,
    });
    delete (request.session as unknown as { pendingConsent?: unknown }).pendingConsent;

    issueApplicantSession(request.session as never, user);

    await auditLog(prisma, {
      actorUserId: user.id,
      actorRole: "APPLICANT",
      action: "CONSENT_GIVEN",
      entityType: "users",
      entityId: user.id,
      ipAddress: request.ip,
    });

    return reply.status(200).send({ status: "ok" });
  });

  // ── Staff path: email + password ──────────────────────────────
  fastify.post("/api/auth/staff/login", async (request, reply) => {
    const body = staffLoginSchema.parse(request.body);

    // Local dev: @dev.local seeded accounts (all roles, including APPLICANT).
    if (
      fastify.config.NODE_ENV !== "production" &&
      body.email.endsWith("@dev.local")
    ) {
      const devResult = await verifyDevLocalCredentials(
        prisma,
        body.email,
        body.password,
      );

      if (devResult.outcome === "invalid_credentials") {
        return reply.status(401).send({ error: "Unauthorized", statusCode: 401 });
      }
      if (devResult.outcome === "deactivated") {
        return reply.status(403).send({ error: "Forbidden", statusCode: 403 });
      }
      if (devResult.outcome === "success") {
        const user = devResult.user;
        await prisma.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        });
        if (devResult.isApplicantOnly) {
          issueApplicantSession(request.session as never, user);
        } else {
          issueStaffSession(
            request.session as never,
            user,
            user.mustChangePassword,
          );
        }
        return reply.status(200).send({
          status: "ok",
          mustChangePassword: user.mustChangePassword,
        });
      }
    }

    try {
      await checkStaffLoginRateLimit(prisma, {
        ipAddress: request.ip,
        email: body.email,
      });
    } catch (error) {
      if (error instanceof RateLimitExceededError) {
        return reply.status(429).send({ error: "Too Many Requests", statusCode: 429 });
      }
      throw error;
    }

    const result = await verifyStaffCredentials(prisma, body.email, body.password);

    if (result.outcome === "invalid_credentials" || result.outcome === "applicant_only") {
      await auditLog(prisma, {
        action: "USER_LOGIN_FAILED",
        entityType: "users",
        ipAddress: request.ip,
        afterState: { email: body.email },
      });
      return reply.status(401).send({ error: "Unauthorized", statusCode: 401 });
    }

    if (result.outcome === "deactivated") {
      await auditLog(prisma, {
        action: "USER_LOGIN_FAILED",
        entityType: "users",
        ipAddress: request.ip,
        afterState: { email: body.email, reason: "deactivated" },
      });
      return reply.status(403).send({ error: "Forbidden", statusCode: 403 });
    }

    const user = result.user;
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    issueStaffSession(request.session as never, user, user.mustChangePassword);

    await auditLog(prisma, {
      actorUserId: user.id,
      action: "USER_LOGIN_SUCCESS",
      entityType: "users",
      entityId: user.id,
      ipAddress: request.ip,
    });

    return reply.status(200).send({
      status: "ok",
      mustChangePassword: user.mustChangePassword,
    });
  });

  fastify.post(
    "/api/auth/change-password",
    { preHandler: requireAuth() },
    async (request, reply) => {
      const body = changePasswordSchema.parse(request.body);
      const currentUser = request.currentUser!;

      const user = await prisma.user.findUniqueOrThrow({
        where: { id: currentUser.id },
      });

      if (!user.passwordHash) {
        return reply.status(400).send({ error: "Bad Request", statusCode: 400 });
      }

      const matches = await bcrypt.compare(body.currentPassword, user.passwordHash);
      if (!matches) {
        return reply.status(401).send({ error: "Unauthorized", statusCode: 401 });
      }

      const newHash = await hashPassword(body.newPassword);
      await prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: newHash, mustChangePassword: false },
      });

      (request.session as unknown as { restricted?: boolean }).restricted = false;

      await auditLog(prisma, {
        actorUserId: user.id,
        action: "PASSWORD_CHANGED",
        entityType: "users",
        entityId: user.id,
        ipAddress: request.ip,
      });

      return reply.status(200).send({ status: "ok" });
    },
  );

  fastify.post("/api/auth/forgot-password", async (request, reply) => {
    const body = forgotPasswordSchema.parse(request.body);
    const user = await prisma.user.findUnique({ where: { email: body.email } });

    // Always return 200 regardless of whether the account exists, to avoid
    // revealing account existence (mirrors the staff login generic-error rule).
    if (!user || !user.passwordHash) {
      return reply.status(200).send({ status: "ok" });
    }

    const token = generateToken();
    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        token,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    await auditLog(prisma, {
      actorUserId: user.id,
      action: "PASSWORD_RESET_REQUESTED",
      entityType: "users",
      entityId: user.id,
      ipAddress: request.ip,
    });

    // MVP: token surfaced to Admin UI rather than emailed (no SMTP in MVP).
    return reply.status(200).send({ status: "ok", token });
  });

  fastify.post("/api/auth/reset-password", async (request, reply) => {
    const body = resetPasswordSchema.parse(request.body);

    const resetToken = await prisma.passwordResetToken.findUnique({
      where: { token: body.token },
    });

    if (!resetToken || resetToken.used || resetToken.expiresAt < new Date()) {
      return reply.status(400).send({ error: "Bad Request", statusCode: 400 });
    }

    const newHash = await hashPassword(body.newPassword);

    await prisma.$transaction([
      prisma.user.update({
        where: { id: resetToken.userId },
        data: { passwordHash: newHash, mustChangePassword: false },
      }),
      prisma.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { used: true },
      }),
    ]);

    await auditLog(prisma, {
      actorUserId: resetToken.userId,
      action: "PASSWORD_RESET_COMPLETED",
      entityType: "users",
      entityId: resetToken.userId,
      ipAddress: request.ip,
    });

    return reply.status(200).send({ status: "ok" });
  });

  fastify.post(
    "/api/auth/logout",
    { preHandler: requireAuth() },
    async (request, reply) => {
      const currentUser = request.currentUser!;
      await auditLog(prisma, {
        actorUserId: currentUser.id,
        action: "USER_LOGOUT",
        entityType: "users",
        entityId: currentUser.id,
        ipAddress: request.ip,
      });
      await request.session.destroy();
      reply.clearCookie(SESSION_COOKIE_NAME);
      return reply.status(200).send({ status: "ok" });
    },
  );

  fastify.get(
    "/api/auth/me",
    { preHandler: requireAuth() },
    async (request, reply) => {
      const currentUser = request.currentUser!;
      return reply.status(200).send({
        id: currentUser.id,
        email: currentUser.email,
        firstName: currentUser.firstName,
        lastName: currentUser.lastName,
        roles: currentUser.roles,
        mustChangePassword: currentUser.mustChangePassword,
      });
    },
  );

  // ── Dev/test-only: applicant session bootstrap ─────────────────
  // This endpoint exists ONLY in non-production environments. It lets
  // integration tests create an authenticated applicant session without
  // going through the real Google OAuth flow.
  if (fastify.config.NODE_ENV !== "production") {
    const testApplicantLoginSchema = z.object({ userId: z.string().uuid() });

    fastify.post("/api/auth/test-applicant-login", async (request, reply) => {
      const body = testApplicantLoginSchema.parse(request.body);
      const user = await prisma.user.findUnique({
        where: { id: body.userId },
        include: { userRoles: { include: { role: true } } },
      });
      if (!user || !user.isActive) {
        return reply.status(404).send({ error: "Not Found", statusCode: 404 });
      }
      const roles = user.userRoles.map((ur) => ur.role.code);
      if (!roles.includes("APPLICANT")) {
        return reply.status(403).send({ error: "Forbidden", statusCode: 403 });
      }
      issueApplicantSession(request.session as never, user);
      return reply.status(200).send({ status: "ok" });
    });

    // Non-production seam for TC-AUTH-15. The real Google callback branch that
    // rejects a staff-role account (see /api/auth/google/callback above) can't
    // be reached in tests without a live OAuth round trip, so this drives the
    // same findApplicantByGoogleId → userHasStaffRole rejection path directly.
    // It only reports the rejection outcome; it never issues a session.
    const testGoogleCallbackSchema = z.object({ googleId: z.string().min(1) });

    fastify.post("/api/auth/test-google-callback", async (request, reply) => {
      const body = testGoogleCallbackSchema.parse(request.body);
      const existing = await findApplicantByGoogleId(prisma, body.googleId);
      if (existing && userHasStaffRole(existing)) {
        await auditLog(prisma, {
          actorUserId: existing.id,
          action: "USER_LOGIN_FAILED",
          entityType: "users",
          entityId: existing.id,
          ipAddress: request.ip,
          afterState: { reason: "staff_role_via_google" },
        });
        return reply.status(403).send({ error: "Forbidden", statusCode: 403 });
      }
      return reply.status(200).send({ status: "ok" });
    });
  }
}
