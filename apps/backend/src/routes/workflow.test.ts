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

async function ensureWorkflowTransitions() {
  const wf = await db.workflowDefinition.upsert({
    where: { code: "PROPOSAL_LIFECYCLE" },
    update: {},
    create: { code: "PROPOSAL_LIFECYCLE", name: "Proposal Approval Lifecycle", isActive: true },
  });

  const transitions = [
    { fromStatus: "SUBMITTED_TO_FOCAL", toStatus: "UNDER_FOCAL_REVIEW", actionCode: "ACKNOWLEDGE", actorRole: "PROJECT_FOCAL" },
    { fromStatus: "RESUBMITTED_TO_FOCAL", toStatus: "UNDER_FOCAL_REVIEW", actionCode: "ACKNOWLEDGE", actorRole: "PROJECT_FOCAL" },
    { fromStatus: "UNDER_FOCAL_REVIEW", toStatus: "RETURNED_TO_APPLICANT", actionCode: "RETURN_TO_APPLICANT", actorRole: "PROJECT_FOCAL" },
    { fromStatus: "UNDER_FOCAL_REVIEW", toStatus: "ENDORSED_TO_RTEC", actionCode: "ENDORSE_TO_RTEC", actorRole: "PROJECT_FOCAL" },
    { fromStatus: "RETURNED_TO_FOCAL_BY_RTEC", toStatus: "ENDORSED_TO_RTEC", actionCode: "RETURN_TO_RTEC", actorRole: "PROJECT_FOCAL" },
    { fromStatus: "RETURNED_TO_FOCAL_BY_RTEC", toStatus: "ENDORSED_TO_BUDGET", actionCode: "ENDORSE_TO_BUDGET", actorRole: "PROJECT_FOCAL" },
  ];

  for (const t of transitions) {
    const existing = await db.workflowTransition.findFirst({
      where: {
        actionCode: t.actionCode,
        actorRole: t.actorRole,
        fromStatus: t.fromStatus,
        workflowDefinitionId: wf.id,
      },
    });
    if (!existing) {
      await db.workflowTransition.create({
        data: { workflowDefinitionId: wf.id, ...t },
      });
    }
  }
}

