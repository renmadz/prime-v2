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

let ipCounter = 200;
function nextIp() {
  ipCounter += 1;
  return `10.0.4.${ipCounter}`;
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

// ── Test applicant session helper ────────────────────────────────────────────

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

async function createFocalSession(app: FastifyInstance, email: string) {
  const passwordHash = await bcrypt.hash("FocalPassw0rd!", 12);
  const focalRole = await db.role.findUniqueOrThrow({ where: { code: "PROJECT_FOCAL" } });
  await db.user.create({
    data: {
      email,
      passwordHash,
      firstName: "Focal",
      lastName: "User",
      isActive: true,
      mustChangePassword: false,
      userRoles: { create: [{ roleId: focalRole.id }] },
    },
  });
  const loginResponse = await app.inject({
    method: "POST",
    url: "/api/auth/staff/login",
    remoteAddress: nextIp(),
    payload: { email, password: "FocalPassw0rd!" },
  });
  return sessionCookieHeader(loginResponse);
}

// ── Emails / identifiers for cleanup ────────────────────────────────────────

const TEST_APPLICANT_EMAILS = [
  "applicant1-prop@test.local",
  "applicant2-prop@test.local",
];
const TEST_STAFF_EMAILS = ["focal-prop-05@test.local"];
const ALL_TEST_EMAILS = [...TEST_APPLICANT_EMAILS, ...TEST_STAFF_EMAILS];

const TEST_PROPOSAL_TYPE_CODE = "PT-PROP-TEST-01";
const TEST_OFFICE_CODE = "OFFICE-PROP-TEST-01";
const TEST_PROGRAM_CODE = "PROG-PROP-TEST-01";
const TEST_FORM_CODE = "FT-PROP-TEST-01";

async function cleanupTestData() {
  // Delete proposal field values, versions, proposals
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
        await db.proposalFieldValue.deleteMany({
          where: { proposalVersionId: { in: versionIds } },
        });
      }

      // Unlink currentVersionId before deleting versions
      await db.proposal.updateMany({
        where: { id: { in: proposalIds } },
        data: { currentVersionId: null },
      });

      await db.proposalVersion.deleteMany({
        where: { proposalId: { in: proposalIds } },
      });
      await db.proposal.deleteMany({ where: { id: { in: proposalIds } } });
    }

    // Unlink defaultFormTemplateId before deleting proposal type
    await db.proposalType.update({
      where: { id: proposalType.id },
      data: { defaultFormTemplateId: null },
    });
    await db.proposalType.delete({ where: { id: proposalType.id } });
  }

  // Clean form template
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

  // Clean program and office
  const program = await db.program.findUnique({ where: { code: TEST_PROGRAM_CODE } });
  if (program) {
    await db.program.delete({ where: { id: program.id } });
  }
  const office = await db.office.findUnique({ where: { code: TEST_OFFICE_CODE } });
  if (office) {
    await db.office.delete({ where: { id: office.id } });
  }

  // Clean test users
  const users = await db.user.findMany({ where: { email: { in: ALL_TEST_EMAILS } } });
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

// ── Test suite ───────────────────────────────────────────────────────────────

