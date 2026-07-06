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

function sessionCookieHeader(response: { cookies: Array<{ name: string; value: string }> }) {
  const cookie = response.cookies.find((c) => c.name === "sessionId");
  return cookie ? `sessionId=${cookie.value}` : "";
}

let ipCounter = 8000;
function nextIp() {
  ipCounter += 1;
  return `10.0.12.${ipCounter % 250}`;
}

async function ensureRolesSeeded() {
  for (const code of ROLE_CODES) {
    await db.role.upsert({ where: { code }, update: {}, create: { code, name: code, isActive: true } });
  }
}

async function ensureWorkflowTransitions() {
  const wf = await db.workflowDefinition.upsert({
    where: { code: "PROPOSAL_LIFECYCLE" },
    update: {},
    create: { code: "PROPOSAL_LIFECYCLE", name: "Proposal Approval Lifecycle", isActive: true },
  });

  const transitions = [
    { fromStatus: "ENDORSED_TO_RD", toStatus: "UNDER_RD_REVIEW", actionCode: "RD_OPEN", actorRole: "REGIONAL_DIRECTOR" },
    { fromStatus: "UNDER_RD_REVIEW", toStatus: "APPROVED", actionCode: "RD_APPROVE", actorRole: "REGIONAL_DIRECTOR" },
    { fromStatus: "UNDER_RD_REVIEW", toStatus: "DEFERRED", actionCode: "RD_DEFER", actorRole: "REGIONAL_DIRECTOR" },
    { fromStatus: "UNDER_RD_REVIEW", toStatus: "REJECTED", actionCode: "RD_REJECT", actorRole: "REGIONAL_DIRECTOR" },
    { fromStatus: "UNDER_RD_REVIEW", toStatus: "RETURNED_TO_APPLICANT", actionCode: "RD_RETURN", actorRole: "REGIONAL_DIRECTOR" },
    { fromStatus: "DEFERRED", toStatus: "UNDER_RD_REVIEW", actionCode: "RD_RESUME", actorRole: "REGIONAL_DIRECTOR" },
  ];

  for (const t of transitions) {
    const existing = await db.workflowTransition.findFirst({
      where: { actionCode: t.actionCode, actorRole: t.actorRole, fromStatus: t.fromStatus, workflowDefinitionId: wf.id },
    });
    if (!existing) {
      await db.workflowTransition.create({ data: { workflowDefinitionId: wf.id, ...t } });
    }
  }
}

async function createStaffUser(email: string, password: string, roleCode: string) {
  const passwordHash = await bcrypt.hash(password, 12);
  const role = await db.role.findUniqueOrThrow({ where: { code: roleCode } });
  return db.user.create({
    data: {
      email, passwordHash, firstName: "Test", lastName: roleCode,
      isActive: true, mustChangePassword: false,
      userRoles: { create: [{ roleId: role.id }] },
    },
  });
}