async function createStaffUser(email: string, password: string) {
  const passwordHash = await bcrypt.hash(password, 12);
  const focalRole = await db.role.findUniqueOrThrow({ where: { code: "PROJECT_FOCAL" } });
  const user = await db.user.create({
    data: {
      email,
      passwordHash,
      firstName: "Test",
      lastName: "Focal",
      isActive: true,
      mustChangePassword: false,
      userRoles: { create: [{ roleId: focalRole.id }] },
    },
  });
  return user;
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

async function loginStaff(app: FastifyInstance, email: string, password: string) {
  const response = await app.inject({
    method: "POST",
    url: "/api/auth/staff/login",
    remoteAddress: nextIp(),
    payload: { email, password },
  });
  if (response.statusCode !== 200) {
    throw new Error(
      `Failed to create staff session for ${email}: ${response.statusCode} ${response.body}`,
    );
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
    throw new Error(
      `Failed to create applicant session for ${userId}: ${response.statusCode} ${response.body}`,
    );
  }
  return sessionCookieHeader(response);
}

async function createProposalWithStatus(
  applicantUserId: string,
  proposalTypeId: string,
  status: string,
  title: string,
) {
  const formVersion = await db.formTemplateVersion.findFirst({
    where: { isCurrent: true },
  });
  if (!formVersion) {
    throw new Error("No current form template version found");
  }
  const proposal = await db.proposal.create({
    data: {
      applicantUserId,
      proposalTypeId,
      title,
      status,
    },
  });
  const version = await db.proposalVersion.create({
    data: {
      proposalId: proposal.id,
      versionNumber: 1,
      formTemplateVersionId: formVersion.id,
      createdBy: applicantUserId,
      statusAtCreation: status,
      isSubmitted: status !== "DRAFT",
    },
  });
  const updated = await db.proposal.update({
    where: { id: proposal.id },
    data: { currentVersionId: version.id },
  });
  return { proposal: updated, version };
}

async function assignFocal(proposalId: string, focalUserId: string) {
  return db.proposalAssignment.create({
    data: {
      proposalId,
      userId: focalUserId,
      roleCode: "PROJECT_FOCAL",
      assignedBy: focalUserId,
      isActive: true,
    },
  });
}

// ── Test identifiers for cleanup ─────────────────────────────────────────────

const WF_FOCAL_EMAIL = "wf-focal@test.local";
const WF_FOCAL2_EMAIL = "wf-focal2@test.local";
const WF_APPLICANT_EMAIL = "wf-applicant@test.local";
const WF_FOCAL_PASSWORD = "WfFocalPassw0rd!";
const TEST_EMAILS = [WF_FOCAL_EMAIL, WF_FOCAL2_EMAIL, WF_APPLICANT_EMAIL];

const TEST_PROPOSAL_TYPE_CODE = "PT-WF-TEST-01";
const TEST_OFFICE_CODE = "OFFICE-WF-TEST-01";
const TEST_PROGRAM_CODE = "PROG-WF-TEST-01";
const TEST_FORM_CODE = "FT-WF-TEST-01";

async function cleanupTestData() {
  // Find user IDs for cleanup
  const users = await db.user.findMany({ where: { email: { in: TEST_EMAILS } } });
  const userIds = users.map((u) => u.id);

  // Find proposals associated with our test proposal type
  const proposalType = await db.proposalType.findUnique({
    where: { code: TEST_PROPOSAL_TYPE_CODE },
  });

  if (proposalType) {
    const proposals = await db.proposal.findMany({
      where: { proposalTypeId: proposalType.id },
    });
    const proposalIds = proposals.map((p) => p.id);

    if (proposalIds.length > 0) {
      // Delete dependent records first
      await db.notification.deleteMany({ where: { proposalId: { in: proposalIds } } });
      await db.proposalWorkflowHistory.deleteMany({ where: { proposalId: { in: proposalIds } } });
      await db.auditLog.deleteMany({ where: { entityId: { in: proposalIds } } });
      await db.proposalAssignment.deleteMany({ where: { proposalId: { in: proposalIds } } });

      const versions = await db.proposalVersion.findMany({
        where: { proposalId: { in: proposalIds } },
      });
      const versionIds = versions.map((v) => v.id);

      if (versionIds.length > 0) {
        await db.proposalFieldValue.deleteMany({
          where: { proposalVersionId: { in: versionIds } },
        });
      }

      // Null out currentVersionId to allow version deletion
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

  if (userIds.length > 0) {
    await db.auditLog.deleteMany({ where: { actorUserId: { in: userIds } } });
    await db.userRole.deleteMany({ where: { userId: { in: userIds } } });
    await db.staffProfile.deleteMany({ where: { userId: { in: userIds } } });
    await db.applicantProfile.deleteMany({ where: { userId: { in: userIds } } });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
  }
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe("Workflow routes (Phase 10)", () => {
  let app: FastifyInstance;
  let focalUserId: string;
  let focal2UserId: string;
  let applicantUserId: string;
  let proposalTypeId: string;

  beforeAll(async () => {
    await ensureRolesSeeded();
    await cleanupTestData();
    await ensureWorkflowTransitions();
    app = await buildApp();
    await app.ready();

    // Seed a minimal office / program / form / proposal type for test proposals
    const office = await db.office.create({
      data: { code: TEST_OFFICE_CODE, name: "Test Office (Workflow)" },
    });
    const program = await db.program.create({
      data: {
        code: TEST_PROGRAM_CODE,
        name: "Test Program (Workflow)",
        officeId: office.id,
      },
    });
    const formTemplate = await db.formTemplate.create({
      data: { formCode: TEST_FORM_CODE, title: "Test Workflow Form", isActive: true },
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
        sectionCode: "WF-S1",
        title: "Details",
        displayOrder: 1,
        isRepeating: false,
        isRequired: true,
      },
    });
    await db.formField.create({
      data: {
        formSectionId: section.id,
        fieldCode: "WF-F1",
        label: "Title",
        inputType: "TEXT",
        isRequired: true,
        displayOrder: 1,
      },
    });
    const proposalType = await db.proposalType.create({
      data: {
        code: TEST_PROPOSAL_TYPE_CODE,
        name: "Test Workflow Grant",
        programId: program.id,
        defaultFormTemplateId: formTemplate.id,
        isActive: true,
      },
    });
    proposalTypeId = proposalType.id;

    // Create test users
    const focalUser = await createStaffUser(WF_FOCAL_EMAIL, WF_FOCAL_PASSWORD);
    focalUserId = focalUser.id;

    const focal2User = await createStaffUser(WF_FOCAL2_EMAIL, WF_FOCAL_PASSWORD);
    focal2UserId = focal2User.id;

    const applicantUser = await createApplicantUser(WF_APPLICANT_EMAIL);
    applicantUserId = applicantUser.id;
  });

  afterAll(async () => {
    await app.close();
    await cleanupTestData();
    await db.$disconnect();
  });

  // ── TC-WF-01 ───────────────────────────────────────────────────────────────
  it("TC-WF-01: Focal acknowledge from SUBMITTED_TO_FOCAL → 200, status UNDER_FOCAL_REVIEW", async () => {
    const { proposal } = await createProposalWithStatus(
      applicantUserId,
      proposalTypeId,
      "SUBMITTED_TO_FOCAL",
      "TC-WF-01 Proposal",
    );
    await assignFocal(proposal.id, focalUserId);
    const cookie = await loginStaff(app, WF_FOCAL_EMAIL, WF_FOCAL_PASSWORD);

    const response = await app.inject({
      method: "POST",
      url: `/api/proposals/${proposal.id}/workflow/acknowledge`,
      headers: { cookie },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { id: string; status: string; transitionedAt: string };
    expect(body.status).toBe("UNDER_FOCAL_REVIEW");
    expect(body.id).toBe(proposal.id);
    expect(body.transitionedAt).toBeDefined();
  });

  // ── TC-WF-01b ──────────────────────────────────────────────────────────────
  it("TC-WF-01b: Focal acknowledge from RESUBMITTED_TO_FOCAL → 200, status UNDER_FOCAL_REVIEW", async () => {
    const { proposal } = await createProposalWithStatus(
      applicantUserId,
      proposalTypeId,
      "RESUBMITTED_TO_FOCAL",
      "TC-WF-01b Proposal",
    );
    await assignFocal(proposal.id, focalUserId);
    const cookie = await loginStaff(app, WF_FOCAL_EMAIL, WF_FOCAL_PASSWORD);

    const response = await app.inject({
      method: "POST",
      url: `/api/proposals/${proposal.id}/workflow/acknowledge`,
      headers: { cookie },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { status: string };
    expect(body.status).toBe("UNDER_FOCAL_REVIEW");
  });

  // ── TC-WF-02 ───────────────────────────────────────────────────────────────
  it("TC-WF-02: return-to-applicant without comment → 422", async () => {
    const { proposal } = await createProposalWithStatus(
      applicantUserId,
      proposalTypeId,
      "UNDER_FOCAL_REVIEW",
      "TC-WF-02 Proposal",
    );
    await assignFocal(proposal.id, focalUserId);
    const cookie = await loginStaff(app, WF_FOCAL_EMAIL, WF_FOCAL_PASSWORD);

    const response = await app.inject({
      method: "POST",
      url: `/api/proposals/${proposal.id}/workflow/return-to-applicant`,
      headers: { cookie },
      // no body
    });

    expect(response.statusCode).toBe(422);
  });

  // ── TC-WF-02b ──────────────────────────────────────────────────────────────
  it("TC-WF-02b: return-to-applicant with comment → 200 + notification for applicant", async () => {
    const { proposal } = await createProposalWithStatus(
      applicantUserId,
      proposalTypeId,
      "UNDER_FOCAL_REVIEW",
      "TC-WF-02b Proposal",
    );
    await assignFocal(proposal.id, focalUserId);
    const cookie = await loginStaff(app, WF_FOCAL_EMAIL, WF_FOCAL_PASSWORD);

    const response = await app.inject({
      method: "POST",
      url: `/api/proposals/${proposal.id}/workflow/return-to-applicant`,
      headers: { cookie },
      payload: { comment: "Please revise section 3." },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { status: string };
    expect(body.status).toBe("RETURNED_TO_APPLICANT");

    // Verify notification was created for applicant
    const notification = await db.notification.findFirst({
      where: {
        recipientUserId: applicantUserId,
        proposalId: proposal.id,
        eventType: "PROPOSAL_RETURNED_TO_APPLICANT",
      },
    });
    expect(notification).not.toBeNull();
  });

  // ── TC-WF-03 ───────────────────────────────────────────────────────────────
  it("TC-WF-03: endorse-to-rtec → 200, status ENDORSED_TO_RTEC, history row written", async () => {
    const { proposal } = await createProposalWithStatus(
      applicantUserId,
      proposalTypeId,
      "UNDER_FOCAL_REVIEW",
      "TC-WF-03 Proposal",
    );
    await assignFocal(proposal.id, focalUserId);
    const cookie = await loginStaff(app, WF_FOCAL_EMAIL, WF_FOCAL_PASSWORD);

    // Use a valid UUID for rtecGroupId (it does not need to reference an existing group in Phase 10)
    const rtecGroupId = "00000000-0000-0000-0000-000000000001";

    const response = await app.inject({
      method: "POST",
      url: `/api/proposals/${proposal.id}/workflow/endorse-to-rtec`,
      headers: { cookie },
      payload: { rtecGroupId },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { status: string };
    expect(body.status).toBe("ENDORSED_TO_RTEC");

    // Verify history row written
    const historyRow = await db.proposalWorkflowHistory.findFirst({
      where: {
        proposalId: proposal.id,
        workflowAction: "ENDORSE_TO_RTEC",
      },
    });
    expect(historyRow).not.toBeNull();
    expect(historyRow?.fromStatus).toBe("UNDER_FOCAL_REVIEW");
    expect(historyRow?.toStatus).toBe("ENDORSED_TO_RTEC");
  });

  // ── TC-WF-04 ───────────────────────────────────────────────────────────────
  it("TC-WF-04: invalid transition — proposal in DRAFT, acknowledge → 422, code INVALID_TRANSITION", async () => {
    const { proposal } = await createProposalWithStatus(
      applicantUserId,
      proposalTypeId,
      "DRAFT",
      "TC-WF-04 Proposal",
    );
    await assignFocal(proposal.id, focalUserId);
    const cookie = await loginStaff(app, WF_FOCAL_EMAIL, WF_FOCAL_PASSWORD);

    const response = await app.inject({
      method: "POST",
      url: `/api/proposals/${proposal.id}/workflow/acknowledge`,
      headers: { cookie },
    });

    expect(response.statusCode).toBe(422);
    const body = response.json() as { code: string };
    expect(body.code).toBe("INVALID_TRANSITION");
  });

  // ── TC-WF-05 ───────────────────────────────────────────────────────────────
  it("TC-WF-05: concurrent transition simulation → 409, code CONCURRENT_TRANSITION", async () => {
    const { proposal } = await createProposalWithStatus(
      applicantUserId,
      proposalTypeId,
      "SUBMITTED_TO_FOCAL",
      "TC-WF-05 Proposal",
    );
    await assignFocal(proposal.id, focalUserId);

    // Simulate a concurrent transition by updating the proposal status
    // to UNDER_FOCAL_REVIEW in the DB before the request arrives.
    // The engine will find an ACKNOWLEDGE transition exists for PROJECT_FOCAL
    // but the current status (UNDER_FOCAL_REVIEW) doesn't match SUBMITTED_TO_FOCAL,
    // so it returns CONCURRENT_TRANSITION (409).
    await db.proposal.update({
      where: { id: proposal.id },
      data: { status: "UNDER_FOCAL_REVIEW" },
    });

    const cookie = await loginStaff(app, WF_FOCAL_EMAIL, WF_FOCAL_PASSWORD);

    const response = await app.inject({
      method: "POST",
      url: `/api/proposals/${proposal.id}/workflow/acknowledge`,
      headers: { cookie },
    });

    expect(response.statusCode).toBe(409);
    const body = response.json() as { code: string };
    expect(body.code).toBe("CONCURRENT_TRANSITION");
  });

  // ── TC-WF-06 ───────────────────────────────────────────────────────────────
  it("TC-WF-06: GET /api/proposals as PROJECT_FOCAL sees only assigned proposals", async () => {
    // proposalA — assigned to focalUserId
    const { proposal: proposalA } = await createProposalWithStatus(
      applicantUserId,
      proposalTypeId,
      "SUBMITTED_TO_FOCAL",
      "TC-WF-06 ProposalA (assigned)",
    );
    await assignFocal(proposalA.id, focalUserId);

    // proposalB — assigned to focal2UserId (different focal), not to focalUserId
    const { proposal: proposalB } = await createProposalWithStatus(
      applicantUserId,
      proposalTypeId,
      "SUBMITTED_TO_FOCAL",
      "TC-WF-06 ProposalB (other focal)",
    );
    await assignFocal(proposalB.id, focal2UserId);

    const cookie = await loginStaff(app, WF_FOCAL_EMAIL, WF_FOCAL_PASSWORD);

    const response = await app.inject({
      method: "GET",
      url: "/api/proposals",
      headers: { cookie },
    });

    expect(response.statusCode).toBe(200);
    const proposals = response.json() as Array<{ id: string }>;
    const ids = proposals.map((p) => p.id);

    expect(ids).toContain(proposalA.id);
    expect(ids).not.toContain(proposalB.id);
  });

  // ── TC-WF-07 ───────────────────────────────────────────────────────────────
  it("TC-WF-07: workflow history row written — GET /api/proposals/:id/workflow/history returns correct entry", async () => {
    const { proposal } = await createProposalWithStatus(
      applicantUserId,
      proposalTypeId,
      "SUBMITTED_TO_FOCAL",
      "TC-WF-07 Proposal",
    );
    await assignFocal(proposal.id, focalUserId);
    const cookie = await loginStaff(app, WF_FOCAL_EMAIL, WF_FOCAL_PASSWORD);

    // Perform the transition
    const transitionResp = await app.inject({
      method: "POST",
      url: `/api/proposals/${proposal.id}/workflow/acknowledge`,
      headers: { cookie },
    });
    expect(transitionResp.statusCode).toBe(200);

    // Fetch history
    const historyResp = await app.inject({
      method: "GET",
      url: `/api/proposals/${proposal.id}/workflow/history`,
      headers: { cookie },
    });

    expect(historyResp.statusCode).toBe(200);
    const body = historyResp.json() as {
      history: Array<{ fromStatus: string; toStatus: string; workflowAction: string }>;
    };
    expect(body.history.length).toBeGreaterThanOrEqual(1);

    const acknowledgeEntry = body.history.find((h) => h.workflowAction === "ACKNOWLEDGE");
    expect(acknowledgeEntry).not.toBeUndefined();
    expect(acknowledgeEntry?.fromStatus).toBe("SUBMITTED_TO_FOCAL");
    expect(acknowledgeEntry?.toStatus).toBe("UNDER_FOCAL_REVIEW");
  });

  // ── TC-WF-08 ───────────────────────────────────────────────────────────────
  it("TC-WF-08: audit log row written after acknowledge transition", async () => {
    const { proposal } = await createProposalWithStatus(
      applicantUserId,
      proposalTypeId,
      "SUBMITTED_TO_FOCAL",
      "TC-WF-08 Proposal",
    );
    await assignFocal(proposal.id, focalUserId);
    const cookie = await loginStaff(app, WF_FOCAL_EMAIL, WF_FOCAL_PASSWORD);

    // Perform the transition
    const transitionResp = await app.inject({
      method: "POST",
      url: `/api/proposals/${proposal.id}/workflow/acknowledge`,
      headers: { cookie },
    });
    expect(transitionResp.statusCode).toBe(200);

    // Verify audit log row in DB
    const auditRow = await db.auditLog.findFirst({
      where: {
        entityId: proposal.id,
        action: "WORKFLOW_ACKNOWLEDGE",
      },
    });
    expect(auditRow).not.toBeNull();
    expect(auditRow?.actorUserId).toBe(focalUserId);
    expect(auditRow?.entityType).toBe("proposals");
  });
});
