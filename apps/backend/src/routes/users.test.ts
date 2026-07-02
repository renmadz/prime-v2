import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { buildApp } from "../app.js";
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

async function ensureRolesSeeded() {
  for (const code of ROLE_CODES) {
    await db.role.upsert({
      where: { code },
      update: {},
      create: { code, name: code, isActive: true },
    });
  }
}

let ipCounter = 700;
function nextIp() {
  ipCounter += 1;
  return `10.0.1.${ipCounter}`;
}

async function createAdminSession(app: FastifyInstance, email: string) {
  const passwordHash = await bcrypt.hash("AdminPassw0rd!", 12);
  const adminRole = await db.role.findUniqueOrThrow({ where: { code: "ADMIN" } });
  await db.user.create({
    data: {
      email,
      passwordHash,
      firstName: "Admin",
      lastName: "User",
      isActive: true,
      mustChangePassword: false,
      userRoles: { create: [{ roleId: adminRole.id }] },
    },
  });

  const loginResponse = await app.inject({
    method: "POST",
    url: "/api/auth/staff/login",
    remoteAddress: nextIp(),
    payload: { email, password: "AdminPassw0rd!" },
  });
  return sessionCookieHeader(loginResponse);
}

// Every user row this file creates, keyed by email. Cleaned before and after
// the suite so runs are idempotent (fixed emails otherwise trip the unique
// constraint on re-run). Mirrors the cleanup pattern in proposalTypes.test.ts.
const TEST_EMAILS = [
  "admin-create-users@test.local",
  "new-hire@test.local",
  "admin-roles@test.local",
  "role-swap@test.local",
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

describe("Users routes", () => {
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

  it("TC-AUTH-09: POST /api/users (Admin) creates user with must_change_password=true", async () => {
    const adminCookie = await createAdminSession(app, "admin-create-users@test.local");

    const response = await app.inject({
      method: "POST",
      url: "/api/users",
      headers: { cookie: adminCookie },
      payload: {
        email: "new-hire@test.local",
        firstName: "New",
        lastName: "Hire",
        roleCodes: ["PROJECT_FOCAL"],
      },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.mustChangePassword).toBe(true);
    expect(body).not.toHaveProperty("passwordHash");
    expect(body.invitationToken).toBeTruthy();

    const created = await db.user.findUniqueOrThrow({ where: { id: body.id } });
    expect(created.mustChangePassword).toBe(true);

    const invitation = await db.userInvitation.findFirst({ where: { userId: body.id } });
    expect(invitation).not.toBeNull();

    const auditRow = await db.auditLog.findFirst({
      where: { action: "USER_CREATED", entityId: body.id },
    });
    expect(auditRow).not.toBeNull();
  });

  it("Assigns and removes a role, logging both actions", async () => {
    const adminCookie = await createAdminSession(app, "admin-roles@test.local");

    const passwordHash = await bcrypt.hash("StaffPassw0rd!", 12);
    const focalRole = await db.role.findUniqueOrThrow({ where: { code: "PROJECT_FOCAL" } });
    const user = await db.user.create({
      data: {
        email: "role-swap@test.local",
        passwordHash,
        firstName: "Role",
        lastName: "Swap",
        isActive: true,
        mustChangePassword: false,
        userRoles: { create: [{ roleId: focalRole.id }] },
      },
    });

    const assignResponse = await app.inject({
      method: "POST",
      url: `/api/users/${user.id}/roles`,
      headers: { cookie: adminCookie },
      payload: { roleCodes: ["BUDGET_OFFICER"] },
    });
    expect(assignResponse.statusCode).toBe(200);

    const removeResponse = await app.inject({
      method: "DELETE",
      url: `/api/users/${user.id}/roles/${focalRole.id}`,
      headers: { cookie: adminCookie },
    });
    expect(removeResponse.statusCode).toBe(200);

    const remainingRoles = await db.userRole.findMany({
      where: { userId: user.id },
      include: { role: true },
    });
    expect(remainingRoles.map((r) => r.role.code)).toEqual(["BUDGET_OFFICER"]);

    const assignLog = await db.auditLog.findFirst({
      where: { action: "ROLE_ASSIGNED", entityId: user.id },
    });
    const removeLog = await db.auditLog.findFirst({
      where: { action: "ROLE_REMOVED", entityId: user.id },
    });
    expect(assignLog).not.toBeNull();
    expect(removeLog).not.toBeNull();
  });
});
