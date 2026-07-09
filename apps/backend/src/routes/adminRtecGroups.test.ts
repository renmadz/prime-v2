import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { buildApp } from "../app.js";
import { ROLE_CODES } from "../utils/roles.js";

// ── Env setup ────────────────────────────────────────────────────────────────

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://primev2_user:devpassword123@localhost:5433/primev2_test";

process.env.NODE_ENV = "development";
process.env.DATABASE_URL = TEST_DATABASE_URL;
process.env.SESSION_SECRET = "a".repeat(64);
process.env.MINIO_ENDPOINT = "localhost:9000";
process.env.MINIO_ACCESS_KEY = "test-access-key";
process.env.MINIO_SECRET_KEY = "test-secret-key";
process.env.MINIO_BUCKET_NAME = "test-bucket";
process.env.GOOGLE_CLIENT_ID = "test-client-id";
process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";
process.env.GOOGLE_CALLBACK_URL = "http://localhost:3000/api/auth/google/callback";
process.env.FRONTEND_URL = "http://localhost:5173";
process.env.API_URL = "http://localhost:3000";

const db = new PrismaClient({ datasources: { db: { url: TEST_DATABASE_URL } } });

// ── Helpers ──────────────────────────────────────────────────────────────────

function sessionCookieHeader(response: { cookies: Array<{ name: string; value: string }> }) {
  const cookie = response.cookies.find((c) => c.name === "sessionId");
  return cookie ? `sessionId=${cookie.value}` : "";
}

let ipCounter = 6000;
function nextIp() {
  ipCounter += 1;
  return `10.0.10.${ipCounter % 250}`;
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

async function createStaffUser(email: string, password: string, roleCode: string) {
  const passwordHash = await bcrypt.hash(password, 12);
  const role = await db.role.findUniqueOrThrow({ where: { code: roleCode } });
  return db.user.create({
    data: {
      email,
      passwordHash,
      firstName: "Test",
      lastName: roleCode,
      isActive: true,
      mustChangePassword: false,
      userRoles: { create: [{ roleId: role.id }] },
    },
  });
}

async function loginStaff(app: FastifyInstance, email: string, password: string) {
  const response = await app.inject({
    method: "POST",
    url: "/api/auth/staff/login",
    remoteAddress: nextIp(),
    payload: { email, password },
  });
  if (response.statusCode !== 200) {
    throw new Error(`Failed to create staff session for ${email}: ${response.statusCode} ${response.body}`);
  }
  return sessionCookieHeader(response);
}

// ── Test identifiers for cleanup ─────────────────────────────────────────────

const ADMIN_EMAIL = "admrtec-t-admin@test.local";
const FOCAL_EMAIL = "admrtec-t-focal@test.local";
const MEMBER_EMAIL = "admrtec-t-member@test.local";
const HEAD_EMAIL = "admrtec-t-head@test.local";
const APPLICANT_STAFF_EMAIL = "admrtec-t-headless@test.local";
const TEST_PASSWORD = "AdminRtecTestPassw0rd!";
const TEST_EMAILS = [ADMIN_EMAIL, FOCAL_EMAIL, MEMBER_EMAIL, HEAD_EMAIL, APPLICANT_STAFF_EMAIL];

async function cleanupTestData() {
  const users = await db.user.findMany({ where: { email: { in: TEST_EMAILS } } });
  const userIds = users.map((u) => u.id);
  if (userIds.length > 0) {
    await db.auditLog.deleteMany({ where: { actorUserId: { in: userIds } } });
    await db.rtecMembership.deleteMany({ where: { userId: { in: userIds } } });
    await db.userRole.deleteMany({ where: { userId: { in: userIds } } });
    await db.staffProfile.deleteMany({ where: { userId: { in: userIds } } });
    await db.applicantProfile.deleteMany({ where: { userId: { in: userIds } } });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
  }
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe("Admin RTEC Groups routes — access control (Phase 11)", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    await ensureRolesSeeded();
    await cleanupTestData();
    app = await buildApp();
    await app.ready();

    await createStaffUser(ADMIN_EMAIL, TEST_PASSWORD, "ADMIN");
    await createStaffUser(FOCAL_EMAIL, TEST_PASSWORD, "PROJECT_FOCAL");
    await createStaffUser(MEMBER_EMAIL, TEST_PASSWORD, "RTEC_MEMBER");
    await createStaffUser(HEAD_EMAIL, TEST_PASSWORD, "RTEC_HEAD");
    await createStaffUser(APPLICANT_STAFF_EMAIL, TEST_PASSWORD, "ACCOUNTANT");
  });

  afterAll(async () => {
    await app.close();
    await cleanupTestData();
    await db.$disconnect();
  });

  it("TC-RTEC-GROUPS-01: ADMIN can GET /api/admin/rtec-groups → 200", async () => {
    const cookie = await loginStaff(app, ADMIN_EMAIL, TEST_PASSWORD);
    const response = await app.inject({
      method: "GET",
      url: "/api/admin/rtec-groups",
      headers: { cookie },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as { groups: unknown[] };
    expect(Array.isArray(body.groups)).toBe(true);
  });

  it("TC-RTEC-GROUPS-02: PROJECT_FOCAL can GET /api/admin/rtec-groups → 200", async () => {
    const cookie = await loginStaff(app, FOCAL_EMAIL, TEST_PASSWORD);
    const response = await app.inject({
      method: "GET",
      url: "/api/admin/rtec-groups",
      headers: { cookie },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as { groups: unknown[] };
    expect(Array.isArray(body.groups)).toBe(true);
  });

  it("TC-RTEC-GROUPS-03: RTEC_MEMBER can GET /api/admin/rtec-groups → 200 (needed to resolve own group before first review)", async () => {
    const cookie = await loginStaff(app, MEMBER_EMAIL, TEST_PASSWORD);
    const response = await app.inject({
      method: "GET",
      url: "/api/admin/rtec-groups",
      headers: { cookie },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as { groups: unknown[] };
    expect(Array.isArray(body.groups)).toBe(true);
  });

  it("TC-RTEC-GROUPS-03c: RTEC_HEAD can GET /api/admin/rtec-groups → 200 (needed to resolve own group before consolidation draft)", async () => {
    const cookie = await loginStaff(app, HEAD_EMAIL, TEST_PASSWORD);
    const response = await app.inject({
      method: "GET",
      url: "/api/admin/rtec-groups",
      headers: { cookie },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as { groups: unknown[] };
    expect(Array.isArray(body.groups)).toBe(true);
  });

  it("TC-RTEC-GROUPS-03b: unrelated staff role (ACCOUNTANT) cannot GET /api/admin/rtec-groups → 403", async () => {
    const cookie = await loginStaff(app, APPLICANT_STAFF_EMAIL, TEST_PASSWORD);
    const response = await app.inject({
      method: "GET",
      url: "/api/admin/rtec-groups",
      headers: { cookie },
    });
    expect(response.statusCode).toBe(403);
  });

  it("TC-RTEC-GROUPS-04: unauthenticated request → 401", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/admin/rtec-groups",
    });
    expect(response.statusCode).toBe(401);
  });
});
