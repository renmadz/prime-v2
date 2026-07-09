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

let ipCounter = 500;
function nextIp() {
  ipCounter += 1;
  return `10.0.7.${ipCounter}`;
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

async function createStaffSession(
  app: FastifyInstance,
  email: string,
  roleCode: string,
) {
  const passwordHash = await bcrypt.hash("StaffPassw0rd!", 12);
  const role = await db.role.findUniqueOrThrow({ where: { code: roleCode } });
  await db.user.create({
    data: {
      email,
      passwordHash,
      firstName: "Staff",
      lastName: "User",
      isActive: true,
      mustChangePassword: false,
      userRoles: { create: [{ roleId: role.id }] },
    },
  });
  const loginResp = await app.inject({
    method: "POST",
    url: "/api/auth/staff/login",
    remoteAddress: nextIp(),
    payload: { email, password: "StaffPassw0rd!" },
  });
  return sessionCookieHeader(loginResp);
}

// ── Test identifiers for cleanup ─────────────────────────────────────────────

const TEST_APPLICANT_EMAILS = [
  "cmt-owner@test.local",
  "cmt-applicant2@test.local",
];
const TEST_STAFF_EMAILS = [
  "cmt-focal@test.local",
  "cmt-admin@test.local",
  "cmt-admin2@test.local",
];
const ALL_TEST_EMAILS = [...TEST_APPLICANT_EMAILS, ...TEST_STAFF_EMAILS];

const TEST_PROPOSAL_TYPE_CODE = "PT-CMT-TEST-01";
const TEST_OFFICE_CODE = "OFFICE-CMT-TEST-01";
const TEST_PROGRAM_CODE = "PROG-CMT-TEST-01";
const TEST_FORM_CODE = "FT-CMT-TEST-01";

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
      await db.proposalVersion.deleteMany({ where: { proposalId: { in: proposalIds } } });
      await db.proposalAssignment.deleteMany({ where: { proposalId: { in: proposalIds } } });
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

  const users = await db.user.findMany({ where: { email: { in: ALL_TEST_EMAILS } } });
  const userIds = users.map((u) => u.id);
  if (userIds.length > 0) {
    await db.auditLog.deleteMany({ where: { actorUserId: { in: userIds } } });
    await db.userRole.deleteMany({ where: { userId: { in: userIds } } });
    await db.staffProfile.deleteMany({ where: { userId: { in: userIds } } });
    await db.applicantProfile.deleteMany({ where: { userId: { in: userIds } } });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
  }
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe("Comments routes", () => {
  let app: FastifyInstance;
  let proposalTypeId: string;
  let ownerUserId: string;
  let fieldId: string;
  let sectionId: string;

  // Proposal shared across most tests
  let sharedProposalId: string;

  beforeAll(async () => {
    await ensureRolesSeeded();
    await cleanupTestData();
    app = await buildApp();
    await app.ready();

    const office = await db.office.create({
      data: { code: TEST_OFFICE_CODE, name: "Test Office (Comments)" },
    });
    const program = await db.program.create({
      data: {
        code: TEST_PROGRAM_CODE,
        name: "Test Program (Comments)",
        officeId: office.id,
      },
    });
    const formTemplate = await db.formTemplate.create({
      data: { formCode: TEST_FORM_CODE, title: "Test Comments Form", isActive: true },
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
    sectionId = section.id;
    const field = await db.formField.create({
      data: {
        formSectionId: section.id,
        fieldCode: "F1",
        label: "Title Field",
        inputType: "TEXT",
        isRequired: true,
        displayOrder: 1,
        isCommentable: true,
      },
    });
    fieldId = field.id;

    const proposalType = await db.proposalType.create({
      data: {
        code: TEST_PROPOSAL_TYPE_CODE,
        name: "Test Comments Grant",
        programId: program.id,
        defaultFormTemplateId: formTemplate.id,
        isActive: true,
      },
    });
    proposalTypeId = proposalType.id;

    const owner = await createApplicantUser("cmt-owner@test.local");
    ownerUserId = owner.id;
    // Seed applicant2 for isolation test
    await createApplicantUser("cmt-applicant2@test.local");

    // Create shared proposal as owner
    const ownerCookie = await loginApplicant(app, ownerUserId);
    const createResp = await app.inject({
      method: "POST",
      url: "/api/proposals",
      headers: { cookie: ownerCookie },
      payload: { proposalTypeId, title: "Shared Proposal (Comments)" },
    });
    expect(createResp.statusCode).toBe(201);
    sharedProposalId = (createResp.json() as { id: string }).id;

    // Assign focal staff to this proposal so they can access it
    const focalUser = await db.user.findUniqueOrThrow({
      where: { email: "cmt-focal@test.local" },
    }).catch(async () => {
      // Staff user not yet created — create without session
      const passwordHash = await bcrypt.hash("StaffPassw0rd!", 12);
      const focalRole = await db.role.findUniqueOrThrow({ where: { code: "PROJECT_FOCAL" } });
      return db.user.create({
        data: {
          email: "cmt-focal@test.local",
          passwordHash,
          firstName: "Focal",
          lastName: "Staff",
          isActive: true,
          mustChangePassword: false,
          userRoles: { create: [{ roleId: focalRole.id }] },
        },
      });
    });

    await db.proposalAssignment.create({
      data: {
        proposalId: sharedProposalId,
        userId: focalUser.id,
        roleCode: "PROJECT_FOCAL",
        assignedBy: focalUser.id,
        isActive: true,
      },
    });
  });

  afterAll(async () => {
    await app.close();
    await cleanupTestData();
    await db.$disconnect();
  });

  // ── TC-CMT-01 ──────────────────────────────────────────────────────────────
  it("TC-CMT-01: Staff user creates PUBLIC comment → 201 with { id, commentType, visibility, body, createdAt }", async () => {
    const focalCookie = await createStaffSession(app, "cmt-focal@test.local", "PROJECT_FOCAL").catch(async () => {
      // Already created in beforeAll — just login
      const resp = await app.inject({
        method: "POST",
        url: "/api/auth/staff/login",
        remoteAddress: nextIp(),
        payload: { email: "cmt-focal@test.local", password: "StaffPassw0rd!" },
      });
      return sessionCookieHeader(resp);
    });

    const response = await app.inject({
      method: "POST",
      url: `/api/proposals/${sharedProposalId}/comments`,
      headers: { cookie: focalCookie },
      payload: {
        commentType: "GENERAL",
        visibility: "PUBLIC",
        body: "This is a public comment from staff.",
      },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json() as {
      id: string;
      commentType: string;
      visibility: string;
      body: string;
      createdAt: string;
    };
    expect(body.id).toBeDefined();
    expect(body.commentType).toBe("GENERAL");
    expect(body.visibility).toBe("PUBLIC");
    expect(body.body).toBe("This is a public comment from staff.");
    expect(typeof body.createdAt).toBe("string");
  });

  // ── TC-CMT-02 ──────────────────────────────────────────────────────────────
  it("TC-CMT-02: APPLICANT tries to create INTERNAL comment → 403", async () => {
    const ownerCookie = await loginApplicant(app, ownerUserId);

    const response = await app.inject({
      method: "POST",
      url: `/api/proposals/${sharedProposalId}/comments`,
      headers: { cookie: ownerCookie },
      payload: {
        commentType: "GENERAL",
        visibility: "INTERNAL",
        body: "This should be forbidden.",
      },
    });

    expect(response.statusCode).toBe(403);
  });

  // ── TC-CMT-03 ──────────────────────────────────────────────────────────────
  it("TC-CMT-03: APPLICANT creates PUBLIC comment → 201", async () => {
    const ownerCookie = await loginApplicant(app, ownerUserId);

    const response = await app.inject({
      method: "POST",
      url: `/api/proposals/${sharedProposalId}/comments`,
      headers: { cookie: ownerCookie },
      payload: {
        commentType: "GENERAL",
        visibility: "PUBLIC",
        body: "Applicant's public comment.",
      },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json() as { visibility: string };
    expect(body.visibility).toBe("PUBLIC");
  });

  // ── TC-CMT-04 ──────────────────────────────────────────────────────────────
  it("TC-CMT-04: FIELD comment without targetFieldId → 400", async () => {
    const ownerCookie = await loginApplicant(app, ownerUserId);

    const response = await app.inject({
      method: "POST",
      url: `/api/proposals/${sharedProposalId}/comments`,
      headers: { cookie: ownerCookie },
      payload: {
        commentType: "FIELD",
        visibility: "PUBLIC",
        body: "Missing targetFieldId.",
        // no targetFieldId
      },
    });

    expect(response.statusCode).toBe(400);
  });

  // ── TC-CMT-05 ──────────────────────────────────────────────────────────────
  it("TC-CMT-05: SECTION comment without targetSectionId → 400", async () => {
    const ownerCookie = await loginApplicant(app, ownerUserId);

    const response = await app.inject({
      method: "POST",
      url: `/api/proposals/${sharedProposalId}/comments`,
      headers: { cookie: ownerCookie },
      payload: {
        commentType: "SECTION",
        visibility: "PUBLIC",
        body: "Missing targetSectionId.",
        // no targetSectionId
      },
    });

    expect(response.statusCode).toBe(400);
  });

  // ── TC-CMT-06 ──────────────────────────────────────────────────────────────
  it("TC-CMT-06: GET comments as APPLICANT → only PUBLIC comments returned, no INTERNAL", async () => {
    // First seed an INTERNAL comment directly in DB (bypassing the route, since applicant can't create one)
    const proposal = await db.proposal.findUniqueOrThrow({ where: { id: sharedProposalId } });
    const internalComment = await db.proposalComment.create({
      data: {
        proposalId: sharedProposalId,
        proposalVersionId: proposal.currentVersionId!,
        authorUserId: ownerUserId,
        commentType: "GENERAL",
        visibility: "INTERNAL",
        body: "Internal comment for TC-CMT-06",
        isResolved: false,
      },
    });

    const ownerCookie = await loginApplicant(app, ownerUserId);
    const response = await app.inject({
      method: "GET",
      url: `/api/proposals/${sharedProposalId}/comments`,
      headers: { cookie: ownerCookie },
    });

    expect(response.statusCode).toBe(200);
    const comments = response.json() as Array<{ id: string; visibility: string }>;

    // Must not contain any INTERNAL comment
    const internalFound = comments.find((c) => c.visibility === "INTERNAL");
    expect(internalFound).toBeUndefined();

    // Cleanup: remove the seeded internal comment
    await db.proposalComment.delete({ where: { id: internalComment.id } });
  });

  // ── TC-CMT-07 ──────────────────────────────────────────────────────────────
  it("TC-CMT-07: GET comments as staff → includes both PUBLIC and INTERNAL comments", async () => {
    // Seed an INTERNAL comment
    const proposal = await db.proposal.findUniqueOrThrow({ where: { id: sharedProposalId } });
    const internalComment = await db.proposalComment.create({
      data: {
        proposalId: sharedProposalId,
        proposalVersionId: proposal.currentVersionId!,
        authorUserId: ownerUserId,
        commentType: "GENERAL",
        visibility: "INTERNAL",
        body: "Internal comment for TC-CMT-07",
        isResolved: false,
      },
    });

    const focalResp = await app.inject({
      method: "POST",
      url: "/api/auth/staff/login",
      remoteAddress: nextIp(),
      payload: { email: "cmt-focal@test.local", password: "StaffPassw0rd!" },
    });
    const focalCookie = sessionCookieHeader(focalResp);

    const response = await app.inject({
      method: "GET",
      url: `/api/proposals/${sharedProposalId}/comments`,
      headers: { cookie: focalCookie },
    });

    expect(response.statusCode).toBe(200);
    const comments = response.json() as Array<{ id: string; visibility: string }>;

    // Staff should see INTERNAL comments
    const internalFound = comments.find((c) => c.id === internalComment.id);
    expect(internalFound).toBeDefined();
    expect(internalFound?.visibility).toBe("INTERNAL");

    // Cleanup
    await db.proposalComment.delete({ where: { id: internalComment.id } });
  });

  // ── TC-CMT-08 ──────────────────────────────────────────────────────────────
  it("TC-CMT-08: Resolve comment → 200, isResolved=true, resolvedAt set", async () => {
    const ownerCookie = await loginApplicant(app, ownerUserId);

    // Create a comment as the owner
    const createResp = await app.inject({
      method: "POST",
      url: `/api/proposals/${sharedProposalId}/comments`,
      headers: { cookie: ownerCookie },
      payload: {
        commentType: "GENERAL",
        visibility: "PUBLIC",
        body: "Comment to resolve for TC-CMT-08.",
      },
    });
    expect(createResp.statusCode).toBe(201);
    const { id: commentId } = createResp.json() as { id: string };

    // Resolve it as owner (author)
    const resolveResp = await app.inject({
      method: "PATCH",
      url: `/api/proposals/${sharedProposalId}/comments/${commentId}/resolve`,
      headers: { cookie: ownerCookie },
    });

    expect(resolveResp.statusCode).toBe(200);
    const body = resolveResp.json() as {
      id: string;
      isResolved: boolean;
      resolvedAt: string;
    };
    expect(body.isResolved).toBe(true);
    expect(body.resolvedAt).toBeDefined();
    expect(typeof body.resolvedAt).toBe("string");
  });

  // ── TC-CMT-09 (Phase 14–15 RBAC fix #4) ──────────────────────────────────────
  it("TC-CMT-09: ADMIN (not owner, not assigned) tries to create a comment → 403 (Roles-and-Permissions §3.3 marks ADMIN ❌ for Add comment)", async () => {
    const adminCookie = await createStaffSession(app, "cmt-admin@test.local", "ADMIN");

    const response = await app.inject({
      method: "POST",
      url: `/api/proposals/${sharedProposalId}/comments`,
      headers: { cookie: adminCookie },
      payload: {
        commentType: "GENERAL",
        visibility: "PUBLIC",
        body: "Admin should not be able to post this.",
      },
    });

    expect(response.statusCode).toBe(403);
  });

  // ── TC-CMT-10 (Phase 14–15 RBAC fix #4) ──────────────────────────────────────
  it("TC-CMT-10: ADMIN tries to resolve a comment authored by someone else → 403 (Roles-and-Permissions §3.3 marks ADMIN ❌ for Resolve comment; §5.8)", async () => {
    const ownerCookie = await loginApplicant(app, ownerUserId);

    const createResp = await app.inject({
      method: "POST",
      url: `/api/proposals/${sharedProposalId}/comments`,
      headers: { cookie: ownerCookie },
      payload: {
        commentType: "GENERAL",
        visibility: "PUBLIC",
        body: "Comment for TC-CMT-10 — admin must not resolve this.",
      },
    });
    expect(createResp.statusCode).toBe(201);
    const { id: commentId } = createResp.json() as { id: string };

    const adminCookie = await createStaffSession(app, "cmt-admin2@test.local", "ADMIN");
    const resolveResp = await app.inject({
      method: "PATCH",
      url: `/api/proposals/${sharedProposalId}/comments/${commentId}/resolve`,
      headers: { cookie: adminCookie },
    });

    expect(resolveResp.statusCode).toBe(403);
  });
});
