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

let ipCounter = 5000;
function nextIp() {
  ipCounter += 1;
  return `10.0.9.${ipCounter % 250}`;
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
    { fromStatus: "RETURNED_TO_FOCAL_BY_RTEC", toStatus: "ENDORSED_TO_RTEC", actionCode: "RETURN_TO_RTEC", actorRole: "PROJECT_FOCAL" },
    { fromStatus: "RETURNED_TO_FOCAL_BY_RTEC", toStatus: "ENDORSED_TO_BUDGET", actionCode: "ENDORSE_TO_BUDGET", actorRole: "PROJECT_FOCAL" },
    { fromStatus: "RETURNED_TO_FOCAL_BY_RTEC", toStatus: "FOR_APPLICANT_REVISION_AFTER_RTEC", actionCode: "RETURN_TO_APPLICANT", actorRole: "PROJECT_FOCAL" },
    { fromStatus: "ENDORSED_TO_RTEC", toStatus: "UNDER_RTEC_REVIEW", actionCode: "CONFIRM_RTEC_ASSIGNMENT", actorRole: "SYSTEM" },
    { fromStatus: "UNDER_RTEC_REVIEW", toStatus: "RTEC_MEMBER_REVIEWS_COMPLETE", actionCode: "RTEC_REVIEWS_COMPLETE", actorRole: "SYSTEM" },
    { fromStatus: "RTEC_MEMBER_REVIEWS_COMPLETE", toStatus: "UNDER_RTEC_HEAD_CONSOLIDATION", actionCode: "RTEC_BEGIN_CONSOLIDATION", actorRole: "RTEC_HEAD" },
    { fromStatus: "UNDER_RTEC_HEAD_CONSOLIDATION", toStatus: "RETURNED_TO_FOCAL_BY_RTEC", actionCode: "RTEC_SUBMIT_RECOMMENDATION", actorRole: "RTEC_HEAD" },
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
      await db.workflowTransition.create({ data: { workflowDefinitionId: wf.id, ...t } });
    }
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

