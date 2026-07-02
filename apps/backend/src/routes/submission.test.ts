import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
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

let ipCounter = 400;
function nextIp() {
  ipCounter += 1;
  return `10.0.6.${ipCounter}`;
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
    data: {
      userId: user.id,
      privacyConsentGiven: true,
      privacyConsentAt: new Date(),
    },
  });
  return user;
}

async function loginApplicant(app: FastifyInstance, userId: string) {
  const response = await app.inject({
    method: "POST",
    url: "/api/auth/test-applicant-login",
    remoteAddress: nextIp(),
    payload: { userId },
  });
  if (response.statusCode !== 200) {
    throw new Error(
      `Failed to create applicant session for ${userId}: ${response.statusCode} ${response.body}`,
    );
  }
  return sessionCookieHeader(response);
}

// ── Test identifiers for cleanup ─────────────────────────────────────────────

const TEST_EMAILS = [
  "sub-owner@test.local",
  "sub-other@test.local",
];

const TEST_PROPOSAL_TYPE_CODE = "PT-SUB-TEST-01";
const TEST_OFFICE_CODE = "OFFICE-SUB-TEST-01";
const TEST_PROGRAM_CODE = "PROG-SUB-TEST-01";
const TEST_FORM_CODE = "FT-SUB-TEST-01";

