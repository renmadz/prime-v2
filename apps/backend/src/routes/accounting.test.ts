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

let ipCounter = 7000;
function nextIp() {
  ipCounter += 1;
  return `10.0.11.${ipCounter % 250}`;
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
    { fromStatus: "ENDORSED_TO_ACCOUNTING", toStatus: "UNDER_ACCOUNTING_REVIEW", actionCode: "ACCOUNTING_OPEN", actorRole: "ACCOUNTANT" },
    { fromStatus: "UNDER_ACCOUNTING_REVIEW", toStatus: "RETURNED_BY_ACCOUNTING", actionCode: "ACCOUNTING_RETURN_BUDGET", actorRole: "ACCOUNTANT" },
    { fromStatus: "UNDER_ACCOUNTING_REVIEW", toStatus: "RETURNED_BY_ACCOUNTING", actionCode: "ACCOUNTING_RETURN_FOCAL", actorRole: "ACCOUNTANT" },
    { fromStatus: "UNDER_ACCOUNTING_REVIEW", toStatus: "ENDORSED_TO_RD", actionCode: "ACCOUNTING_ENDORSE_RD", actorRole: "ACCOUNTANT" },
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

const ACCOUNTANT_EMAIL = "acct-t-1@test.local";
const BUDGET_EMAIL = "acct-t-budget@test.local";
const FOCAL_EMAIL = "acct-t-focal@test.local";
const RD_EMAIL = "acct-t-rd@test.local";
const APPLICANT_EMAIL = "acct-t-applicant@test.local";
const TEST_PASSWORD = "AcctTestPassw0rd!";
const TEST_EMAILS = [ACCOUNTANT_EMAIL, BUDGET_EMAIL, FOCAL_EMAIL, RD_EMAIL, APPLICANT_EMAIL];

const TEST_PROPOSAL_TYPE_CODE = "PT-ACCT-TEST-01";
const TEST_OFFICE_CODE = "OFFICE-ACCT-TEST-01";
const TEST_PROGRAM_CODE = "PROG-ACCT-TEST-01";
const TEST_FORM_CODE = "FT-ACCT-TEST-01";

async function cleanupTestData() {
  const users = await db.user.findMany({ where: { email: { in: TEST_EMAILS } } });
  const userIds = users.map((u) => u.id);

  const proposalType = await db.proposalType.findUnique({ where: { code: TEST_PROPOSAL_TYPE_CODE } });
  if (proposalType) {
    const proposals = await db.proposal.findMany({ where: { proposalTypeId: proposalType.id } });
    const proposalIds = proposals.map((p) => p.id);
    if (proposalIds.length > 0) {
      await db.accountingReview.deleteMany({ where: { proposalId: { in: proposalIds } } });
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

describe("Accountant routes (Phase 12)", () => {
  let app: FastifyInstance;
  let accountantId: string;
  let budgetId: string;
  let focalId: string;
  let rdId: string;
  let applicantId: string;
  let proposalTypeId: string;

  beforeAll(async () => {
    await ensureRolesSeeded();
    await cleanupTestData();
    await ensureWorkflowTransitions();
    app = await buildApp();
    await app.ready();

    const office = await db.office.create({ data: { code: TEST_OFFICE_CODE, name: "Test Office (Accounting)" } });
    const program = await db.program.create({ data: { code: TEST_PROGRAM_CODE, name: "Test Program (Accounting)", officeId: office.id } });
    const formTemplate = await db.formTemplate.create({ data: { formCode: TEST_FORM_CODE, title: "Test Accounting Form", isActive: true } });
    const formVersion = await db.formTemplateVersion.create({
      data: { formTemplateId: formTemplate.id, versionNumber: 1, schemaVersion: "1.0", isCurrent: true, publishedAt: new Date() },
    });
    const section = await db.formSection.create({
      data: { formTemplateVersionId: formVersion.id, sectionCode: "ACCT-S1", title: "Details", displayOrder: 1, isRepeating: false, isRequired: true },
    });
    await db.formField.create({
      data: { formSectionId: section.id, fieldCode: "ACCT-F1", label: "Title", inputType: "TEXT", isRequired: true, displayOrder: 1 },
    });
    const proposalType = await db.proposalType.create({
      data: { code: TEST_PROPOSAL_TYPE_CODE, name: "Test Accounting Grant", programId: program.id, defaultFormTemplateId: formTemplate.id, isActive: true },
    });
    proposalTypeId = proposalType.id;

    accountantId = (await createStaffUser(ACCOUNTANT_EMAIL, TEST_PASSWORD, "ACCOUNTANT")).id;
    budgetId = (await createStaffUser(BUDGET_EMAIL, TEST_PASSWORD, "BUDGET_OFFICER")).id;
    focalId = (await createStaffUser(FOCAL_EMAIL, TEST_PASSWORD, "PROJECT_FOCAL")).id;
    rdId = (await createStaffUser(RD_EMAIL, TEST_PASSWORD, "REGIONAL_DIRECTOR")).id;
    applicantId = (await createApplicantUser(APPLICANT_EMAIL)).id;
  });

  afterAll(async () => {
    await app.close();
    await cleanupTestData();
    await db.$disconnect();
  });

  async function setupProposal(status: string, title: string) {
    const { proposal } = await createProposalWithStatus(applicantId, proposalTypeId, status, title);
    await assignRole(proposal.id, accountantId, "ACCOUNTANT");
    await assignRole(proposal.id, budgetId, "BUDGET_OFFICER");
    await assignRole(proposal.id, focalId, "PROJECT_FOCAL");
    return proposal;
  }

  it("TC-ACCT-01: Accountant opens review from ENDORSED_TO_ACCOUNTING → 200, status UNDER_ACCOUNTING_REVIEW", async () => {
    const proposal = await setupProposal("ENDORSED_TO_ACCOUNTING", "TC-ACCT-01");
    const cookie = await loginStaff(app, ACCOUNTANT_EMAIL, TEST_PASSWORD);

    const response = await app.inject({
      method: "POST", url: `/api/proposals/${proposal.id}/workflow/accounting-open`, headers: { cookie },
    });

    expect(response.statusCode).toBe(200);
    expect((response.json() as { status: string }).status).toBe("UNDER_ACCOUNTING_REVIEW");

    const reviewRow = await db.accountingReview.findFirst({ where: { proposalId: proposal.id, reviewerUserId: accountantId } });
    expect(reviewRow?.status).toBe("OPEN");
  });

  it("TC-ACCT-02: Accountant returns to Budget with comment → 200, status RETURNED_BY_ACCOUNTING, Budget Officer notified", async () => {
    const proposal = await setupProposal("UNDER_ACCOUNTING_REVIEW", "TC-ACCT-02");
    const cookie = await loginStaff(app, ACCOUNTANT_EMAIL, TEST_PASSWORD);

    const response = await app.inject({
      method: "POST", url: `/api/proposals/${proposal.id}/workflow/accounting-return-to-budget`, headers: { cookie },
      payload: { comment: "Budget figures inconsistent." },
    });

    expect(response.statusCode).toBe(200);
    expect((response.json() as { status: string }).status).toBe("RETURNED_BY_ACCOUNTING");

    const historyRow = await db.proposalWorkflowHistory.findFirst({
      where: { proposalId: proposal.id, workflowAction: "ACCOUNTING_RETURN_BUDGET" },
    });
    expect(historyRow).not.toBeNull();

    const notification = await db.notification.findFirst({
      where: { recipientUserId: budgetId, proposalId: proposal.id, eventType: "PROPOSAL_RETURNED_BY_ACCOUNTING" },
    });
    expect(notification).not.toBeNull();

    const focalNotification = await db.notification.findFirst({
      where: { recipientUserId: focalId, proposalId: proposal.id, eventType: "PROPOSAL_RETURNED_BY_ACCOUNTING" },
    });
    expect(focalNotification).toBeNull();
  });

  it("TC-ACCT-03: Accountant returns directly to Focal → 200, status RETURNED_BY_ACCOUNTING, distinct action code, Focal notified (not Budget)", async () => {
    const proposal = await setupProposal("UNDER_ACCOUNTING_REVIEW", "TC-ACCT-03");
    const cookie = await loginStaff(app, ACCOUNTANT_EMAIL, TEST_PASSWORD);

    const response = await app.inject({
      method: "POST", url: `/api/proposals/${proposal.id}/workflow/accounting-return-to-focal`, headers: { cookie },
      payload: { comment: "Skip Budget — proposal must be revised at the source." },
    });

    expect(response.statusCode).toBe(200);
    expect((response.json() as { status: string }).status).toBe("RETURNED_BY_ACCOUNTING");

    const historyRow = await db.proposalWorkflowHistory.findFirst({
      where: { proposalId: proposal.id, workflowAction: "ACCOUNTING_RETURN_FOCAL" },
    });
    expect(historyRow).not.toBeNull();

    const focalNotification = await db.notification.findFirst({
      where: { recipientUserId: focalId, proposalId: proposal.id, eventType: "PROPOSAL_RETURNED_BY_ACCOUNTING_TO_FOCAL" },
    });
    expect(focalNotification).not.toBeNull();

    const budgetNotification = await db.notification.findFirst({
      where: { recipientUserId: budgetId, proposalId: proposal.id, eventType: "PROPOSAL_RETURNED_BY_ACCOUNTING_TO_FOCAL" },
    });
    expect(budgetNotification).toBeNull();
  });

  it("TC-ACCT-04: Accountant endorses to RD → 200, status ENDORSED_TO_RD, RD notified (role-based, no assignment needed)", async () => {
    const proposal = await setupProposal("UNDER_ACCOUNTING_REVIEW", "TC-ACCT-04");
    const cookie = await loginStaff(app, ACCOUNTANT_EMAIL, TEST_PASSWORD);

    const response = await app.inject({
      method: "POST", url: `/api/proposals/${proposal.id}/workflow/accounting-endorse-to-rd`, headers: { cookie },
    });

    expect(response.statusCode).toBe(200);
    expect((response.json() as { status: string }).status).toBe("ENDORSED_TO_RD");

    const notification = await db.notification.findFirst({
      where: { recipientUserId: rdId, proposalId: proposal.id, eventType: "PROPOSAL_ENDORSED_TO_RD" },
    });
    expect(notification).not.toBeNull();
  });

  it("TC-ACCT-05: non-ACCOUNTANT (Budget Officer) user → 403", async () => {
    const proposal = await setupProposal("ENDORSED_TO_ACCOUNTING", "TC-ACCT-05");
    const cookie = await loginStaff(app, BUDGET_EMAIL, TEST_PASSWORD);

    const response = await app.inject({
      method: "POST", url: `/api/proposals/${proposal.id}/workflow/accounting-open`, headers: { cookie },
    });

    expect(response.statusCode).toBe(403);
  });
});
