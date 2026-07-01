import type { FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "../db/client.js";
import { isSessionExpired } from "../services/auth.js";

export interface CurrentUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  roles: string[];
  mustChangePassword: boolean;
  allowedCommentVisibilities: string[];
}

declare module "fastify" {
  interface FastifyRequest {
    currentUser?: CurrentUser;
  }
}

// Comment visibility filter per Security Plan §5.2 / Roles-and-Permissions §4.
// Not wired to any comment route yet (comments ship in a later phase) — this
// is the single source of truth those routes must call, so APPLICANT sessions
// can never be handed RTEC_PRIVATE / RTEC_HEAD_ONLY / internal-only comments.
const VISIBILITY_BY_ROLE: Record<string, string[]> = {
  APPLICANT: ["APPLICANT_VISIBLE"],
  PROJECT_FOCAL: ["APPLICANT_VISIBLE", "FOCAL_AND_INTERNAL", "OFFICIAL_WORKFLOW"],
  RTEC_MEMBER: ["RTEC_PRIVATE"],
  RTEC_HEAD: [
    "APPLICANT_VISIBLE",
    "FOCAL_AND_INTERNAL",
    "RTEC_PRIVATE",
    "RTEC_HEAD_ONLY",
    "OFFICIAL_WORKFLOW",
  ],
  BUDGET_OFFICER: ["APPLICANT_VISIBLE", "FOCAL_AND_INTERNAL", "OFFICIAL_WORKFLOW"],
  ACCOUNTANT: ["APPLICANT_VISIBLE", "FOCAL_AND_INTERNAL", "OFFICIAL_WORKFLOW"],
  REGIONAL_DIRECTOR: [
    "APPLICANT_VISIBLE",
    "FOCAL_AND_INTERNAL",
    "OFFICIAL_WORKFLOW",
  ],
  ADMIN: [
    "APPLICANT_VISIBLE",
    "FOCAL_AND_INTERNAL",
    "RTEC_PRIVATE",
    "RTEC_HEAD_ONLY",
    "OFFICIAL_WORKFLOW",
    "ADMIN_AUDIT_ONLY",
  ],
};

export function getAllowedCommentVisibilities(roles: string[]): string[] {
  const allowed = new Set<string>();
  for (const role of roles) {
    for (const visibility of VISIBILITY_BY_ROLE[role] ?? []) {
      allowed.add(visibility);
    }
  }
  return Array.from(allowed);
}

// Routes a restricted session (must_change_password = true) is still allowed
// to hit. Everything else returns 403 until the password is changed.
const RESTRICTED_SESSION_ALLOWLIST = [
  "/api/auth/change-password",
  "/api/auth/logout",
  "/api/auth/me",
];

export function requireAuth() {
  return async function requireAuthHandler(
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    const session = request.session as unknown as {
      userId?: string;
      restricted?: boolean;
      absoluteExpiresAt?: number;
    };

    if (!session?.userId) {
      return reply.status(401).send({ error: "Unauthorized", statusCode: 401 });
    }

    if (isSessionExpired(session)) {
      await request.session.destroy();
      return reply.status(401).send({ error: "Unauthorized", statusCode: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      include: { userRoles: { include: { role: true } } },
    });

    if (!user) {
      return reply.status(401).send({ error: "Unauthorized", statusCode: 401 });
    }

    if (!user.isActive) {
      await request.session.destroy();
      return reply.status(403).send({ error: "Forbidden", statusCode: 403 });
    }

    if (session.restricted && !RESTRICTED_SESSION_ALLOWLIST.includes(request.url)) {
      return reply.status(403).send({ error: "Forbidden", statusCode: 403 });
    }

    const roles = user.userRoles.map((ur) => ur.role.code);

    request.currentUser = {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      roles,
      mustChangePassword: user.mustChangePassword,
      allowedCommentVisibilities: getAllowedCommentVisibilities(roles),
    };
  };
}

export function requireRole(...roles: string[]) {
  return async function requireRoleHandler(
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    const currentUser = request.currentUser;
    if (!currentUser) {
      return reply.status(401).send({ error: "Unauthorized", statusCode: 401 });
    }
    const hasRole = currentUser.roles.some((role) => roles.includes(role));
    if (!hasRole) {
      return reply.status(403).send({ error: "Forbidden", statusCode: 403 });
    }
  };
}

// Resolver-based: pluggable so future proposal routes (Phase 8+) can supply
// how to look up the owning applicant for a given request.
export function requireOwner(
  resolveOwnerId: (request: FastifyRequest) => Promise<string | null>,
) {
  return async function requireOwnerHandler(
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    const currentUser = request.currentUser;
    if (!currentUser) {
      return reply.status(401).send({ error: "Unauthorized", statusCode: 401 });
    }
    const ownerId = await resolveOwnerId(request);
    if (!ownerId || ownerId !== currentUser.id) {
      return reply.status(403).send({ error: "Forbidden", statusCode: 403 });
    }
  };
}

// Resolver-based: pluggable so future staff-facing proposal routes can supply
// how to look up proposal_assignments for the current request.
export function requireAssigned(
  resolveAssignedUserIds: (request: FastifyRequest) => Promise<string[]>,
) {
  return async function requireAssignedHandler(
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    const currentUser = request.currentUser;
    if (!currentUser) {
      return reply.status(401).send({ error: "Unauthorized", statusCode: 401 });
    }
    const assignedIds = await resolveAssignedUserIds(request);
    if (!assignedIds.includes(currentUser.id)) {
      return reply.status(403).send({ error: "Forbidden", statusCode: 403 });
    }
  };
}