async function cleanupTestData() {
  const proposalType = await db.proposalType.findUnique({
    where: { code: TEST_PROPOSAL_TYPE_CODE },
  });
  if (proposalType) {
    const proposals = await db.proposal.findMany({
      where: { proposalTypeId: proposalType.id },
    });
    const proposalIds = proposals.map((p) => p.id);

    if (proposalIds.length > 0) {
      const versions = await db.proposalVersion.findMany({
        where: { proposalId: { in: proposalIds } },
      });
      const versionIds = versions.map((v) => v.id);

      if (versionIds.length > 0) {
        await db.proposalComment.deleteMany({
          where: { proposalVersionId: { in: versionIds } },
        });
        await db.proposalFieldValue.deleteMany({
          where: { proposalVersionId: { in: versionIds } },
        });
      }

      await db.proposal.updateMany({
        where: { id: { in: proposalIds } },
        data: { currentVersionId: null },
      });

      await db.proposalVersion.deleteMany({
        where: { proposalId: { in: proposalIds } },
      });
      await db.proposal.deleteMany({ where: { id: { in: proposalIds } } });
    }

    await db.proposalType.update({
      where: { id: proposalType.id },
      data: { defaultFormTemplateId: null },
    });
    await db.proposalType.delete({ where: { id: proposalType.id } });
  }

  const formTemplate = await db.formTemplate.findUnique({
    where: { formCode: TEST_FORM_CODE },
  });
  if (formTemplate) {
    const versions = await db.formTemplateVersion.findMany({
      where: { formTemplateId: formTemplate.id },
    });
    const versionIds = versions.map((v) => v.id);
    if (versionIds.length > 0) {
      const sections = await db.formSection.findMany({
        where: { formTemplateVersionId: { in: versionIds } },
      });
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

  const users = await db.user.findMany({ where: { email: { in: TEST_EMAILS } } });
  const userIds = users.map((u) => u.id);
  if (userIds.length > 0) {
    await db.auditLog.deleteMany({ where: { actorUserId: { in: userIds } } });
    await db.userRole.deleteMany({ where: { userId: { in: userIds } } });
    await db.applicantProfile.deleteMany({ where: { userId: { in: userIds } } });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
  }
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe("Submission routes", () => {
  let app: FastifyInstance;
  let proposalTypeId: string;
  let ownerUserId: string;
  let otherUserId: string;

  beforeAll(async () => {
    await ensureRolesSeeded();
    await cleanupTestData();
    app = await buildApp();
    await app.ready();

    const office = await db.office.create({
      data: { code: TEST_OFFICE_CODE, name: "Test Office (Submission)" },
    });
    const program = await db.program.create({
      data: {
        code: TEST_PROGRAM_CODE,
        name: "Test Program (Submission)",
        officeId: office.id,
      },
    });
    const formTemplate = await db.formTemplate.create({
      data: { formCode: TEST_FORM_CODE, title: "Test Submission Form", isActive: true },
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
        sectionCode: "S1",
        title: "Details",
        displayOrder: 1,
        isRepeating: false,
        isRequired: true,
      },
    });
    await db.formField.create({
      data: {
        formSectionId: section.id,
        fieldCode: "F1",
        label: "Title",
        inputType: "TEXT",
        isRequired: true,
        displayOrder: 1,
      },
    });
    const proposalType = await db.proposalType.create({
      data: {
        code: TEST_PROPOSAL_TYPE_CODE,
        name: "Test Submission Grant",
        programId: program.id,
        defaultFormTemplateId: formTemplate.id,
        isActive: true,
      },
    });
    proposalTypeId = proposalType.id;

    const owner = await createApplicantUser("sub-owner@test.local");
    ownerUserId = owner.id;

    const other = await createApplicantUser("sub-other@test.local");
    otherUserId = other.id;
  });

  afterAll(async () => {
    await app.close();
    await cleanupTestData();
    await db.$disconnect();
  });

  // ── TC-SUB-01 ──────────────────────────────────────────────────────────────
  it("TC-SUB-01: APPLICANT submits own DRAFT proposal → 200, status SUBMITTED_TO_FOCAL, isSubmitted=true", async () => {
    const cookie = await loginApplicant(app, ownerUserId);

    const createResp = await app.inject({
      method: "POST",
      url: "/api/proposals",
      headers: { cookie },
      payload: { proposalTypeId, title: "TC-SUB-01 Proposal" },
    });
    expect(createResp.statusCode).toBe(201);
    const { id: proposalId, currentVersionId } = createResp.json() as {
      id: string;
      currentVersionId: string;
    };

    const response = await app.inject({
      method: "POST",
      url: `/api/proposals/${proposalId}/submit`,
      headers: { cookie },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      id: string;
      status: string;
      submittedAt: string;
      currentVersionId: string;
    };
    expect(body.status).toBe("SUBMITTED_TO_FOCAL");
    expect(body.submittedAt).toBeDefined();

    // Verify version is marked submitted in DB
    const version = await db.proposalVersion.findUniqueOrThrow({ where: { id: currentVersionId } });
    expect(version.isSubmitted).toBe(true);
    expect(version.submittedAt).not.toBeNull();
  });

  // ── TC-SUB-02 ──────────────────────────────────────────────────────────────
  it("TC-SUB-02: APPLICANT tries to submit proposal with status NOT DRAFT → 409", async () => {
    const cookie = await loginApplicant(app, ownerUserId);

    const createResp = await app.inject({
      method: "POST",
      url: "/api/proposals",
      headers: { cookie },
      payload: { proposalTypeId, title: "TC-SUB-02 Proposal" },
    });
    expect(createResp.statusCode).toBe(201);
    const { id: proposalId } = createResp.json() as { id: string };

    // Manually set status to SUBMITTED_TO_FOCAL (not DRAFT)
    await db.proposal.update({
      where: { id: proposalId },
      data: { status: "SUBMITTED_TO_FOCAL" },
    });

    const response = await app.inject({
      method: "POST",
      url: `/api/proposals/${proposalId}/submit`,
      headers: { cookie },
    });

    expect(response.statusCode).toBe(409);
    const body = response.json() as { error: string; message: string };
    expect(body.error).toBe("Conflict");
  });

  // ── TC-SUB-03 ──────────────────────────────────────────────────────────────
  it("TC-SUB-03: APPLICANT tries to submit already-submitted version → 409", async () => {
    const cookie = await loginApplicant(app, ownerUserId);

    const createResp = await app.inject({
      method: "POST",
      url: "/api/proposals",
      headers: { cookie },
      payload: { proposalTypeId, title: "TC-SUB-03 Proposal" },
    });
    expect(createResp.statusCode).toBe(201);
    const { id: proposalId, currentVersionId } = createResp.json() as {
      id: string;
      currentVersionId: string;
    };

    // Mark version as already submitted but keep proposal as DRAFT
    await db.proposalVersion.update({
      where: { id: currentVersionId },
      data: { isSubmitted: true, submittedAt: new Date() },
    });

    const response = await app.inject({
      method: "POST",
      url: `/api/proposals/${proposalId}/submit`,
      headers: { cookie },
    });

    expect(response.statusCode).toBe(409);
    const body = response.json() as { error: string; message: string };
    expect(body.error).toBe("Conflict");
    expect(body.message).toBe("Version already submitted");
  });

  // ── TC-SUB-04 ──────────────────────────────────────────────────────────────
  it("TC-SUB-04: Different APPLICANT tries to submit another's proposal → 403", async () => {
    const ownerCookie = await loginApplicant(app, ownerUserId);
    const otherCookie = await loginApplicant(app, otherUserId);

    const createResp = await app.inject({
      method: "POST",
      url: "/api/proposals",
      headers: { cookie: ownerCookie },
      payload: { proposalTypeId, title: "TC-SUB-04 Proposal" },
    });
    expect(createResp.statusCode).toBe(201);
    const { id: proposalId } = createResp.json() as { id: string };

    const response = await app.inject({
      method: "POST",
      url: `/api/proposals/${proposalId}/submit`,
      headers: { cookie: otherCookie },
    });

    expect(response.statusCode).toBe(403);
  });

  // ── TC-SUB-05 ──────────────────────────────────────────────────────────────
  it("TC-SUB-05: APPLICANT resubmits RETURNED_TO_APPLICANT proposal → 201, new version versionNumber=previous+1, status RESUBMITTED_TO_FOCAL", async () => {
    const cookie = await loginApplicant(app, ownerUserId);

    const createResp = await app.inject({
      method: "POST",
      url: "/api/proposals",
      headers: { cookie },
      payload: { proposalTypeId, title: "TC-SUB-05 Proposal" },
    });
    expect(createResp.statusCode).toBe(201);
    const { id: proposalId, currentVersionId } = createResp.json() as {
      id: string;
      currentVersionId: string;
    };

    // Manually set status to RETURNED_TO_APPLICANT
    await db.proposal.update({
      where: { id: proposalId },
      data: { status: "RETURNED_TO_APPLICANT" },
    });

    const previousVersion = await db.proposalVersion.findUniqueOrThrow({
      where: { id: currentVersionId },
    });

    const response = await app.inject({
      method: "POST",
      url: `/api/proposals/${proposalId}/resubmit`,
      headers: { cookie },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json() as {
      id: string;
      status: string;
      currentVersionId: string;
      versionNumber: number;
    };
    expect(body.status).toBe("RESUBMITTED_TO_FOCAL");
    expect(body.versionNumber).toBe(previousVersion.versionNumber + 1);

    // Verify new version in DB
    const newVersion = await db.proposalVersion.findUniqueOrThrow({
      where: { id: body.currentVersionId },
    });
    expect(newVersion.sourceVersionId).toBe(currentVersionId);
    expect(newVersion.isSubmitted).toBe(false);
    expect(newVersion.statusAtCreation).toBe("RETURNED_TO_APPLICANT");
  });
});
