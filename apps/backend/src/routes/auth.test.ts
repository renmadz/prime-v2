import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { buildApp } from "../app.js";
import {
  completeApplicantConsent,
  findApplicantByGoogleId,
} from "../services/auth.js";
import { ROLE_CODES } from "../utils/roles.js";

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://primev2_user:devpassword123@localhost:5433/primev2_test";

process.env.NODE_ENV = "development";
process.env.DATABASE_URL = TEST_DATABASE_URL;
process.env.SESSION_SECRET = "a".repeat(64);
process.env.MINIO_ACCESS_KEY = "test-access-key";
process.env.MINIO_SECRET_KEY = "test-secret-key";
process.env.MINIO_BUCKET_NAME = "test-bucket";
process.env.GOOGLE_CLIENT_ID = "test-client-id";
process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";
process.env.GOOGLE_CALLBACK_URL = "http://localhost:3000/api/auth/google/callback";
process.env.FRONTEND_URL = "http://localhost:5173";
process.env.API_URL = "http://localhost:3000";

const db = new PrismaClient({ datasources: { db: { url: TEST_DATABASE_URL } } });

function sessionCookieHeader(response: { cookies: Array<{ name: string; value: string }> }) {
  const cookie = response.cookies.find((c) => c.name === "sessionId");
  return cookie ? `sessionId=${cookie.value}` : "";
}

// Login rate limiting is per-IP (Security Plan §3.2). fastify.inject defaults
// every request to the same simulated remote address, so unrelated test
// cases would otherwise trip each other's IP quota. Each test gets its own
// simulated IP unless it's specifically testing the rate limit itself.
let ipCounter = 1;
function nextIp() {
  ipCounter += 1;
  return `10.0.0.${ipCounter}`;
}

async function ensureRolesSeeded() {
  for (const code of ROLE_CODES) {
    await db.role.upsert({
      where: { code },
      update: {},
      create: { code, name: code, isActive: true },
    });
  }
}

async function createStaffUser(params: {
  email: string;
  password: string;
  roleCodes: string[];
  isActive?: boolean;
  mustChangePassword?: boolean;
}) {
  const passwordHash = await bcrypt.hash(params.password, 12);
  const roles = await db.role.findMany({ where: { code: { in: params.roleCodes } } });
  const user = await db.user.create({
    data: {
      email: params.email,
      passwordHash,
      firstName: "Test",
      lastName: "Staff",
      isActive: params.isActive ?? true,
      mustChangePassword: params.mustChangePassword ?? false,
      userRoles: {
        create: roles.map((role) => ({ roleId: role.id })),
      },
    },
  });
  return user;
}

// Every user row this file creates, keyed by email. Cleaned before and after
// the suite so runs are idempotent (fixed emails otherwise trip the unique
// constraint on re-run). Mirrors the cleanup pattern in proposalTypes.test.ts.
const TEST_EMAILS = [
  "focal01@test.local",
  "focal02@test.local",
  "applicant-only@test.local",
  "deactivated01@test.local",
  "ratelimited@test.local",
  "logout-test@test.local",
  "me-test@test.local",
  "admin-deactivate@test.local",
  "to-deactivate@test.local",
  "must-change@test.local",
  "focal-rbac@test.local",
  "new-staff@test.local",
  "new-applicant@test.local",
  "staff-google@test.local",
];

async function cleanupUsers() {
  const users = await db.user.findMany({ where: { email: { in: TEST_EMAILS } } });
  const userIds = users.map((u) => u.id);
  if (userIds.length > 0) {
    await db.auditLog.deleteMany({ where: { actorUserId: { in: userIds } } });
    await db.userRole.deleteMany({ where: { userId: { in: userIds } } });
    await db.staffProfile.deleteMany({ where: { userId: { in: userIds } } });
    await db.applicantProfile.deleteMany({ where: { userId: { in: userIds } } });
    await db.userInvitation.deleteMany({ where: { userId: { in: userIds } } });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
  }
}

