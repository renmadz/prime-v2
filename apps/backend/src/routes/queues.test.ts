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

// Rate limiting (services/rateLimit.ts) is DB-backed via audit_logs, not
// in-memory, so it persists across repeated test runs within the same
// 15-minute window. A fixed IP sequence would collide with itself on re-runs
// and trip MAX_PER_IP — randomize the third octet per process run instead.
let ipCounter = Math.floor(Math.random() * 200);
function nextIp() {
  ipCounter += 1;
  return `10.99.${ipCounter % 250}.${(ipCounter * 7) % 250}`;
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

async function createApplicantUser(email: string) {
  const applicantRole = await db.role.findUniqueOrThrow({ where: { code: "APPLICANT" } });
  const user = await db.user.create({
    data: {
      email,
      firstName: "Test",
      lastName: "Applicant",
      isActive: true,
      mustChangePassword: false,
      userRoles: { create: [{ roleId: applicantRole.id }] },
    },
  });
  await db.applicantProfile.create({
    data: { userId: user.id, privacyConsentGiven: true, privacyConsentAt: new Date() },
  });
  return user;
}

async function createProposalWithStatus(
  applicantUserId: string,
  proposalTypeId: string,
  formTemplateVersionId: string,
  status: string,
  title: string,
) {
  const proposal = await db.proposal.create({
    data: { applicantUserId, proposalTypeId, title, status },
  });
  const version = await db.proposalVersion.create({
    data: {
      proposalId: proposal.id,
      versionNumber: 1,
      formTemplateVersionId,
      createdBy: applicantUserId,
      statusAtCreation: status,
      isSubmitted: true,
    },
  });
  return db.proposal.update({ where: { id: proposal.id }, data: { currentVersionId: version.id } });
}

async function assignRole(proposalId: string, userId: string, roleCode: string) {
  return db.proposalAssignment.create({
    data: { proposalId, userId, roleCode, assignedBy: userId, isActive: true },
  });
}

// ── Test identifiers for cleanup ────────────────────────────────────────────

const APPLICANT_EMAIL = "queues-t-applicant@test.local";
const RD_EMAIL = "queues-t-rd@test.local";
const FOCAL_EMAIL = "queues-t-focal@test.local";
const TEST_PASSWORD = "QueuesTestPassw0rd!";

const TEST_EMAILS = [APPLICANT_EMAIL, RD_EMAIL, FOCAL_EMAIL];

const TEST_PROPOSAL_TYPE_CODE = "PT-QUEUES-TEST-01";
const TEST_OFFICE_CODE = "OFFICE-QUEUES-TEST-01";
const TEST_PROGRAM_CODE = "PROG-QUEUES-TEST-01";
const TEST_FORM_CODE = "FT-QUEUES-TEST-01";

async function cleanupTestData() {
  const users = await db.user.findMany({ where: { email: { in: TEST_EMAILS } } });
  const userIds = users.map((u) => u.id);

  if (userIds.length > 0) {
    const proposals = await db.proposal.findMany({ where: { applicantUserId: { in: userIds } } });
    const proposalIds = proposals.map((p) => p.id);
    if (proposalIds.length > 0) {
      await db.proposalAssignment.deleteMany({ where: { proposalId: { in: proposalIds } } });
      await db.auditLog.deleteMany({ where: { entityType: "proposals", entityId: { in: proposalIds } } });
      await db.proposal.updateMany({ where: { id: { in: proposalIds } }, data: { currentVersionId: null } });
      await db.proposalVersion.deleteMany({ where: { proposalId: { in: proposalIds } } });
      await db.proposal.deleteMany({ where: { id: { in: proposalIds } } });
    }

    await db.proposalAssignment.deleteMany({ where: { userId: { in: userIds } } });
    await db.auditLog.deleteMany({ where: { actorUserId: { in: userIds } } });
    await db.userRole.deleteMany({ where: { userId: { in: userIds } } });
    await db.applicantProfile.deleteMany({ where: { userId: { in: userIds } } });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
  }

  const proposalType = await db.proposalType.findUnique({ where: { code: TEST_PROPOSAL_TYPE_CODE } });
  if (proposalType) {
    await db.proposalType.update({ where: { id: proposalType.id }, data: { defaultFormTemplateId: null } });
    await db.proposalType.delete({ where: { id: proposalType.id } });
  }
  const formTemplate = await db.formTemplate.findUnique({ where: { formCode: TEST_FORM_CODE } });
  if (formTemplate) {
    await db.formTemplateVersion.deleteMany({ where: { formTemplateId: formTemplate.id } });
    await db.formTemplate.delete({ where: { id: formTemplate.id } });
  }
  const program = await db.program.findUnique({ where: { code: TEST_PROGRAM_CODE } });
  if (program) await db.program.delete({ where: { id: program.id } });
  const office = await db.office.findUnique({ where: { code: TEST_OFFICE_CODE } });
  if (office) await db.office.delete({ where: { id: office.id } });
}

// ── Test suite ───────────────────────────────────────────────────────────────

describe("Queues routes", () => {
  let app: FastifyInstance;
  let proposalTypeId: string;
  let formTemplateVersionId: string;
  let applicantUserId: string;
  let rdCookie: string;
  let focalCookie: string;

  beforeAll(async () => {
    await ensureRolesSeeded();
    await cleanupTestData();
    app = await buildApp();
    await app.ready();

    // Self-contained fixture (not relying on ambient seed/other-file state,
    // which is not guaranteed to still have an isCurrent form template
    // version by the time this file runs in the full suite).
    const office = await db.office.create({
      data: { code: TEST_OFFICE_CODE, name: "Test Office (Queues)" },
    });
    const program = await db.program.create({
      data: { code: TEST_PROGRAM_CODE, name: "Test Program (Queues)", officeId: office.id },
    });
    const formTemplate = await db.formTemplate.create({
      data: { formCode: TEST_FORM_CODE, title: "Test Queues Form", isActive: true },
    });
    const formVersion = await db.formTemplateVersion.create({
      data: {
        formTemplateId: formTemplate.id,
        versionNumber: 1,
        schemaVersion: "1.0",
        isCurrent: true,
        publishedAt: new Date(),
      },
    });
    formTemplateVersionId = formVersion.id;
    const proposalType = await db.proposalType.create({
      data: {
        code: TEST_PROPOSAL_TYPE_CODE,
        name: "Test Queues Grant",
        programId: program.id,
        defaultFormTemplateId: formTemplate.id,
        isActive: true,
      },
    });
    proposalTypeId = proposalType.id;

    const applicant = await createApplicantUser(APPLICANT_EMAIL);
    applicantUserId = applicant.id;
  });

  afterAll(async () => {
    await app.close();
    await cleanupTestData();
    await db.$disconnect();
  });

  // ── TC-QUEUE-01 (Phase 14–15 RBAC fix #2) ───────────────────────────────────
  it("TC-QUEUE-01: REGIONAL_DIRECTOR with no ProposalAssignment on a live ENDORSED_TO_RD proposal → GET /api/queues/rd shows it (RD is unconditional, not assignment-gated, per §3.1)", async () => {
    await createProposalWithStatus(applicantUserId, proposalTypeId, formTemplateVersionId, "ENDORSED_TO_RD", "Queue Test — RD unassigned");

    await createStaffUser(RD_EMAIL, TEST_PASSWORD, "REGIONAL_DIRECTOR");
    rdCookie = await loginStaff(app, RD_EMAIL, TEST_PASSWORD);

    const response = await app.inject({
      method: "GET",
      url: "/api/queues/rd",
      headers: { cookie: rdCookie },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { count: number; proposals: Array<{ title: string }> };
    expect(body.proposals.some((p) => p.title === "Queue Test — RD unassigned")).toBe(true);
  });

  // ── TC-QUEUE-02 ──────────────────────────────────────────────────────────────
  it("TC-QUEUE-02: PROJECT_FOCAL only sees proposals they are actively assigned to (assignment-scoped queue)", async () => {
    const assigned = await createProposalWithStatus(
      applicantUserId, proposalTypeId, formTemplateVersionId, "SUBMITTED_TO_FOCAL", "Queue Test — Focal assigned",
    );
    await createProposalWithStatus(
      applicantUserId, proposalTypeId, formTemplateVersionId, "SUBMITTED_TO_FOCAL", "Queue Test — Focal NOT assigned",
    );

    const focal = await createStaffUser(FOCAL_EMAIL, TEST_PASSWORD, "PROJECT_FOCAL");
    await assignRole(assigned.id, focal.id, "PROJECT_FOCAL");
    focalCookie = await loginStaff(app, FOCAL_EMAIL, TEST_PASSWORD);

    const response = await app.inject({
      method: "GET",
      url: "/api/queues/focal",
      headers: { cookie: focalCookie },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { proposals: Array<{ title: string }> };
    const titles = body.proposals.map((p) => p.title);
    expect(titles).toContain("Queue Test — Focal assigned");
    expect(titles).not.toContain("Queue Test — Focal NOT assigned");
  });

  // ── TC-QUEUE-03 ──────────────────────────────────────────────────────────────
  it("TC-QUEUE-03: role not in a queue's allowedRoles → 403", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/queues/rd",
      headers: { cookie: focalCookie },
    });

    expect(response.statusCode).toBe(403);
  });

  // ── TC-QUEUE-04 ──────────────────────────────────────────────────────────────
  it("TC-QUEUE-04: unknown queue key → 404", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/queues/not-a-real-queue",
      headers: { cookie: rdCookie },
    });

    expect(response.statusCode).toBe(404);
  });
});
