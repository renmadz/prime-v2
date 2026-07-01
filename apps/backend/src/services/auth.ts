import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import type { PrismaClient, User } from "@prisma/client";
import { STAFF_ROLE_CODES } from "../utils/roles.js";

export const BCRYPT_WORK_FACTOR = 12;
const SESSION_ABSOLUTE_MAX_MS = 8 * 60 * 60 * 1000;

export interface SessionData {
  userId?: string;
  authPath?: "google" | "staff";
  restricted?: boolean;
  absoluteExpiresAt?: number;
}

// ─────────────────────────────────────────────────────────
// Applicant (Google OAuth) path — completely separate from staff auth below.
// Per Security Plan §2.1: no shared session-creation function between paths.
// ─────────────────────────────────────────────────────────

export async function findApplicantByGoogleId(
  db: PrismaClient,
  googleId: string,
): Promise<(User & { userRoles: { role: { code: string } }[] }) | null> {
  return db.user.findUnique({
    where: { googleId },
    include: { userRoles: { include: { role: true } } },
  });
}

export function userHasStaffRole(user: {
  userRoles: { role: { code: string } }[];
}): boolean {
  return user.userRoles.some((ur) =>
    (STAFF_ROLE_CODES as string[]).includes(ur.role.code),
  );
}

export interface PendingGoogleProfile {
  googleId: string;
  email: string;
  firstName: string;
  lastName: string;
}

// Creates the users + applicant_profiles rows only after explicit consent.
// No users row must exist before this point (Security Plan §2.3 / AUTH-11).
export async function completeApplicantConsent(
  db: PrismaClient,
  profile: PendingGoogleProfile,
): Promise<User> {
  const applicantRole = await db.role.findUniqueOrThrow({
    where: { code: "APPLICANT" },
  });

  return db.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email: profile.email,
        googleId: profile.googleId,
        firstName: profile.firstName,
        lastName: profile.lastName,
        isActive: true,
        mustChangePassword: false,
      },
    });

    await tx.applicantProfile.create({
      data: {
        userId: user.id,
        privacyConsentGiven: true,
        privacyConsentAt: new Date(),
      },
    });

    await tx.userRole.create({
      data: {
        userId: user.id,
        roleId: applicantRole.id,
        assignedBy: null,
      },
    });

    return user;
  });
}

// Issues a full session for a verified Applicant. Intentionally separate
// from issueStaffSession — the two paths must never share session logic.
export function issueApplicantSession(
  session: SessionData,
  user: { id: string },
): void {
  session.userId = user.id;
  session.authPath = "google";
  session.restricted = false;
  session.absoluteExpiresAt = Date.now() + SESSION_ABSOLUTE_MAX_MS;
}

// ─────────────────────────────────────────────────────────
// Staff (email + password) path — completely separate from applicant path.
// ─────────────────────────────────────────────────────────

export type StaffLoginResult =
  | { outcome: "success"; user: User }
  | { outcome: "invalid_credentials" }
  | { outcome: "applicant_only" }
  | { outcome: "deactivated" };

export async function verifyStaffCredentials(
  db: PrismaClient,
  email: string,
  password: string,
): Promise<StaffLoginResult> {
  const user = await db.user.findUnique({
    where: { email },
    include: { userRoles: { include: { role: true } } },
  });

  if (!user || !user.passwordHash) {
    return { outcome: "invalid_credentials" };
  }

  const hasStaffRole = userHasStaffRole(user);
  if (!hasStaffRole) {
    return { outcome: "applicant_only" };
  }

  if (!user.isActive) {
    return { outcome: "deactivated" };
  }

  const matches = await bcrypt.compare(password, user.passwordHash);
  if (!matches) {
    return { outcome: "invalid_credentials" };
  }

  return { outcome: "success", user };
}

// Issues a session for a verified staff member. Intentionally separate from
// issueApplicantSession — the two paths must never share session logic.
export function issueStaffSession(
  session: SessionData,
  user: { id: string },
  restricted: boolean,
): void {
  session.userId = user.id;
  session.authPath = "staff";
  session.restricted = restricted;
  session.absoluteExpiresAt = Date.now() + SESSION_ABSOLUTE_MAX_MS;
}

// ─────────────────────────────────────────────────────────
// Shared utilities (password hashing / tokens) — not session creation.
// ─────────────────────────────────────────────────────────

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_WORK_FACTOR);
}

export function generateToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function isSessionExpired(session: SessionData): boolean {
  if (!session.absoluteExpiresAt) return true;
  return Date.now() > session.absoluteExpiresAt;
}