describe("Auth routes", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    await ensureRolesSeeded();
    await cleanupUsers();
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await cleanupUsers();
    await db.$disconnect();
  });

  it("TC-AUTH-01: staff login with valid credentials returns 200 + session cookie", async () => {
    const user = await createStaffUser({
      email: "focal01@test.local",
      password: "ValidPassw0rd!",
      roleCodes: ["PROJECT_FOCAL"],
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/staff/login",
      remoteAddress: nextIp(),
      payload: { email: user.email, password: "ValidPassw0rd!" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.cookies.some((c) => c.name === "sessionId")).toBe(true);
  });

  it("TC-AUTH-02: staff login with wrong password returns 401", async () => {
    const user = await createStaffUser({
      email: "focal02@test.local",
      password: "ValidPassw0rd!",
      roleCodes: ["PROJECT_FOCAL"],
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/staff/login",
      remoteAddress: nextIp(),
      payload: { email: user.email, password: "WrongPassword!" },
    });

    expect(response.statusCode).toBe(401);
  });

  it("TC-AUTH-03: staff login for an APPLICANT-role account returns 401", async () => {
    const passwordHash = await bcrypt.hash("SomePassw0rd!", 12);
    const applicantRole = await db.role.findUniqueOrThrow({ where: { code: "APPLICANT" } });
    const user = await db.user.create({
      data: {
        email: "applicant-only@test.local",
        passwordHash,
        firstName: "App",
        lastName: "Licant",
        isActive: true,
        mustChangePassword: false,
        userRoles: { create: [{ roleId: applicantRole.id }] },
      },
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/staff/login",
      remoteAddress: nextIp(),
      payload: { email: user.email, password: "SomePassw0rd!" },
    });

    expect(response.statusCode).toBe(401);
  });

  it("TC-AUTH-04: staff login for deactivated account returns 403", async () => {
    const user = await createStaffUser({
      email: "deactivated01@test.local",
      password: "ValidPassw0rd!",
      roleCodes: ["PROJECT_FOCAL"],
      isActive: false,
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/staff/login",
      remoteAddress: nextIp(),
      payload: { email: user.email, password: "ValidPassw0rd!" },
    });

    expect(response.statusCode).toBe(403);
  });

  it("TC-AUTH-05: staff login exceeding rate limit returns 429", async () => {
    // bcrypt work factor 12 (Security Plan §10.1) makes each attempt ~200-900ms;
    // 6 sequential attempts can exceed vitest's default 5s test timeout.
    const user = await createStaffUser({
      email: "ratelimited@test.local",
      password: "ValidPassw0rd!",
      roleCodes: ["PROJECT_FOCAL"],
    });

    let lastResponse;
    for (let i = 0; i < 6; i++) {
      lastResponse = await app.inject({
        method: "POST",
        url: "/api/auth/staff/login",
        payload: { email: user.email, password: "WrongPassword!" },
      });
    }

    expect(lastResponse!.statusCode).toBe(429);
  }, 15000);

  it("TC-AUTH-06: logout clears session cookie and logs to audit_logs", async () => {
    const user = await createStaffUser({
      email: "logout-test@test.local",
      password: "ValidPassw0rd!",
      roleCodes: ["PROJECT_FOCAL"],
    });

    const loginResponse = await app.inject({
      method: "POST",
      url: "/api/auth/staff/login",
      remoteAddress: nextIp(),
      payload: { email: user.email, password: "ValidPassw0rd!" },
    });
    const cookie = sessionCookieHeader(loginResponse);

    const logoutResponse = await app.inject({
      method: "POST",
      url: "/api/auth/logout",
      headers: { cookie },
    });

    expect(logoutResponse.statusCode).toBe(200);
    const clearedCookie = logoutResponse.cookies.find((c) => c.name === "sessionId");
    expect(clearedCookie?.value).toBe("");

    const logoutLog = await db.auditLog.findFirst({
      where: { actorUserId: user.id, action: "USER_LOGOUT" },
    });
    expect(logoutLog).not.toBeNull();
  });

  it("TC-AUTH-07: GET /api/auth/me without session returns 401", async () => {
    const response = await app.inject({ method: "GET", url: "/api/auth/me" });
    expect(response.statusCode).toBe(401);
  });

  it("TC-AUTH-08: GET /api/auth/me with valid session returns user id, email, roles (no password_hash)", async () => {
    const user = await createStaffUser({
      email: "me-test@test.local",
      password: "ValidPassw0rd!",
      roleCodes: ["PROJECT_FOCAL"],
    });

    const loginResponse = await app.inject({
      method: "POST",
      url: "/api/auth/staff/login",
      remoteAddress: nextIp(),
      payload: { email: user.email, password: "ValidPassw0rd!" },
    });
    const cookie = sessionCookieHeader(loginResponse);

    const meResponse = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: { cookie },
    });

    expect(meResponse.statusCode).toBe(200);
    const body = meResponse.json();
    expect(body.id).toBe(user.id);
    expect(body.email).toBe(user.email);
    expect(body.roles).toContain("PROJECT_FOCAL");
    expect(body).not.toHaveProperty("password_hash");
    expect(body).not.toHaveProperty("passwordHash");
    expect(JSON.stringify(body)).not.toContain(user.passwordHash);
  });

  it("TC-AUTH-10: POST /api/users/:id/deactivate sets is_active=false; subsequent login returns 403", async () => {
    const admin = await createStaffUser({
      email: "admin-deactivate@test.local",
      password: "AdminPassw0rd!",
      roleCodes: ["ADMIN"],
    });
    const target = await createStaffUser({
      email: "to-deactivate@test.local",
      password: "TargetPassw0rd!",
      roleCodes: ["PROJECT_FOCAL"],
    });

    const adminLogin = await app.inject({
      method: "POST",
      url: "/api/auth/staff/login",
      remoteAddress: nextIp(),
      payload: { email: admin.email, password: "AdminPassw0rd!" },
    });
    const adminCookie = sessionCookieHeader(adminLogin);

    const deactivateResponse = await app.inject({
      method: "POST",
      url: `/api/users/${target.id}/deactivate`,
      headers: { cookie: adminCookie },
    });
    expect(deactivateResponse.statusCode).toBe(200);

    const targetLogin = await app.inject({
      method: "POST",
      url: "/api/auth/staff/login",
      remoteAddress: nextIp(),
      payload: { email: target.email, password: "TargetPassw0rd!" },
    });
    expect(targetLogin.statusCode).toBe(403);
  }, 15000);

  it("TC-AUTH-11: staff with must_change_password=true gets restricted session; cannot access other routes", async () => {
    const user = await createStaffUser({
      email: "must-change@test.local",
      password: "TempPassw0rd!",
      roleCodes: ["PROJECT_FOCAL"],
      mustChangePassword: true,
    });

    const loginResponse = await app.inject({
      method: "POST",
      url: "/api/auth/staff/login",
      remoteAddress: nextIp(),
      payload: { email: user.email, password: "TempPassw0rd!" },
    });
    expect(loginResponse.json().mustChangePassword).toBe(true);
    const cookie = sessionCookieHeader(loginResponse);

    const blockedResponse = await app.inject({
      method: "GET",
      url: "/api/users/me/profile",
      headers: { cookie },
    });
    expect(blockedResponse.statusCode).toBe(403);

    const allowedResponse = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: { cookie },
    });
    expect(allowedResponse.statusCode).toBe(200);
  });

  it("TC-AUTH-12: RBAC — ADMIN-only route returns 403 for a PROJECT_FOCAL session", async () => {
    const focal = await createStaffUser({
      email: "focal-rbac@test.local",
      password: "FocalPassw0rd!",
      roleCodes: ["PROJECT_FOCAL"],
    });

    const loginResponse = await app.inject({
      method: "POST",
      url: "/api/auth/staff/login",
      remoteAddress: nextIp(),
      payload: { email: focal.email, password: "FocalPassw0rd!" },
    });
    const cookie = sessionCookieHeader(loginResponse);

    const response = await app.inject({
      method: "POST",
      url: "/api/users",
      headers: { cookie },
      payload: {
        email: "new-staff@test.local",
        firstName: "New",
        lastName: "Staff",
        roleCodes: ["PROJECT_FOCAL"],
      },
    });

    expect(response.statusCode).toBe(403);
  });

  it("TC-AUTH-13: consent creates a users row only after POST /api/auth/consent is accepted", async () => {
    // The HTTP callback route requires a live Google OAuth network round trip
    // to obtain a profile, which isn't available in this test environment.
    // This test exercises the same service function the route calls, which
    // is the actual enforcement point for "no users row before consent".
    const googleId = "google-consent-test-id";

    const beforeUser = await findApplicantByGoogleId(db, googleId);
    expect(beforeUser).toBeNull();

    const user = await completeApplicantConsent(db, {
      googleId,
      email: "new-applicant@test.local",
      firstName: "New",
      lastName: "Applicant",
    });

    const afterUser = await findApplicantByGoogleId(db, googleId);
    expect(afterUser).not.toBeNull();
    expect(afterUser!.id).toBe(user.id);

    const profile = await db.applicantProfile.findUnique({ where: { userId: user.id } });
    expect(profile?.privacyConsentGiven).toBe(true);

    const roles = await db.userRole.findMany({ where: { userId: user.id }, include: { role: true } });
    expect(roles.map((r) => r.role.code)).toContain("APPLICANT");
  });

  it("TC-AUTH-14: audit_logs rows exist for login, logout, and deactivation events", async () => {
    const loginLog = await db.auditLog.findFirst({ where: { action: "USER_LOGIN_SUCCESS" } });
    const logoutLog = await db.auditLog.findFirst({ where: { action: "USER_LOGOUT" } });
    const deactivateLog = await db.auditLog.findFirst({ where: { action: "USER_DEACTIVATED" } });

    expect(loginLog).not.toBeNull();
    expect(logoutLog).not.toBeNull();
    expect(deactivateLog).not.toBeNull();
  });

  it("TC-AUTH-15: Google callback for an account holding a staff role returns 403 + USER_LOGIN_FAILED audit row (mirror of TC-AUTH-03)", async () => {
    // Mirror case of TC-AUTH-03: auth separation must reject a staff-role
    // account arriving via the Google OAuth path (Architecture §5). The real
    // callback needs a live OAuth round trip, so this drives the same
    // findApplicantByGoogleId → userHasStaffRole rejection via the
    // non-production test seam in auth.ts.
    const googleId = "google-staff-role-test-id";
    const staffRole = await db.role.findUniqueOrThrow({ where: { code: "PROJECT_FOCAL" } });
    const user = await db.user.create({
      data: {
        email: "staff-google@test.local",
        googleId,
        firstName: "Staff",
        lastName: "ViaGoogle",
        isActive: true,
        mustChangePassword: false,
        userRoles: { create: [{ roleId: staffRole.id }] },
      },
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/test-google-callback",
      remoteAddress: nextIp(),
      payload: { googleId },
    });

    expect(response.statusCode).toBe(403);

    const failLog = await db.auditLog.findFirst({
      where: { actorUserId: user.id, action: "USER_LOGIN_FAILED" },
    });
    expect(failLog).not.toBeNull();
    // afterState is persisted as a JSON string by auditLog() (see auditLog.ts).
    const afterState = JSON.parse(failLog!.afterState as string) as { reason?: string };
    expect(afterState.reason).toBe("staff_role_via_google");
  });
});