describe("Proposals routes", () => {
  let app: FastifyInstance;

  // Shared IDs seeded in beforeAll
  let proposalTypeId: string;
  let formField1Id: string;
  let formField2Id: string;
  let applicant1Id: string;
  let applicant2Id: string;

  beforeAll(async () => {
    await ensureRolesSeeded();
    await cleanupTestData();
    app = await buildApp();
    await app.ready();

    // ── Seed office + program ───────────────────────────────────────────────
    const office = await db.office.create({
      data: { code: TEST_OFFICE_CODE, name: "Test Office (Proposals)" },
    });

    const program = await db.program.create({
      data: {
        code: TEST_PROGRAM_CODE,
        name: "Test Program (Proposals)",
        officeId: office.id,
      },
    });

    // ── Seed FormTemplate + current Version + Section + 2 Fields ───────────
    const formTemplate = await db.formTemplate.create({
      data: { formCode: TEST_FORM_CODE, title: "Test Proposal Form", isActive: true },
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
        title: "Project Details",
        displayOrder: 1,
        isRepeating: false,
        isRequired: true,
      },
    });

    const field1 = await db.formField.create({
      data: {
        formSectionId: section.id,
        fieldCode: "F1",
        label: "Project Title",
        inputType: "TEXT",
        isRequired: true,
        displayOrder: 1,
      },
    });
    formField1Id = field1.id;

    const field2 = await db.formField.create({
      data: {
        formSectionId: section.id,
        fieldCode: "F2",
        label: "Project Description",
        inputType: "TEXTAREA",
        isRequired: false,
        displayOrder: 2,
      },
    });
    formField2Id = field2.id;

    // ── Seed ProposalType linked to the FormTemplate ────────────────────────
    const proposalType = await db.proposalType.create({
      data: {
        code: TEST_PROPOSAL_TYPE_CODE,
        name: "Test Grant (Proposals)",
        programId: program.id,
        defaultFormTemplateId: formTemplate.id,
        isActive: true,
      },
    });
    proposalTypeId = proposalType.id;

    // ── Seed two applicant users ────────────────────────────────────────────
    const a1 = await createApplicantUser("applicant1-prop@test.local");
    applicant1Id = a1.id;

    const a2 = await createApplicantUser("applicant2-prop@test.local");
    applicant2Id = a2.id;
  });

  afterAll(async () => {
    await app.close();
    await cleanupTestData();
    await db.$disconnect();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TC-PROP-01: POST creates DRAFT with version 1
  // ─────────────────────────────────────────────────────────────────────────
  it("TC-PROP-01: POST /api/proposals as APPLICANT creates DRAFT with version 1, returns proposal id and currentVersionId", async () => {
    const cookie = await loginApplicant(app, applicant1Id);

    const response = await app.inject({
      method: "POST",
      url: "/api/proposals",
      headers: { cookie },
      payload: {
        proposalTypeId,
        title: "My Test Proposal TC-01",
      },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json() as {
      id: string;
      title: string;
      status: string;
      currentVersionId: string;
      createdAt: string;
    };
    expect(body.id).toBeDefined();
    expect(body.title).toBe("My Test Proposal TC-01");
    expect(body.status).toBe("DRAFT");
    expect(body.currentVersionId).toBeDefined();

    // Verify the version exists in the DB with versionNumber = 1
    const version = await db.proposalVersion.findUniqueOrThrow({
      where: { id: body.currentVersionId },
    });
    expect(version.versionNumber).toBe(1);
    expect(version.isSubmitted).toBe(false);
    expect(version.proposalId).toBe(body.id);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TC-PROP-02: GET returns only the current applicant's proposals
  // ─────────────────────────────────────────────────────────────────────────
  it("TC-PROP-02: GET /api/proposals returns ONLY the current applicant's proposals (applicant1 can't see applicant2's)", async () => {
    // Create a proposal for applicant2 first
    const cookie2 = await loginApplicant(app, applicant2Id);
    const createResp = await app.inject({
      method: "POST",
      url: "/api/proposals",
      headers: { cookie: cookie2 },
      payload: { proposalTypeId, title: "Applicant2 Proposal TC-02" },
    });
    expect(createResp.statusCode).toBe(201);

    // Log in as applicant1 and list proposals — should NOT include applicant2's
    const cookie1 = await loginApplicant(app, applicant1Id);
    const listResp = await app.inject({
      method: "GET",
      url: "/api/proposals",
      headers: { cookie: cookie1 },
    });

    expect(listResp.statusCode).toBe(200);
    const proposals = listResp.json() as Array<{
      id: string;
      title: string;
      status: string;
      proposalType: { name: string };
    }>;

    // All returned proposals must belong to applicant1
    const a2Proposal = proposals.find((p) => p.title === "Applicant2 Proposal TC-02");
    expect(a2Proposal).toBeUndefined();

    // Applicant1's own proposals should be present
    const a1Proposals = proposals.filter((p) => p.title === "My Test Proposal TC-01");
    expect(a1Proposals.length).toBeGreaterThan(0);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TC-PROP-03: PATCH autosave updates field values; returns 200 with savedAt
  // ─────────────────────────────────────────────────────────────────────────
  it("TC-PROP-03: PATCH autosave updates field values; returns 200 with { status: 'saved', savedAt }", async () => {
    // Create a proposal as applicant1
    const cookie1 = await loginApplicant(app, applicant1Id);
    const createResp = await app.inject({
      method: "POST",
      url: "/api/proposals",
      headers: { cookie: cookie1 },
      payload: { proposalTypeId, title: "Autosave Test Proposal TC-03" },
    });
    expect(createResp.statusCode).toBe(201);
    const { id: proposalId, currentVersionId } = createResp.json() as {
      id: string;
      currentVersionId: string;
    };

    // Autosave fields
    const saveResp = await app.inject({
      method: "PATCH",
      url: `/api/proposals/${proposalId}/versions/draft/fields`,
      headers: { cookie: cookie1 },
      payload: {
        fields: [
          { formFieldId: formField1Id, value: "My Project Title" },
          { formFieldId: formField2Id, value: "A brief description" },
        ],
      },
    });

    expect(saveResp.statusCode).toBe(200);
    const saveBody = saveResp.json() as { status: string; savedAt: string };
    expect(saveBody.status).toBe("saved");
    expect(typeof saveBody.savedAt).toBe("string");

    // Verify field values were persisted in DB
    const fv1 = await db.proposalFieldValue.findUnique({
      where: {
        proposalVersionId_formFieldId: {
          proposalVersionId: currentVersionId,
          formFieldId: formField1Id,
        },
      },
    });
    expect(fv1?.value).toBe("My Project Title");

    const fv2 = await db.proposalFieldValue.findUnique({
      where: {
        proposalVersionId_formFieldId: {
          proposalVersionId: currentVersionId,
          formFieldId: formField2Id,
        },
      },
    });
    expect(fv2?.value).toBe("A brief description");
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TC-PROP-04: PATCH autosave returns 409 if currentVersion.isSubmitted = true
  // ─────────────────────────────────────────────────────────────────────────
  it("TC-PROP-04: PATCH autosave returns 409 if currentVersion.isSubmitted = true", async () => {
    // Create a proposal as applicant1
    const cookie1 = await loginApplicant(app, applicant1Id);
    const createResp = await app.inject({
      method: "POST",
      url: "/api/proposals",
      headers: { cookie: cookie1 },
      payload: { proposalTypeId, title: "Submitted Proposal TC-04" },
    });
    expect(createResp.statusCode).toBe(201);
    const { id: proposalId, currentVersionId } = createResp.json() as {
      id: string;
      currentVersionId: string;
    };

    // Manually mark the version as submitted in the DB
    await db.proposalVersion.update({
      where: { id: currentVersionId },
      data: { isSubmitted: true, submittedAt: new Date() },
    });

    // Attempt to autosave — should get 409
    const saveResp = await app.inject({
      method: "PATCH",
      url: `/api/proposals/${proposalId}/versions/draft/fields`,
      headers: { cookie: cookie1 },
      payload: {
        fields: [{ formFieldId: formField1Id, value: "Should fail" }],
      },
    });

    expect(saveResp.statusCode).toBe(409);
    const body = saveResp.json() as { error: string; message: string };
    expect(body.error).toBe("Conflict");
    expect(body.message).toBe("Version already submitted");
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TC-PROP-05: POST /api/proposals as PROJECT_FOCAL returns 403
  // ─────────────────────────────────────────────────────────────────────────
  it("TC-PROP-05: POST /api/proposals as PROJECT_FOCAL returns 403", async () => {
    const focalCookie = await createFocalSession(app, "focal-prop-05@test.local");

    const response = await app.inject({
      method: "POST",
      url: "/api/proposals",
      headers: { cookie: focalCookie },
      payload: {
        proposalTypeId,
        title: "Should Be Rejected",
      },
    });

    expect(response.statusCode).toBe(403);
  });
});
