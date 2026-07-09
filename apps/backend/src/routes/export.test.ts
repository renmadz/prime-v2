import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
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

vi.mock("../services/minio.js", () => ({
  uploadFile: vi.fn().mockResolvedValue(undefined),
  getPresignedUrl: vi.fn().mockResolvedValue("https://mock-presigned-url/export.html"),
}));

const db = new PrismaClient({ datasources: { db: { url: TEST_DATABASE_URL } } });

// ── Helpers ──────────────────────────────────────────────────────────────────

function sessionCookieHeader(response: { cookies: Array<{ name: string; value: string }> }) {
  const cookie = response.cookies.find((c) => c.name === "sessionId");
  return cookie ? `sessionId=${cookie.value}` : "";
}

let ipCounter = 7000;
function nextIp() {
  ipCounter += 1;
  return `10.0.11.${ipCounter % 250}`;
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

async function createApplicantUser(email: string, password: string) {
  const passwordHash = await bcrypt.hash(password, 12);
  const applicantRole = await db.role.findUniqueOrThrow({ where: { code: "APPLICANT" } });
  const user = await db.user.create({
    data: {
      email,
      passwordHash,
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

async function loginApplicant(app: FastifyInstance, userId: string) {
  const response = await app.inject({
    method: "POST",
    url: "/api/auth/test-applicant-login",
    remoteAddress: nextIp(),
    payload: { userId },
  });
  if (response.statusCode !== 200) {
    throw new Error(`Failed to create applicant session for ${userId}: ${response.statusCode} ${response.body}`);
  }
  return sessionCookieHeader(response);
}

async function createProposalWithStatus(
  applicantUserId: string,
  proposalTypeId: string,
  status: string,
  title: string,
) {
  const formVersion = await db.formTemplateVersion.findFirst({ where: { isCurrent: true } });
  if (!formVersion) throw new Error("No current form template version found");

  const proposal = await db.proposal.create({
    data: { applicantUserId, proposalTypeId, title, status, isLocked: status === "APPROVED" },
  });
  const version = await db.proposalVersion.create({
    data: {
      proposalId: proposal.id,
      versionNumber: 1,
      formTemplateVersionId: formVersion.id,
      createdBy: applicantUserId,
      statusAtCreation: status,
      isSubmitted: true,
    },
  });
  const updated = await db.proposal.update({
    where: { id: proposal.id },
    data: { currentVersionId: version.id },
  });
  return { proposal: updated, version };
}

async function assignRole(proposalId: string, userId: string, roleCode: string) {
  return db.proposalAssignment.create({
    data: { proposalId, userId, roleCode, assignedBy: userId, isActive: true },
  });
}

// ── Test identifiers for cleanup ─────────────────────────────────────────────

const APPLICANT_EMAIL = "export-t-applicant@test.local";
const FOCAL_EMAIL = "export-t-focal@test.local";
const TEST_PASSWORD = "ExportTestPassw0rd!";
const TEST_EMAILS = [APPLICANT_EMAIL, FOCAL_EMAIL];

const TEST_PROPOSAL_TYPE_CODE = "PT-EXPORT-TEST-01";
const TEST_OFFICE_CODE = "OFFICE-EXPORT-TEST-01";
const TEST_PROGRAM_CODE = "PROG-EXPORT-TEST-01";
const TEST_FORM_CODE = "FT-EXPORT-TEST-01";

async function cleanupTestData() {
  const users = await db.user.findMany({ where: { email: { in: TEST_EMAILS } } });
  const userIds = users.map((u) => u.id);

  const proposalType = await db.proposalType.findUnique({ where: { code: TEST_PROPOSAL_TYPE_CODE } });

  if (proposalType) {
    const proposals = await db.proposal.findMany({ where: { proposalTypeId: proposalType.id } });
    const proposalIds = proposals.map((p) => p.id);

    if (proposalIds.length > 0) {
      await db.proposalExport.deleteMany({ where: { proposalId: { in: proposalIds } } });
      await db.notification.deleteMany({ where: { proposalId: { in: proposalIds } } });
      await db.proposalWorkflowHistory.deleteMany({ where: { proposalId: { in: proposalIds } } });
      await db.auditLog.deleteMany({ where: { entityId: { in: proposalIds } } });
      await db.proposalAssignment.deleteMany({ where: { proposalId: { in: proposalIds } } });

      const versions = await db.proposalVersion.findMany({ where: { proposalId: { in: proposalIds } } });
      const versionIds = versions.map((v) => v.id);
      if (versionIds.length > 0) {
        await db.proposalExport.deleteMany({ where: { proposalVersionId: { in: versionIds } } });
        await db.proposalFieldValue.deleteMany({ where: { proposalVersionId: { in: versionIds } } });
      }

      await db.proposal.updateMany({ where: { id: { in: proposalIds } }, data: { currentVersionId: null } });
      await db.proposalVersion.deleteMany({ where: { proposalId: { in: proposalIds } } });
      await db.proposal.deleteMany({ where: { id: { in: proposalIds } } });
    }

    await db.proposalType.update({ where: { id: proposalType.id }, data: { defaultFormTemplateId: null } });
    await db.proposalType.delete({ where: { id: proposalType.id } });
  }

  const formTemplate = await db.formTemplate.findUnique({ where: { formCode: TEST_FORM_CODE } });
  if (formTemplate) {
    const versions = await db.formTemplateVersion.findMany({ where: { formTemplateId: formTemplate.id } });
    const versionIds = versions.map((v) => v.id);
    if (versionIds.length > 0) {
      const sections = await db.formSection.findMany({ where: { formTemplateVersionId: { in: versionIds } } });
      const sectionIds = sections.map((s) => s.id);
      if (sectionIds.length > 0) {
        await db.formField.deleteMany({ where: { formSectionId: { in: sectionIds } } });
        await db.formSection.deleteMany({ where: { id: { in: sectionIds } } });
      }
      await db.formTemplateVersion.deleteMany({ where: { id: { in: versionIds } } });
    }
    await db.formTemplate.delete({ where: { id: formTemplate.id } });
  }

  const program = await db.program.findUnique({ where: { code: TEST_PROGRAM_CODE } });
  if (program) await db.program.delete({ where: { id: program.id } });

  const office = await db.office.findUnique({ where: { code: TEST_OFFICE_CODE } });
  if (office) await db.office.delete({ where: { id: office.id } });

  if (userIds.length > 0) {
    await db.auditLog.deleteMany({ where: { actorUserId: { in: userIds } } });
    await db.proposalExport.deleteMany({ where: { generatedBy: { in: userIds } } });
    await db.userRole.deleteMany({ where: { userId: { in: userIds } } });
    await db.staffProfile.deleteMany({ where: { userId: { in: userIds } } });
    await db.applicantProfile.deleteMany({ where: { userId: { in: userIds } } });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
  }
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe("Export routes (Phase 13)", () => {
  let app: FastifyInstance;
  let applicantId: string;
  let focalId: string;
  let proposalTypeId: string;

  beforeAll(async () => {
    await ensureRolesSeeded();
    await cleanupTestData();
    app = await buildApp();
    await app.ready();

    const office = await db.office.create({ data: { code: TEST_OFFICE_CODE, name: "Test Office (Export)" } });
    const program = await db.program.create({
      data: { code: TEST_PROGRAM_CODE, name: "Test Program (Export)", officeId: office.id },
    });
    const formTemplate = await db.formTemplate.create({
      data: { formCode: TEST_FORM_CODE, title: "Test Export Form", isActive: true },
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
    const section = await db.formSection.create({
      data: {
        formTemplateVersionId: formVersion.id,
        sectionCode: "EXPORT-S1",
        title: "Details",
        displayOrder: 1,
        isRepeating: false,
        isRequired: true,
      },
    });
    await db.formField.create({
      data: {
        formSectionId: section.id,
        fieldCode: "EXPORT-F1",
        label: "Title",
        inputType: "TEXT",
        isRequired: true,
        displayOrder: 1,
      },
    });
    const proposalType = await db.proposalType.create({
      data: {
        code: TEST_PROPOSAL_TYPE_CODE,
        name: "Test Export Grant",
        programId: program.id,
        defaultFormTemplateId: formTemplate.id,
        isActive: true,
      },
    });
    proposalTypeId = proposalType.id;

    const applicant = await createApplicantUser(APPLICANT_EMAIL, TEST_PASSWORD);
    applicantId = applicant.id;
    const focal = await createStaffUser(FOCAL_EMAIL, TEST_PASSWORD, "PROJECT_FOCAL");
    focalId = focal.id;
  });

  afterAll(async () => {
    await app.close();
    await cleanupTestData();
    await db.$disconnect();
  });

  // ── TC-EXPORT-01 ───────────────────────────────────────────────────────────
  it("TC-EXPORT-01: OWNER of an APPROVED proposal can POST /export → 200, row created, minioKey starts with exports/", async () => {
    const { proposal } = await createProposalWithStatus(applicantId, proposalTypeId, "APPROVED", "TC-EXPORT-01 Proposal");
    const cookie = await loginApplicant(app, applicantId);

    const response = await app.inject({
      method: "POST",
      url: `/api/proposals/${proposal.id}/export`,
      headers: { cookie },
      payload: {},
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { exportId: string; url: string; filename: string; format: string };
    expect(body.url).toBe("https://mock-presigned-url/export.html");
    expect(body.filename).toBeTruthy();

    const row = await db.proposalExport.findUnique({ where: { id: body.exportId } });
    expect(row).not.toBeNull();
    expect(row!.minioKey.startsWith("exports/")).toBe(true);
  });

  // ── TC-EXPORT-02 ───────────────────────────────────────────────────────────
  it("TC-EXPORT-02: ASSIGNED staff (PROJECT_FOCAL) can POST /export → 200", async () => {
    const { proposal } = await createProposalWithStatus(applicantId, proposalTypeId, "APPROVED", "TC-EXPORT-02 Proposal");
    await assignRole(proposal.id, focalId, "PROJECT_FOCAL");
    const cookie = await loginStaff(app, FOCAL_EMAIL, TEST_PASSWORD);

    const response = await app.inject({
      method: "POST",
      url: `/api/proposals/${proposal.id}/export`,
      headers: { cookie },
      payload: {},
    });

    expect(response.statusCode).toBe(200);
  });

  // ── TC-EXPORT-03 ───────────────────────────────────────────────────────────
  it("TC-EXPORT-03: proposal with status not APPROVED → 409 NOT_APPROVED", async () => {
    const { proposal } = await createProposalWithStatus(applicantId, proposalTypeId, "UNDER_RD_REVIEW", "TC-EXPORT-03 Proposal");
    const cookie = await loginApplicant(app, applicantId);

    const response = await app.inject({
      method: "POST",
      url: `/api/proposals/${proposal.id}/export`,
      headers: { cookie },
      payload: {},
    });

    expect(response.statusCode).toBe(409);
    const body = response.json() as { code: string };
    expect(body.code).toBe("NOT_APPROVED");
  });

  // ── TC-EXPORT-04 ───────────────────────────────────────────────────────────
  it("TC-EXPORT-04: unauthenticated request → 401", async () => {
    const { proposal } = await createProposalWithStatus(applicantId, proposalTypeId, "APPROVED", "TC-EXPORT-04 Proposal");

    const response = await app.inject({
      method: "POST",
      url: `/api/proposals/${proposal.id}/export`,
      payload: {},
    });

    expect(response.statusCode).toBe(401);
  });

  // ── TC-EXPORT-05 ───────────────────────────────────────────────────────────
  it("TC-EXPORT-05: GET /export/latest with no prior export → 404", async () => {
    const { proposal } = await createProposalWithStatus(applicantId, proposalTypeId, "APPROVED", "TC-EXPORT-05 Proposal");
    const cookie = await loginApplicant(app, applicantId);

    const response = await app.inject({
      method: "GET",
      url: `/api/proposals/${proposal.id}/export/latest`,
      headers: { cookie },
    });

    expect(response.statusCode).toBe(404);
  });

  // ── TC-EXPORT-06 ───────────────────────────────────────────────────────────
  it("TC-EXPORT-06: GET /export/latest after a POST → 200, returns exportId and url", async () => {
    const { proposal } = await createProposalWithStatus(applicantId, proposalTypeId, "APPROVED", "TC-EXPORT-06 Proposal");
    const cookie = await loginApplicant(app, applicantId);

    const postResp = await app.inject({
      method: "POST",
      url: `/api/proposals/${proposal.id}/export`,
      headers: { cookie },
      payload: {},
    });
    expect(postResp.statusCode).toBe(200);
    const postBody = postResp.json() as { exportId: string };

    const getResp = await app.inject({
      method: "GET",
      url: `/api/proposals/${proposal.id}/export/latest`,
      headers: { cookie },
    });
    expect(getResp.statusCode).toBe(200);
    const getBody = getResp.json() as { exportId: string; url: string };
    expect(getBody.exportId).toBe(postBody.exportId);
    expect(getBody.url).toBe("https://mock-presigned-url/export.html");
  });
});