async function createApplicantUser(email: string) {
  const applicantRole = await db.role.findUniqueOrThrow({ where: { code: "APPLICANT" } });
  const user = await db.user.create({
    data: {
      email, firstName: "Test", lastName: "Applicant",
      isActive: true, mustChangePassword: false,
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
    method: "POST", url: "/api/auth/staff/login", remoteAddress: nextIp(),
    payload: { email, password },
  });
  if (response.statusCode !== 200) {
    throw new Error(`Failed to create staff session for ${email}: ${response.statusCode} ${response.body}`);
  }
  return sessionCookieHeader(response);
}

async function createProposalWithStatus(
  applicantUserId: string, proposalTypeId: string, status: string, title: string,
) {
  const formVersion = await db.formTemplateVersion.findFirst({ where: { isCurrent: true } });
  if (!formVersion) throw new Error("No current form template version found");

  const proposal = await db.proposal.create({ data: { applicantUserId, proposalTypeId, title, status } });
  const version = await db.proposalVersion.create({
    data: {
      proposalId: proposal.id, versionNumber: 1, formTemplateVersionId: formVersion.id,
      createdBy: applicantUserId, statusAtCreation: status, isSubmitted: true,
    },
  });
  const updated = await db.proposal.update({ where: { id: proposal.id }, data: { currentVersionId: version.id } });
  return { proposal: updated, version };
}

async function assignRole(proposalId: string, userId: string, roleCode: string) {
  return db.proposalAssignment.create({
    data: { proposalId, userId, roleCode, assignedBy: userId, isActive: true },
  });
}

const RD_EMAIL = "rd-t-1@test.local";
const FOCAL_EMAIL = "rd-t-focal@test.local";
const BUDGET_EMAIL = "rd-t-budget@test.local";
const APPLICANT_EMAIL = "rd-t-applicant@test.local";
const TEST_PASSWORD = "RdTestPassw0rd!";
const TEST_EMAILS = [RD_EMAIL, FOCAL_EMAIL, BUDGET_EMAIL, APPLICANT_EMAIL];

const TEST_PROPOSAL_TYPE_CODE = "PT-RD-TEST-01";
const TEST_OFFICE_CODE = "OFFICE-RD-TEST-01";
const TEST_PROGRAM_CODE = "PROG-RD-TEST-01";
const TEST_FORM_CODE = "FT-RD-TEST-01";

async function cleanupTestData() {
  const users = await db.user.findMany({ where: { email: { in: TEST_EMAILS } } });
  const userIds = users.map((u) => u.id);

  const proposalType = await db.proposalType.findUnique({ where: { code: TEST_PROPOSAL_TYPE_CODE } });
  if (proposalType) {
    const proposals = await db.proposal.findMany({ where: { proposalTypeId: proposalType.id } });
    const proposalIds = proposals.map((p) => p.id);
    if (proposalIds.length > 0) {
      await db.rdDecision.deleteMany({ where: { proposalId: { in: proposalIds } } });
      await db.notification.deleteMany({ where: { proposalId: { in: proposalIds } } });
      await db.proposalWorkflowHistory.deleteMany({ where: { proposalId: { in: proposalIds } } });
      await db.auditLog.deleteMany({ where: { entityId: { in: proposalIds } } });
      await db.proposalAssignment.deleteMany({ where: { proposalId: { in: proposalIds } } });

      const versions = await db.proposalVersion.findMany({ where: { proposalId: { in: proposalIds } } });
      const versionIds = versions.map((v) => v.id);
      if (versionIds.length > 0) {
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
    await db.userRole.deleteMany({ where: { userId: { in: userIds } } });
    await db.staffProfile.deleteMany({ where: { userId: { in: userIds } } });
    await db.applicantProfile.deleteMany({ where: { userId: { in: userIds } } });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
  }
}

describe("Regional Director routes (Phase 12)", () => {
  let app: FastifyInstance;
  let rdId: string;
  let focalId: string;
  let applicantId: string;
  let proposalTypeId: string;

  beforeAll(async () => {
    await ensureRolesSeeded();
    await cleanupTestData();
    await ensureWorkflowTransitions();
    app = await buildApp();
    await app.ready();

    const office = await db.office.create({ data: { code: TEST_OFFICE_CODE, name: "Test Office (RD)" } });
    const program = await db.program.create({ data: { code: TEST_PROGRAM_CODE, name: "Test Program (RD)", officeId: office.id } });
    const formTemplate = await db.formTemplate.create({ data: { formCode: TEST_FORM_CODE, title: "Test RD Form", isActive: true } });
    const formVersion = await db.formTemplateVersion.create({
      data: { formTemplateId: formTemplate.id, versionNumber: 1, schemaVersion: "1.0", isCurrent: true, publishedAt: new Date() },
    });
    const section = await db.formSection.create({
      data: { formTemplateVersionId: formVersion.id, sectionCode: "RD-S1", title: "Details", displayOrder: 1, isRepeating: false, isRequired: true },
    });
    await db.formField.create({
      data: { formSectionId: section.id, fieldCode: "RD-F1", label: "Title", inputType: "TEXT", isRequired: true, displayOrder: 1 },
    });
    const proposalType = await db.proposalType.create({
      data: { code: TEST_PROPOSAL_TYPE_CODE, name: "Test RD Grant", programId: program.id, defaultFormTemplateId: formTemplate.id, isActive: true },
    });
    proposalTypeId = proposalType.id;

    rdId = (await createStaffUser(RD_EMAIL, TEST_PASSWORD, "REGIONAL_DIRECTOR")).id;
    focalId = (await createStaffUser(FOCAL_EMAIL, TEST_PASSWORD, "PROJECT_FOCAL")).id;
    await createStaffUser(BUDGET_EMAIL, TEST_PASSWORD, "BUDGET_OFFICER");
    applicantId = (await createApplicantUser(APPLICANT_EMAIL)).id;
  });

  afterAll(async () => {
    await app.close();
    await cleanupTestData();
    await db.$disconnect();
  });

  async function setupProposal(status: string, title: string) {
    const { proposal } = await createProposalWithStatus(applicantId, proposalTypeId, status, title);
    await assignRole(proposal.id, focalId, "PROJECT_FOCAL");
    return proposal;
  }

  it("TC-RD-01: RD opens proposal from ENDORSED_TO_RD → 200, status UNDER_RD_REVIEW", async () => {
    const proposal = await setupProposal("ENDORSED_TO_RD", "TC-RD-01");
    const cookie = await loginStaff(app, RD_EMAIL, TEST_PASSWORD);

    const response = await app.inject({
      method: "POST", url: `/api/proposals/${proposal.id}/workflow/rd-open`, headers: { cookie },
    });

    expect(response.statusCode).toBe(200);
    expect((response.json() as { status: string }).status).toBe("UNDER_RD_REVIEW");
  });

  it("TC-RD-02: RD approves with comment → 200, status APPROVED, isLocked=true, Applicant + Focal notified", async () => {
    const proposal = await setupProposal("UNDER_RD_REVIEW", "TC-RD-02");
    const cookie = await loginStaff(app, RD_EMAIL, TEST_PASSWORD);

    const response = await app.inject({
      method: "POST", url: `/api/proposals/${proposal.id}/workflow/rd-approve`, headers: { cookie },
      payload: { comment: "Meets all criteria." },
    });

    expect(response.statusCode).toBe(200);
    expect((response.json() as { status: string }).status).toBe("APPROVED");

    const updated = await db.proposal.findUniqueOrThrow({ where: { id: proposal.id } });
    expect(updated.isLocked).toBe(true);

    const applicantNotif = await db.notification.findFirst({
      where: { recipientUserId: applicantId, proposalId: proposal.id, eventType: "PROPOSAL_APPROVED" },
    });
    expect(applicantNotif).not.toBeNull();

    const focalNotif = await db.notification.findFirst({
      where: { recipientUserId: focalId, proposalId: proposal.id, eventType: "PROPOSAL_APPROVED" },
    });
    expect(focalNotif).not.toBeNull();

    const decision = await db.rdDecision.findFirst({ where: { proposalId: proposal.id, decision: "APPROVED" } });
    expect(decision).not.toBeNull();
  });

  it("TC-RD-03: RD rejects with mandatory comment → 200, status REJECTED, Applicant notified; missing comment → 422", async () => {
    const proposal = await setupProposal("UNDER_RD_REVIEW", "TC-RD-03");
    const cookie = await loginStaff(app, RD_EMAIL, TEST_PASSWORD);

    const missingCommentResp = await app.inject({
      method: "POST", url: `/api/proposals/${proposal.id}/workflow/rd-reject`, headers: { cookie },
    });
    expect(missingCommentResp.statusCode).toBe(422);
    expect((missingCommentResp.json() as { code: string }).code).toBe("COMMENT_REQUIRED");

    const response = await app.inject({
      method: "POST", url: `/api/proposals/${proposal.id}/workflow/rd-reject`, headers: { cookie },
      payload: { comment: "Does not meet eligibility requirements." },
    });

    expect(response.statusCode).toBe(200);
    expect((response.json() as { status: string }).status).toBe("REJECTED");

    const updated = await db.proposal.findUniqueOrThrow({ where: { id: proposal.id } });
    expect(updated.isLocked).toBe(true);

    const applicantNotif = await db.notification.findFirst({
      where: { recipientUserId: applicantId, proposalId: proposal.id, eventType: "PROPOSAL_REJECTED" },
    });
    expect(applicantNotif).not.toBeNull();
  });

  it("TC-RD-04: RD defers with reason → 200, status DEFERRED, no Applicant notification", async () => {
    const proposal = await setupProposal("UNDER_RD_REVIEW", "TC-RD-04");
    const cookie = await loginStaff(app, RD_EMAIL, TEST_PASSWORD);

    const response = await app.inject({
      method: "POST", url: `/api/proposals/${proposal.id}/workflow/rd-defer`, headers: { cookie },
      payload: { reason: "Pending additional financial documentation." },
    });

    expect(response.statusCode).toBe(200);
    expect((response.json() as { status: string }).status).toBe("DEFERRED");

    const applicantNotif = await db.notification.findFirst({
      where: { recipientUserId: applicantId, proposalId: proposal.id, eventType: { contains: "DEFER" } },
    });
    expect(applicantNotif).toBeNull();
  });

  it("TC-RD-05: RD resumes after deferral → 200, status UNDER_RD_REVIEW", async () => {
    const proposal = await setupProposal("DEFERRED", "TC-RD-05");
    const cookie = await loginStaff(app, RD_EMAIL, TEST_PASSWORD);

    const response = await app.inject({
      method: "POST", url: `/api/proposals/${proposal.id}/workflow/rd-resume`, headers: { cookie },
    });

    expect(response.statusCode).toBe(200);
    expect((response.json() as { status: string }).status).toBe("UNDER_RD_REVIEW");
  });

  it("TC-RD-06: RD returns to Applicant with comment → 200, status RETURNED_TO_APPLICANT, isLocked=false, Applicant notified", async () => {
    const proposal = await setupProposal("UNDER_RD_REVIEW", "TC-RD-06");
    await db.proposal.update({ where: { id: proposal.id }, data: { isLocked: false } });
    const cookie = await loginStaff(app, RD_EMAIL, TEST_PASSWORD);

    const response = await app.inject({
      method: "POST", url: `/api/proposals/${proposal.id}/workflow/rd-return`, headers: { cookie },
      payload: { comment: "Please clarify the implementation timeline." },
    });

    expect(response.statusCode).toBe(200);
    expect((response.json() as { status: string }).status).toBe("RETURNED_TO_APPLICANT");

    const updated = await db.proposal.findUniqueOrThrow({ where: { id: proposal.id } });
    expect(updated.isLocked).toBe(false);

    const applicantNotif = await db.notification.findFirst({
      where: { recipientUserId: applicantId, proposalId: proposal.id, eventType: "PROPOSAL_RETURNED_TO_APPLICANT" },
    });
    expect(applicantNotif).not.toBeNull();
  });

  it("TC-RD-07: non-REGIONAL_DIRECTOR (Project Focal) user → 403", async () => {
    const proposal = await setupProposal("ENDORSED_TO_RD", "TC-RD-07");
    const cookie = await loginStaff(app, FOCAL_EMAIL, TEST_PASSWORD);

    const response = await app.inject({
      method: "POST", url: `/api/proposals/${proposal.id}/workflow/rd-open`, headers: { cookie },
    });

    expect(response.statusCode).toBe(403);
  });

  it("TC-FINAL-01: finalized proposal (APPROVED) blocks any further RD write → 409 PROPOSAL_FINALIZED", async () => {
    const proposal = await setupProposal("APPROVED", "TC-RD-FINAL-01");
    const cookie = await loginStaff(app, RD_EMAIL, TEST_PASSWORD);

    const response = await app.inject({
      method: "POST", url: `/api/proposals/${proposal.id}/workflow/rd-return`, headers: { cookie },
      payload: { comment: "Should be blocked." },
    });

    expect(response.statusCode).toBe(409);
    expect((response.json() as { code: string }).code).toBe("PROPOSAL_FINALIZED");
  });

  it("TC-FINAL-02: audit log row written after RD approve", async () => {
    const proposal = await setupProposal("UNDER_RD_REVIEW", "TC-RD-FINAL-02");
    const cookie = await loginStaff(app, RD_EMAIL, TEST_PASSWORD);

    await app.inject({
      method: "POST", url: `/api/proposals/${proposal.id}/workflow/rd-approve`, headers: { cookie },
      payload: { comment: "Approved for audit check." },
    });

    const auditRow = await db.auditLog.findFirst({
      where: { entityId: proposal.id, action: "WORKFLOW_RD_APPROVE" },
    });
    expect(auditRow).not.toBeNull();
    expect(auditRow?.actorUserId).toBe(rdId);
    expect(auditRow?.entityType).toBe("proposals");
  });
});