async function createProposalWithStatus(
  applicantUserId: string,
  proposalTypeId: string,
  status: string,
  title: string,
) {
  const formVersion = await db.formTemplateVersion.findFirst({ where: { isCurrent: true } });
  if (!formVersion) throw new Error("No current form template version found");

  const proposal = await db.proposal.create({
    data: { applicantUserId, proposalTypeId, title, status },
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

const MEMBER1_EMAIL = "rtec-t-member1@test.local";
const MEMBER2_EMAIL = "rtec-t-member2@test.local";
const MEMBER3_EMAIL = "rtec-t-member3@test.local";
const HEAD_EMAIL = "rtec-t-head1@test.local";
const OTHER_HEAD_EMAIL = "rtec-t-head2@test.local";
const FOCAL_EMAIL = "rtec-t-focal@test.local";
const APPLICANT_EMAIL = "rtec-t-applicant@test.local";
const TEST_PASSWORD = "RtecTestPassw0rd!";
const TEST_EMAILS = [MEMBER1_EMAIL, MEMBER2_EMAIL, MEMBER3_EMAIL, HEAD_EMAIL, OTHER_HEAD_EMAIL, FOCAL_EMAIL, APPLICANT_EMAIL];

const TEST_PROPOSAL_TYPE_CODE = "PT-RTEC-TEST-01";
const TEST_OFFICE_CODE = "OFFICE-RTEC-TEST-01";
const TEST_PROGRAM_CODE = "PROG-RTEC-TEST-01";
const TEST_FORM_CODE = "FT-RTEC-TEST-01";
const TEST_GROUP_NAME = "RTEC Test Committee";
const OTHER_GROUP_NAME = "RTEC Other Test Committee";

async function cleanupTestData() {
  const users = await db.user.findMany({ where: { email: { in: TEST_EMAILS } } });
  const userIds = users.map((u) => u.id);

  const groups = await db.rtecGroup.findMany({ where: { name: { in: [TEST_GROUP_NAME, OTHER_GROUP_NAME] } } });
  const groupIds = groups.map((g) => g.id);

  const proposalType = await db.proposalType.findUnique({ where: { code: TEST_PROPOSAL_TYPE_CODE } });

  if (proposalType) {
    const proposals = await db.proposal.findMany({ where: { proposalTypeId: proposalType.id } });
    const proposalIds = proposals.map((p) => p.id);

    if (proposalIds.length > 0) {
      await db.rtecReviewItem.deleteMany({
        where: { rtecReview: { proposalId: { in: proposalIds } } },
      });
      await db.rtecReview.deleteMany({ where: { proposalId: { in: proposalIds } } });
      await db.rtecConsolidation.deleteMany({ where: { proposalId: { in: proposalIds } } });
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

  if (groupIds.length > 0) {
    await db.rtecMembership.deleteMany({ where: { rtecGroupId: { in: groupIds } } });
    await db.rtecGroup.deleteMany({ where: { id: { in: groupIds } } });
  }

  const formTemplate = await db.formTemplate.findUnique({ where: { formCode: TEST_FORM_CODE } });
  if (formTemplate) {
    const versions = await db.formTemplateVersion.findMany({ where: { formTemplateId: formTemplate.id } });
    const versionIds = versions.map((v) => v.id);
    if (versionIds.length > 0) {
      const sections = await db.formSection.findMany({ where: { formTemplateVersionId: { in: versionIds } } });
      const sectionIds = sections.map((s) => s.id);
      if (sectionIds.length > 0) {
        await db.rtecReviewItem.deleteMany({ where: { formSectionId: { in: sectionIds } } });
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
    await db.rtecMembership.deleteMany({ where: { userId: { in: userIds } } });
    await db.userRole.deleteMany({ where: { userId: { in: userIds } } });
    await db.staffProfile.deleteMany({ where: { userId: { in: userIds } } });
    await db.applicantProfile.deleteMany({ where: { userId: { in: userIds } } });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
  }
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe("RTEC routes (Phase 11)", () => {
  let app: FastifyInstance;
  let member1Id: string;
  let member2Id: string;
  let member3Id: string;
  let headId: string;
  let otherHeadId: string;
  let focalId: string;
  let applicantId: string;
  let proposalTypeId: string;
  let rtecGroupId: string;
  let otherGroupId: string;

  beforeAll(async () => {
    await ensureRolesSeeded();
    await cleanupTestData();
    await ensureWorkflowTransitions();
    app = await buildApp();
    await app.ready();

    const office = await db.office.create({ data: { code: TEST_OFFICE_CODE, name: "Test Office (RTEC)" } });
    const program = await db.program.create({
      data: { code: TEST_PROGRAM_CODE, name: "Test Program (RTEC)", officeId: office.id },
    });
    const formTemplate = await db.formTemplate.create({
      data: { formCode: TEST_FORM_CODE, title: "Test RTEC Form", isActive: true },
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
        sectionCode: "RTEC-S1",
        title: "Details",
        displayOrder: 1,
        isRepeating: false,
        isRequired: true,
      },
    });
    await db.formField.create({
      data: {
        formSectionId: section.id,
        fieldCode: "RTEC-F1",
        label: "Title",
        inputType: "TEXT",
        isRequired: true,
        displayOrder: 1,
      },
    });
    const proposalType = await db.proposalType.create({
      data: {
        code: TEST_PROPOSAL_TYPE_CODE,
        name: "Test RTEC Grant",
        programId: program.id,
        defaultFormTemplateId: formTemplate.id,
        isActive: true,
      },
    });
    proposalTypeId = proposalType.id;

    const member1 = await createStaffUser(MEMBER1_EMAIL, TEST_PASSWORD, "RTEC_MEMBER");
    member1Id = member1.id;
    const member2 = await createStaffUser(MEMBER2_EMAIL, TEST_PASSWORD, "RTEC_MEMBER");
    member2Id = member2.id;
    const member3 = await createStaffUser(MEMBER3_EMAIL, TEST_PASSWORD, "RTEC_MEMBER");
    member3Id = member3.id;
    const head = await createStaffUser(HEAD_EMAIL, TEST_PASSWORD, "RTEC_HEAD");
    headId = head.id;
    const otherHead = await createStaffUser(OTHER_HEAD_EMAIL, TEST_PASSWORD, "RTEC_HEAD");
    otherHeadId = otherHead.id;
    const focal = await createStaffUser(FOCAL_EMAIL, TEST_PASSWORD, "PROJECT_FOCAL");
    focalId = focal.id;
    const applicant = await createApplicantUser(APPLICANT_EMAIL);
    applicantId = applicant.id;

    const group = await db.rtecGroup.create({ data: { name: TEST_GROUP_NAME, isActive: true } });
    rtecGroupId = group.id;
    const otherGroup = await db.rtecGroup.create({ data: { name: OTHER_GROUP_NAME, isActive: true } });
    otherGroupId = otherGroup.id;

    await db.rtecMembership.createMany({
      data: [
        { rtecGroupId, userId: member1Id, roleInGroup: "MEMBER", assignedBy: member1Id },
        { rtecGroupId, userId: member2Id, roleInGroup: "MEMBER", assignedBy: member2Id },
        { rtecGroupId, userId: member3Id, roleInGroup: "MEMBER", assignedBy: member3Id },
        { rtecGroupId, userId: headId, roleInGroup: "HEAD", assignedBy: headId },
        { rtecGroupId: otherGroupId, userId: otherHeadId, roleInGroup: "HEAD", assignedBy: otherHeadId },
      ],
    });
  });

  afterAll(async () => {
    await app.close();
    await cleanupTestData();
    await db.$disconnect();
  });

  async function setupProposalUnderReview(title: string) {
    const { proposal } = await createProposalWithStatus(applicantId, proposalTypeId, "UNDER_RTEC_REVIEW", title);
    await assignRole(proposal.id, member1Id, "RTEC_MEMBER");
    await assignRole(proposal.id, member2Id, "RTEC_MEMBER");
    await assignRole(proposal.id, member3Id, "RTEC_MEMBER");
    await assignRole(proposal.id, headId, "RTEC_HEAD");
    await assignRole(proposal.id, focalId, "PROJECT_FOCAL");
    return proposal;
  }

  // ── TC-RTEC-01 ─────────────────────────────────────────────────────────────
  it("TC-RTEC-01: RTEC Member creates a review from UNDER_RTEC_REVIEW → 200, review row created", async () => {
    const proposal = await setupProposalUnderReview("TC-RTEC-01 Proposal");
    const cookie = await loginStaff(app, MEMBER1_EMAIL, TEST_PASSWORD);

    const response = await app.inject({
      method: "POST",
      url: `/api/proposals/${proposal.id}/rtec/reviews`,
      headers: { cookie },
      payload: { rtecGroupId, overallRemarks: "Looks solid overall." },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { review: { id: string; status: string; isSubmitted: boolean } };
    expect(body.review.status).toBe("DRAFT");
    expect(body.review.isSubmitted).toBe(false);

    const row = await db.rtecReview.findFirst({ where: { proposalId: proposal.id, reviewerUserId: member1Id } });
    expect(row).not.toBeNull();
  });

  // ── TC-RTEC-02 ─────────────────────────────────────────────────────────────
  it("TC-RTEC-02: non-RTEC-Member (Focal) attempting to create a review → 403", async () => {
    const proposal = await setupProposalUnderReview("TC-RTEC-02 Proposal");
    const cookie = await loginStaff(app, FOCAL_EMAIL, TEST_PASSWORD);

    const response = await app.inject({
      method: "POST",
      url: `/api/proposals/${proposal.id}/rtec/reviews`,
      headers: { cookie },
      payload: { rtecGroupId, overallRemarks: "Should not be allowed." },
    });

    expect(response.statusCode).toBe(403);
  });

  // ── TC-RTEC-03 ─────────────────────────────────────────────────────────────
  it("TC-RTEC-03: RTEC Member role but not assigned to this proposal → 403", async () => {
    const proposal = await createProposalWithStatus(
      applicantId,
      proposalTypeId,
      "UNDER_RTEC_REVIEW",
      "TC-RTEC-03 Proposal",
    ).then((r) => r.proposal);
    // deliberately no assignRole() call for member1 on this proposal

    const cookie = await loginStaff(app, MEMBER1_EMAIL, TEST_PASSWORD);
    const response = await app.inject({
      method: "POST",
      url: `/api/proposals/${proposal.id}/rtec/reviews`,
      headers: { cookie },
      payload: { rtecGroupId, overallRemarks: "Not assigned here." },
    });

    expect(response.statusCode).toBe(403);
  });

  // ── TC-RTEC-04 ─────────────────────────────────────────────────────────────
  it("TC-RTEC-04: quorum-gated auto-transition — advances only once all active members submit", async () => {
    const proposal = await setupProposalUnderReview("TC-RTEC-04 Proposal");

    for (const email of [MEMBER1_EMAIL, MEMBER2_EMAIL, MEMBER3_EMAIL]) {
      const cookie = await loginStaff(app, email, TEST_PASSWORD);
      await app.inject({
        method: "POST",
        url: `/api/proposals/${proposal.id}/rtec/reviews`,
        headers: { cookie },
        payload: { rtecGroupId, overallRemarks: `Review by ${email}` },
      });
    }

    // Submit member1 and member2 only — quorum not yet met
    for (const email of [MEMBER1_EMAIL, MEMBER2_EMAIL]) {
      const cookie = await loginStaff(app, email, TEST_PASSWORD);
      const resp = await app.inject({
        method: "POST",
        url: `/api/proposals/${proposal.id}/rtec/reviews/submit`,
        headers: { cookie },
      });
      expect(resp.statusCode).toBe(200);
    }

    let current = await db.proposal.findUniqueOrThrow({ where: { id: proposal.id } });
    expect(current.status).toBe("UNDER_RTEC_REVIEW");

    // Submit member3 — quorum now met, should auto-advance
    const cookie3 = await loginStaff(app, MEMBER3_EMAIL, TEST_PASSWORD);
    const resp3 = await app.inject({
      method: "POST",
      url: `/api/proposals/${proposal.id}/rtec/reviews/submit`,
      headers: { cookie: cookie3 },
    });
    expect(resp3.statusCode).toBe(200);

    current = await db.proposal.findUniqueOrThrow({ where: { id: proposal.id } });
    expect(current.status).toBe("RTEC_MEMBER_REVIEWS_COMPLETE");
  });

  // ── TC-RTEC-05 ─────────────────────────────────────────────────────────────
  it("TC-RTEC-05: RTEC Head begins consolidation from RTEC_MEMBER_REVIEWS_COMPLETE → 200, history row written", async () => {
    const proposal = await setupProposalUnderReview("TC-RTEC-05 Proposal");
    await db.proposal.update({ where: { id: proposal.id }, data: { status: "RTEC_MEMBER_REVIEWS_COMPLETE" } });

    const cookie = await loginStaff(app, HEAD_EMAIL, TEST_PASSWORD);
    const response = await app.inject({
      method: "POST",
      url: `/api/proposals/${proposal.id}/workflow/rtec-begin-consolidation`,
      headers: { cookie },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { status: string };
    expect(body.status).toBe("UNDER_RTEC_HEAD_CONSOLIDATION");

    const historyRow = await db.proposalWorkflowHistory.findFirst({
      where: { proposalId: proposal.id, workflowAction: "RTEC_BEGIN_CONSOLIDATION" },
    });
    expect(historyRow).not.toBeNull();
  });

  // ── TC-RTEC-06 ─────────────────────────────────────────────────────────────
  it("TC-RTEC-06: RTEC Head submits consolidated recommendation → 200, status RETURNED_TO_FOCAL_BY_RTEC, Focal notified", async () => {
    const proposal = await setupProposalUnderReview("TC-RTEC-06 Proposal");
    await db.proposal.update({ where: { id: proposal.id }, data: { status: "UNDER_RTEC_HEAD_CONSOLIDATION" } });

    const cookie = await loginStaff(app, HEAD_EMAIL, TEST_PASSWORD);

    const draftResp = await app.inject({
      method: "POST",
      url: `/api/proposals/${proposal.id}/rtec/consolidation`,
      headers: { cookie },
      payload: { rtecGroupId, recommendation: "FOR_APPROVAL", consolidatedRemarks: "Committee recommends approval." },
    });
    expect(draftResp.statusCode).toBe(200);

    const submitResp = await app.inject({
      method: "POST",
      url: `/api/proposals/${proposal.id}/workflow/rtec-submit-recommendation`,
      headers: { cookie },
    });
    expect(submitResp.statusCode).toBe(200);
    const body = submitResp.json() as { status: string };
    expect(body.status).toBe("RETURNED_TO_FOCAL_BY_RTEC");

    const notification = await db.notification.findFirst({
      where: { recipientUserId: focalId, proposalId: proposal.id, eventType: "RTEC_RECOMMENDATION_SUBMITTED" },
    });
    expect(notification).not.toBeNull();
  });

  // ── TC-RTEC-07 ─────────────────────────────────────────────────────────────
  it("TC-RTEC-07: invalid transition — begin-consolidation before quorum met → 422 INVALID_TRANSITION", async () => {
    const proposal = await setupProposalUnderReview("TC-RTEC-07 Proposal");
    // proposal.status is UNDER_RTEC_REVIEW — no member has submitted yet

    const cookie = await loginStaff(app, HEAD_EMAIL, TEST_PASSWORD);
    const response = await app.inject({
      method: "POST",
      url: `/api/proposals/${proposal.id}/workflow/rtec-begin-consolidation`,
      headers: { cookie },
    });

    expect(response.statusCode).toBe(422);
    const body = response.json() as { code: string };
    expect(body.code).toBe("INVALID_TRANSITION");
  });

  // ── TC-RTEC-08 ─────────────────────────────────────────────────────────────
  it("TC-RTEC-08: concurrent transition simulation → 409 CONCURRENT_TRANSITION", async () => {
    const proposal = await setupProposalUnderReview("TC-RTEC-08 Proposal");
    await db.proposal.update({ where: { id: proposal.id }, data: { status: "UNDER_RTEC_HEAD_CONSOLIDATION" } });

    const cookie = await loginStaff(app, HEAD_EMAIL, TEST_PASSWORD);
    const response = await app.inject({
      method: "POST",
      url: `/api/proposals/${proposal.id}/workflow/rtec-begin-consolidation`,
      headers: { cookie },
    });

    expect(response.statusCode).toBe(409);
    const body = response.json() as { code: string };
    expect(body.code).toBe("CONCURRENT_TRANSITION");
  });

  // ── TC-RTEC-09 ─────────────────────────────────────────────────────────────
  it("TC-RTEC-09: visibility — RTEC_HEAD sees all member reviews; RTEC_MEMBER sees only own via /mine", async () => {
    const proposal = await setupProposalUnderReview("TC-RTEC-09 Proposal");

    for (const email of [MEMBER1_EMAIL, MEMBER2_EMAIL]) {
      const cookie = await loginStaff(app, email, TEST_PASSWORD);
      await app.inject({
        method: "POST",
        url: `/api/proposals/${proposal.id}/rtec/reviews`,
        headers: { cookie },
        payload: { rtecGroupId, overallRemarks: `Review by ${email}` },
      });
    }

    const headCookie = await loginStaff(app, HEAD_EMAIL, TEST_PASSWORD);
    const headResp = await app.inject({
      method: "GET",
      url: `/api/proposals/${proposal.id}/rtec/reviews`,
      headers: { cookie: headCookie },
    });
    expect(headResp.statusCode).toBe(200);
    const headBody = headResp.json() as { reviews: Array<{ reviewerUserId: string }> };
    const reviewerIds = headBody.reviews.map((r) => r.reviewerUserId);
    expect(reviewerIds).toContain(member1Id);
    expect(reviewerIds).toContain(member2Id);

    // Member's list-all endpoint is forbidden
    const member1Cookie = await loginStaff(app, MEMBER1_EMAIL, TEST_PASSWORD);
    const forbiddenResp = await app.inject({
      method: "GET",
      url: `/api/proposals/${proposal.id}/rtec/reviews`,
      headers: { cookie: member1Cookie },
    });
    expect(forbiddenResp.statusCode).toBe(403);

    // Member sees only their own via /mine
    const mineResp = await app.inject({
      method: "GET",
      url: `/api/proposals/${proposal.id}/rtec/reviews/mine`,
      headers: { cookie: member1Cookie },
    });
    expect(mineResp.statusCode).toBe(200);
    const mineBody = mineResp.json() as { review: { reviewerUserId: string } };
    expect(mineBody.review.reviewerUserId).toBe(member1Id);
  });

  // ── TC-RTEC-10 ─────────────────────────────────────────────────────────────
  it("TC-RTEC-10: audit log row written after review submit", async () => {
    const proposal = await setupProposalUnderReview("TC-RTEC-10 Proposal");
    const cookie = await loginStaff(app, MEMBER1_EMAIL, TEST_PASSWORD);

    await app.inject({
      method: "POST",
      url: `/api/proposals/${proposal.id}/rtec/reviews`,
      headers: { cookie },
      payload: { rtecGroupId, overallRemarks: "Ready to submit." },
    });

    const submitResp = await app.inject({
      method: "POST",
      url: `/api/proposals/${proposal.id}/rtec/reviews/submit`,
      headers: { cookie },
    });
    expect(submitResp.statusCode).toBe(200);

    const auditRow = await db.auditLog.findFirst({
      where: { actorUserId: member1Id, action: "RTEC_REVIEW_SUBMIT", entityType: "rtec_reviews" },
    });
    expect(auditRow).not.toBeNull();
  });

  // ── Reopen flow ───────────────────────────────────────────────────────────
  it("TC-RTEC-11: RTEC Head reopens a submitted review; original member can then re-edit", async () => {
    const proposal = await setupProposalUnderReview("TC-RTEC-11 Proposal");
    const memberCookie = await loginStaff(app, MEMBER1_EMAIL, TEST_PASSWORD);

    await app.inject({
      method: "POST",
      url: `/api/proposals/${proposal.id}/rtec/reviews`,
      headers: { cookie: memberCookie },
      payload: { rtecGroupId, overallRemarks: "Initial submission." },
    });
    await app.inject({
      method: "POST",
      url: `/api/proposals/${proposal.id}/rtec/reviews/submit`,
      headers: { cookie: memberCookie },
    });

    const review = await db.rtecReview.findFirstOrThrow({
      where: { proposalId: proposal.id, reviewerUserId: member1Id },
    });
    expect(review.isSubmitted).toBe(true);

    const headCookie = await loginStaff(app, HEAD_EMAIL, TEST_PASSWORD);
    const reopenResp = await app.inject({
      method: "POST",
      url: `/api/proposals/${proposal.id}/rtec/reviews/${review.id}/reopen`,
      headers: { cookie: headCookie },
      payload: { reason: "Please clarify budget section." },
    });
    expect(reopenResp.statusCode).toBe(200);

    const reopened = await db.rtecReview.findUniqueOrThrow({ where: { id: review.id } });
    expect(reopened.isSubmitted).toBe(false);

    // Member can now edit again
    const editResp = await app.inject({
      method: "POST",
      url: `/api/proposals/${proposal.id}/rtec/reviews`,
      headers: { cookie: memberCookie },
      payload: { rtecGroupId, overallRemarks: "Clarified per Head's request." },
    });
    expect(editResp.statusCode).toBe(200);
  });

  // ── Head-cannot-consolidate-as-member RBAC check ─────────────────────────
  it("TC-RTEC-12: RTEC Head of a different group cannot begin consolidation for this proposal → 403", async () => {
    const proposal = await setupProposalUnderReview("TC-RTEC-12 Proposal");
    await db.proposal.update({ where: { id: proposal.id }, data: { status: "RTEC_MEMBER_REVIEWS_COMPLETE" } });

    const cookie = await loginStaff(app, OTHER_HEAD_EMAIL, TEST_PASSWORD);
    const response = await app.inject({
      method: "POST",
      url: `/api/proposals/${proposal.id}/workflow/rtec-begin-consolidation`,
      headers: { cookie },
    });

    expect(response.statusCode).toBe(403);
  });
});
