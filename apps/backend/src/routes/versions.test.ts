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

let ipCounter = 600;
function nextIp() {
  ipCounter += 1;
  return `10.0.8.${ipCounter}`;
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

async function assignRole(proposalId: string, userId: string, roleCode: string) {
  return db.proposalAssignment.create({
    data: { proposalId, userId, roleCode, assignedBy: userId, isActive: true },
  });
}

// ── Test identifiers for cleanup ─────────────────────────────────────────────

const TEST_STAFF_PASSWORD = "VerTestStaffPassw0rd!";
const RTEC_MEMBER_EMAIL = "ver-rtec-member@test.local";
const RD_EMAIL = "ver-rd@test.local";

const TEST_EMAILS = [
  "ver-owner@test.local",
  "ver-other@test.local",
  RTEC_MEMBER_EMAIL,
  RD_EMAIL,
];

const TEST_PROPOSAL_TYPE_CODE = "PT-VER-TEST-01";
const TEST_OFFICE_CODE = "OFFICE-VER-TEST-01";
const TEST_PROGRAM_CODE = "PROG-VER-TEST-01";
const TEST_FORM_CODE = "FT-VER-TEST-01";

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

      await db.proposalAssignment.deleteMany({
        where: { proposalId: { in: proposalIds } },
      });
      await db.auditLog.deleteMany({
        where: { entityType: "proposals", entityId: { in: proposalIds } },
      });
      await db.proposal.updateMany({
        where: { id: { in: proposalIds } },
        data: { currentVersionId: null },
      });
      await db.proposalVersion.deleteMany({ where: { proposalId: { in: proposalIds } } });
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

describe("Versions routes", () => {
  let app: FastifyInstance;
  let proposalTypeId: string;
  let ownerUserId: string;
  let otherUserId: string;
  let formFieldId: string;
  let formTemplateVersionId: string;

  // Shared proposal with two versions (seeded in beforeAll)
  let sharedProposalId: string;
  let version1Id: string;
  let version2Id: string;

  // Proposal belonging to "other" user for cross-proposal 403 test
  let otherProposalVersion1Id: string;
  let otherProposalVersion2Id: string;

  beforeAll(async () => {
    await ensureRolesSeeded();
    await cleanupTestData();
    app = await buildApp();
    await app.ready();

    const office = await db.office.create({
      data: { code: TEST_OFFICE_CODE, name: "Test Office (Versions)" },
    });
    const program = await db.program.create({
      data: {
        code: TEST_PROGRAM_CODE,
        name: "Test Program (Versions)",
        officeId: office.id,
      },
    });
    const formTemplate = await db.formTemplate.create({
      data: { formCode: TEST_FORM_CODE, title: "Test Versions Form", isActive: true },
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
    const field = await db.formField.create({
      data: {
        formSectionId: section.id,
        fieldCode: "F1",
        label: "Project Title",
        inputType: "TEXT",
        isRequired: true,
        displayOrder: 1,
      },
    });
    formFieldId = field.id;

    const proposalType = await db.proposalType.create({
      data: {
        code: TEST_PROPOSAL_TYPE_CODE,
        name: "Test Versions Grant",
        programId: program.id,
        defaultFormTemplateId: formTemplate.id,
        isActive: true,
      },
    });
    proposalTypeId = proposalType.id;

    const owner = await createApplicantUser("ver-owner@test.local");
    ownerUserId = owner.id;
    const other = await createApplicantUser("ver-other@test.local");
    otherUserId = other.id;

    // Create main proposal as owner
    const ownerCookie = await loginApplicant(app, ownerUserId);
    const createResp = await app.inject({
      method: "POST",
      url: "/api/proposals",
      headers: { cookie: ownerCookie },
      payload: { proposalTypeId, title: "Shared Proposal (Versions)" },
    });
    expect(createResp.statusCode).toBe(201);
    const created = createResp.json() as { id: string; currentVersionId: string };
    sharedProposalId = created.id;
    version1Id = created.currentVersionId;

    // Add field values to version 1
    await db.proposalFieldValue.create({
      data: {
        proposalVersionId: version1Id,
        formFieldId,
        value: "Version 1 Title",
      },
    });

    // Create version 2 manually (simulating resubmit)
    const v2 = await db.proposalVersion.create({
      data: {
        proposalId: sharedProposalId,
        versionNumber: 2,
        formTemplateVersionId,
        createdBy: ownerUserId,
        statusAtCreation: "RETURNED_TO_APPLICANT",
        sourceVersionId: version1Id,
        isSubmitted: false,
      },
    });
    version2Id = v2.id;

    // Add (different) field values to version 2
    await db.proposalFieldValue.create({
      data: {
        proposalVersionId: version2Id,
        formFieldId,
        value: "Version 2 Title (changed)",
      },
    });

    // Update proposal to point at version 2
    await db.proposal.update({
      where: { id: sharedProposalId },
      data: { currentVersionId: version2Id },
    });

    // Create a separate proposal for "other" user (for cross-proposal test)
    const otherCookie = await loginApplicant(app, otherUserId);
    const otherCreate = await app.inject({
      method: "POST",
      url: "/api/proposals",
      headers: { cookie: otherCookie },
      payload: { proposalTypeId, title: "Other Proposal (Versions)" },
    });
    expect(otherCreate.statusCode).toBe(201);
    const otherCreated = otherCreate.json() as { id: string; currentVersionId: string };
    otherProposalVersion1Id = otherCreated.currentVersionId;

    // Create a second version for the other proposal
    const otherV2 = await db.proposalVersion.create({
      data: {
        proposalId: otherCreated.id,
        versionNumber: 2,
        formTemplateVersionId,
        createdBy: otherUserId,
        statusAtCreation: "RETURNED_TO_APPLICANT",
        sourceVersionId: otherCreated.currentVersionId,
        isSubmitted: false,
      },
    });
    otherProposalVersion2Id = otherV2.id;
  });

  afterAll(async () => {
    await app.close();
    await cleanupTestData();
    await db.$disconnect();
  });

  // ── TC-VER-01 ──────────────────────────────────────────────────────────────
  it("TC-VER-01: Compare two versions of same proposal → returns diff array with { fieldId, label, v1Value, v2Value, changed }", async () => {
    const ownerCookie = await loginApplicant(app, ownerUserId);

    const response = await app.inject({
      method: "GET",
      url: `/api/proposals/${sharedProposalId}/versions/${version1Id}/compare/${version2Id}`,
      headers: { cookie: ownerCookie },
    });

    expect(response.statusCode).toBe(200);
    const diff = response.json() as Array<{
      fieldId: string;
      label: string;
      v1Value: string | null;
      v2Value: string | null;
      changed: boolean;
    }>;

    expect(Array.isArray(diff)).toBe(true);
    expect(diff.length).toBeGreaterThan(0);

    const fieldDiff = diff.find((d) => d.fieldId === formFieldId);
    expect(fieldDiff).toBeDefined();
    expect(fieldDiff?.label).toBe("Project Title");
    expect(fieldDiff?.v1Value).toBe("Version 1 Title");
    expect(fieldDiff?.v2Value).toBe("Version 2 Title (changed)");
    expect(fieldDiff?.changed).toBe(true);
  });

  // ── TC-VER-02 ──────────────────────────────────────────────────────────────
  it("TC-VER-02: Compare versions from different proposals → 403", async () => {
    const ownerCookie = await loginApplicant(app, ownerUserId);

    // Use version1Id (from owner's proposal) with a version from other's proposal
    const response = await app.inject({
      method: "GET",
      url: `/api/proposals/${sharedProposalId}/versions/${version1Id}/compare/${otherProposalVersion1Id}`,
      headers: { cookie: ownerCookie },
    });

    expect(response.statusCode).toBe(403);
  });

  // ── TC-VER-03 ──────────────────────────────────────────────────────────────
  it("TC-VER-03: GET /history returns audit log entries filtered to correct proposal and action types", async () => {
    const ownerCookie = await loginApplicant(app, ownerUserId);

    // Seed a PROPOSAL_SUBMITTED audit entry for this proposal
    await db.auditLog.create({
      data: {
        actorUserId: ownerUserId,
        action: "PROPOSAL_SUBMITTED",
        entityType: "proposals",
        entityId: sharedProposalId,
        actorRole: "APPLICANT",
      },
    });

    // Seed an unrelated audit entry that should NOT appear
    await db.auditLog.create({
      data: {
        actorUserId: ownerUserId,
        action: "ATTACHMENT_UPLOADED",
        entityType: "proposals",
        entityId: sharedProposalId,
        actorRole: "APPLICANT",
      },
    });

    const response = await app.inject({
      method: "GET",
      url: `/api/proposals/${sharedProposalId}/history`,
      headers: { cookie: ownerCookie },
    });

    expect(response.statusCode).toBe(200);
    const logs = response.json() as Array<{ action: string; actorUserId: string }>;

    // Only the allowed action types should appear
    const allowedActions = [
      "PROPOSAL_SUBMITTED",
      "PROPOSAL_RESUBMITTED",
      "STATUS_CHANGED",
      "COMMENT_ADDED",
      "COMMENT_RESOLVED",
    ];
    for (const log of logs) {
      expect(allowedActions).toContain(log.action);
    }

    // The PROPOSAL_SUBMITTED entry should be present
    const submittedEntry = logs.find((l) => l.action === "PROPOSAL_SUBMITTED");
    expect(submittedEntry).toBeDefined();

    // ATTACHMENT_UPLOADED should NOT appear
    const uploadEntry = logs.find((l) => l.action === "ATTACHMENT_UPLOADED");
    expect(uploadEntry).toBeUndefined();
  });

  // ── TC-VER-04 ──────────────────────────────────────────────────────────────
  it("TC-VER-04: GET /history returns entries sorted by createdAt ASC", async () => {
    const ownerCookie = await loginApplicant(app, ownerUserId);

    const response = await app.inject({
      method: "GET",
      url: `/api/proposals/${sharedProposalId}/history`,
      headers: { cookie: ownerCookie },
    });

    expect(response.statusCode).toBe(200);
    const logs = response.json() as Array<{ createdAt: string }>;

    if (logs.length >= 2) {
      for (let i = 1; i < logs.length; i++) {
        const prev = new Date(logs[i - 1].createdAt).getTime();
        const curr = new Date(logs[i].createdAt).getTime();
        expect(curr).toBeGreaterThanOrEqual(prev);
      }
    }
  });

  // ── TC-VER-05 (Phase 14–15 RBAC fix #3) ─────────────────────────────────────
  it("TC-VER-05: RTEC_MEMBER assigned to the proposal → compare versions → 403 (Roles-and-Permissions §3.1 marks Compare versions ❌ for RTEC_MEMBER)", async () => {
    const member = await createStaffUser(RTEC_MEMBER_EMAIL, TEST_STAFF_PASSWORD, "RTEC_MEMBER");
    await assignRole(sharedProposalId, member.id, "RTEC_MEMBER");
    const memberCookie = await loginStaff(app, RTEC_MEMBER_EMAIL, TEST_STAFF_PASSWORD);

    const response = await app.inject({
      method: "GET",
      url: `/api/proposals/${sharedProposalId}/versions/${version1Id}/compare/${version2Id}`,
      headers: { cookie: memberCookie },
    });

    expect(response.statusCode).toBe(403);
  });

  // ── TC-VER-06 (Phase 14–15 RBAC fix #1) ──────────────────────────────────────
  it("TC-VER-06: REGIONAL_DIRECTOR with no ProposalAssignment on this proposal → compare versions → 200 (Roles-and-Permissions §3.1 marks RD unconditional)", async () => {
    await createStaffUser(RD_EMAIL, TEST_STAFF_PASSWORD, "REGIONAL_DIRECTOR");
    const rdCookie = await loginStaff(app, RD_EMAIL, TEST_STAFF_PASSWORD);

    const response = await app.inject({
      method: "GET",
      url: `/api/proposals/${sharedProposalId}/versions/${version1Id}/compare/${version2Id}`,
      headers: { cookie: rdCookie },
    });

    expect(response.statusCode).toBe(200);
  });

  // ── TC-RESUB-01 ────────────────────────────────────────────────────────────
  it("TC-RESUB-01: POST /resubmit on RETURNED_TO_APPLICANT proposal → 201, creates new version", async () => {
    const ownerCookie = await loginApplicant(app, ownerUserId);

    // Create a fresh proposal and set to RETURNED_TO_APPLICANT
    const createResp = await app.inject({
      method: "POST",
      url: "/api/proposals",
      headers: { cookie: ownerCookie },
      payload: { proposalTypeId, title: "TC-RESUB-01 Proposal" },
    });
    expect(createResp.statusCode).toBe(201);
    const { id: proposalId, currentVersionId } = createResp.json() as {
      id: string;
      currentVersionId: string;
    };

    await db.proposal.update({
      where: { id: proposalId },
      data: { status: "RETURNED_TO_APPLICANT" },
    });

    const prevVersion = await db.proposalVersion.findUniqueOrThrow({
      where: { id: currentVersionId },
    });

    const response = await app.inject({
      method: "POST",
      url: `/api/proposals/${proposalId}/resubmit`,
      headers: { cookie: ownerCookie },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json() as {
      id: string;
      status: string;
      currentVersionId: string;
      versionNumber: number;
    };
    expect(body.status).toBe("RESUBMITTED_TO_FOCAL");
    expect(body.versionNumber).toBe(prevVersion.versionNumber + 1);
    expect(body.currentVersionId).not.toBe(currentVersionId);
  });

  // ── TC-RESUB-02 ────────────────────────────────────────────────────────────
  it("TC-RESUB-02: POST /resubmit on DRAFT proposal (wrong status) → 409", async () => {
    const ownerCookie = await loginApplicant(app, ownerUserId);

    const createResp = await app.inject({
      method: "POST",
      url: "/api/proposals",
      headers: { cookie: ownerCookie },
      payload: { proposalTypeId, title: "TC-RESUB-02 Proposal" },
    });
    expect(createResp.statusCode).toBe(201);
    const { id: proposalId } = createResp.json() as { id: string };
    // Status is DRAFT by default — no update needed

    const response = await app.inject({
      method: "POST",
      url: `/api/proposals/${proposalId}/resubmit`,
      headers: { cookie: ownerCookie },
    });

    expect(response.statusCode).toBe(409);
  });

  // ── TC-RESUB-03 ────────────────────────────────────────────────────────────
  it("TC-RESUB-03: POST /resubmit by non-owner → 403", async () => {
    const ownerCookie = await loginApplicant(app, ownerUserId);
    const otherCookie = await loginApplicant(app, otherUserId);

    const createResp = await app.inject({
      method: "POST",
      url: "/api/proposals",
      headers: { cookie: ownerCookie },
      payload: { proposalTypeId, title: "TC-RESUB-03 Proposal" },
    });
    expect(createResp.statusCode).toBe(201);
    const { id: proposalId } = createResp.json() as { id: string };

    await db.proposal.update({
      where: { id: proposalId },
      data: { status: "RETURNED_TO_APPLICANT" },
    });

    const response = await app.inject({
      method: "POST",
      url: `/api/proposals/${proposalId}/resubmit`,
      headers: { cookie: otherCookie },
    });

    expect(response.statusCode).toBe(403);
  });

  // ── TC-RESUB-04 ────────────────────────────────────────────────────────────
  it("TC-RESUB-04: New version from resubmit has sourceVersionId = previousVersion.id", async () => {
    const ownerCookie = await loginApplicant(app, ownerUserId);

    const createResp = await app.inject({
      method: "POST",
      url: "/api/proposals",
      headers: { cookie: ownerCookie },
      payload: { proposalTypeId, title: "TC-RESUB-04 Proposal" },
    });
    expect(createResp.statusCode).toBe(201);
    const { id: proposalId, currentVersionId: prevVersionId } = createResp.json() as {
      id: string;
      currentVersionId: string;
    };

    await db.proposal.update({
      where: { id: proposalId },
      data: { status: "RETURNED_TO_APPLICANT" },
    });

    const response = await app.inject({
      method: "POST",
      url: `/api/proposals/${proposalId}/resubmit`,
      headers: { cookie: ownerCookie },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json() as { currentVersionId: string };

    // Verify sourceVersionId in DB
    const newVersion = await db.proposalVersion.findUniqueOrThrow({
      where: { id: body.currentVersionId },
    });
    expect(newVersion.sourceVersionId).toBe(prevVersionId);
  });
});
