import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const ROLES: Array<{ code: string; name: string; description: string }> = [
  { code: "APPLICANT", name: "Applicant", description: "External grant applicant" },
  { code: "ADMIN", name: "System Administrator", description: "Manages users, roles, and system configuration" },
  { code: "PROJECT_FOCAL", name: "Project Focal", description: "First-line internal reviewer for assigned proposals" },
  { code: "RTEC_MEMBER", name: "RTEC Member", description: "Reviews assigned proposals for a committee" },
  { code: "RTEC_HEAD", name: "RTEC Head", description: "Consolidates RTEC member reviews" },
  { code: "BUDGET_OFFICER", name: "Budget Officer", description: "Reviews budget line items" },
  { code: "ACCOUNTANT", name: "Accountant", description: "Reviews accounting classifications" },
  { code: "REGIONAL_DIRECTOR", name: "Regional Director", description: "Issues final approval decisions" },
];

// Dev-only known credentials. NEVER use these accounts or passwords outside a
// local development database.
const DEV_PASSWORD = "DevTestPassw0rd!123";
const DEV_ADMIN_EMAIL = "admin@dev.local";
const DEV_ADMIN_PASSWORD = "DevAdminPassw0rd!123";

const DEV_USERS: Array<{
  email: string;
  firstName: string;
  lastName: string;
  roleCode: string;
  kind: "staff" | "applicant";
}> = [
  { email: DEV_ADMIN_EMAIL, firstName: "Dev", lastName: "Admin", roleCode: "ADMIN", kind: "staff" },
  { email: "applicant@dev.local", firstName: "Dev", lastName: "Applicant", roleCode: "APPLICANT", kind: "applicant" },
  { email: "focal@dev.local", firstName: "Dev", lastName: "Focal", roleCode: "PROJECT_FOCAL", kind: "staff" },
  { email: "rtec.member@dev.local", firstName: "Dev", lastName: "RtecMember", roleCode: "RTEC_MEMBER", kind: "staff" },
  { email: "rtec.head@dev.local", firstName: "Dev", lastName: "RtecHead", roleCode: "RTEC_HEAD", kind: "staff" },
  { email: "budget@dev.local", firstName: "Dev", lastName: "Budget", roleCode: "BUDGET_OFFICER", kind: "staff" },
  { email: "accountant@dev.local", firstName: "Dev", lastName: "Accountant", roleCode: "ACCOUNTANT", kind: "staff" },
  { email: "rd@dev.local", firstName: "Dev", lastName: "Director", roleCode: "REGIONAL_DIRECTOR", kind: "staff" },
];

async function seedDevUser(
  def: (typeof DEV_USERS)[number],
  password: string,
) {
  const role = await prisma.role.findUniqueOrThrow({ where: { code: def.roleCode } });
  const passwordHash = await bcrypt.hash(password, 12);

  const user = await prisma.user.upsert({
    where: { email: def.email },
    update: {
      firstName: def.firstName,
      lastName: def.lastName,
      isActive: true,
      mustChangePassword: false,
    },
    create: {
      email: def.email,
      passwordHash,
      firstName: def.firstName,
      lastName: def.lastName,
      isActive: true,
      mustChangePassword: false,
    },
  });

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId: role.id } },
    update: {},
    create: { userId: user.id, roleId: role.id },
  });

  if (def.kind === "applicant") {
    await prisma.applicantProfile.upsert({
      where: { userId: user.id },
      update: {
        institution: "Dev Test University",
        positionTitle: "Researcher",
        contactNumber: "+63-900-000-0001",
        privacyConsentGiven: true,
        privacyConsentAt: new Date(),
      },
      create: {
        userId: user.id,
        institution: "Dev Test University",
        positionTitle: "Researcher",
        contactNumber: "+63-900-000-0001",
        privacyConsentGiven: true,
        privacyConsentAt: new Date(),
      },
    });
  } else {
    await prisma.staffProfile.upsert({
      where: { userId: user.id },
      update: { positionTitle: `${def.roleCode.replaceAll("_", " ")} (Dev)` },
      create: { userId: user.id, positionTitle: `${def.roleCode.replaceAll("_", " ")} (Dev)` },
    });
  }

  return user;
}

async function main() {
  for (const role of ROLES) {
    await prisma.role.upsert({
      where: { code: role.code },
      update: { name: role.name, description: role.description, isActive: true },
      create: { ...role, isActive: true },
    });
  }

  for (const def of DEV_USERS) {
    const password =
      def.email === DEV_ADMIN_EMAIL ? DEV_ADMIN_PASSWORD : DEV_PASSWORD;
    await seedDevUser(def, password);
  }

  const adminUser = await prisma.user.findUniqueOrThrow({
    where: { email: DEV_ADMIN_EMAIL },
  });

  console.log("Seeded 8 role codes.");
  console.log(
    `Seeded ${DEV_USERS.length} dev test users (@dev.local) — see docs/deployment/DEV-TEST-ACCOUNTS.md`,
  );
  console.log(
    `  Admin: ${DEV_ADMIN_EMAIL} / ${DEV_ADMIN_PASSWORD}`,
  );
  console.log(`  Other roles: *@dev.local / ${DEV_PASSWORD}`);

  // ── Phase 8: Office, Programs, Form Templates, Proposal Types ────────────────

  // 1. Office
  const office = await prisma.office.upsert({
    where: { code: "DOST-RO2" },
    update: {},
    create: { name: "DOST Regional Office 02", code: "DOST-RO2", isActive: true },
  });

  // 2. Three programs
  const programDefs = [
    { code: "GIA", name: "Grants-in-Aid" },
    { code: "CEST", name: "Community Empowerment Through Science and Technology" },
    { code: "SSCP", name: "Small Scholarship and Capability Program" },
  ];

  const seededPrograms: Record<string, { id: string }> = {};
  for (const def of programDefs) {
    const program = await prisma.program.upsert({
      where: { code: def.code },
      update: {},
      create: { code: def.code, name: def.name, officeId: office.id, isActive: true },
    });
    seededPrograms[def.code] = program;
  }

  // 3. For each program: FormTemplate + FormTemplateVersion + 2 sections + 4 fields + ProposalType
  const formDefs = [
    {
      programCode: "GIA",
      formCode: "GIA-FORM-001",
      title: "GIA Proposal Form",
      ptCode: "GIA-PROPOSAL",
      ptName: "GIA Research Proposal",
    },
    {
      programCode: "CEST",
      formCode: "CEST-FORM-001",
      title: "CEST Proposal Form",
      ptCode: "CEST-PROPOSAL",
      ptName: "CEST Research Proposal",
    },
    {
      programCode: "SSCP",
      formCode: "SSCP-FORM-001",
      title: "SSCP Proposal Form",
      ptCode: "SSCP-PROPOSAL",
      ptName: "SSCP Research Proposal",
    },
  ];

  // FORM-001 (DOST-GIA Form 1 — Program Concept Proposal) applies to GIA, CEST,
  // and SSCP per docs/forms/FORM-INVENTORY.md ("Program mapping: GIA, CEST, and
  // SSCP generally use the same forms"). Each program gets its own FormTemplate /
  // FormTemplateVersion / FormSection / FormField rows, all built from this shape.
  async function buildForm001Sections(formTemplateVersionId: string, programCode: string) {
    const section1 = await prisma.formSection.create({
      data: {
        formTemplateVersionId,
        sectionCode: `${programCode}-S1`,
        title: "Concept Program Proposal Summary Information",
        displayOrder: 1,
        isRepeating: false,
        isRequired: true,
      },
    });
    await prisma.formField.createMany({
      data: [
        {
          formSectionId: section1.id,
          fieldCode: `${programCode}-F1`,
          label: "Program Title",
          inputType: "TEXT",
          isRequired: true,
          validationRules: JSON.stringify({ maxLength: 300 }),
          displayOrder: 1,
        },
        {
          formSectionId: section1.id,
          fieldCode: `${programCode}-F2`,
          label: "Program Duration (months)",
          inputType: "NUMBER",
          isRequired: true,
          validationRules: JSON.stringify({ min: 1 }),
          displayOrder: 2,
        },
        {
          formSectionId: section1.id,
          fieldCode: `${programCode}-F3`,
          label: "Estimated Budgetary Requirement",
          inputType: "CURRENCY",
          isRequired: true,
          validationRules: JSON.stringify({ min: 0, currency: "PHP" }),
          displayOrder: 3,
        },
        {
          formSectionId: section1.id,
          fieldCode: `${programCode}-F4`,
          label: "Principal Question to be Addressed",
          inputType: "TEXTAREA",
          isRequired: true,
          validationRules: JSON.stringify({ maxWords: 100 }),
          displayOrder: 4,
        },
        {
          formSectionId: section1.id,
          fieldCode: `${programCode}-F5`,
          label: "Program Leader",
          inputType: "TEXT",
          isRequired: true,
          validationRules: JSON.stringify({ maxLength: 200 }),
          displayOrder: 5,
        },
      ],
    });

    const section2 = await prisma.formSection.create({
      data: {
        formTemplateVersionId,
        sectionCode: `${programCode}-S2`,
        title: "Program Proposal — Component Projects",
        displayOrder: 2,
        isRepeating: true,
        isRequired: true,
      },
    });
    await prisma.formField.create({
      data: {
        formSectionId: section2.id,
        fieldCode: `${programCode}-F6`,
        label: "Component Projects",
        inputType: "TABLE",
        isRequired: true,
        validationRules: JSON.stringify({
          columns: [
            { key: "projectTitle", label: "Title of Component Project" },
            { key: "projectLeader", label: "Project Leader / Designation & Institution" },
            { key: "budgetAmount", label: "Estimated Budgetary Requirement" },
          ],
        }),
        displayOrder: 1,
      },
    });

    const section3 = await prisma.formSection.create({
      data: {
        formTemplateVersionId,
        sectionCode: `${programCode}-S3`,
        title: "Program Summary",
        displayOrder: 3,
        isRepeating: false,
        isRequired: true,
      },
    });
    await prisma.formField.create({
      data: {
        formSectionId: section3.id,
        fieldCode: `${programCode}-F7`,
        label: "Program Summary",
        inputType: "TEXTAREA",
        isRequired: true,
        validationRules: JSON.stringify({ maxWords: 1500 }),
        displayOrder: 1,
      },
    });

    const section4 = await prisma.formSection.create({
      data: {
        formTemplateVersionId,
        sectionCode: `${programCode}-S4`,
        title: "Submitted By (Program Leader)",
        displayOrder: 4,
        isRepeating: false,
        isRequired: true,
      },
    });
    await prisma.formField.createMany({
      data: [
        {
          formSectionId: section4.id,
          fieldCode: `${programCode}-F8`,
          label: "Signature",
          inputType: "FILE",
          isRequired: true,
          displayOrder: 1,
        },
        {
          formSectionId: section4.id,
          fieldCode: `${programCode}-F9`,
          label: "Printed Name",
          inputType: "TEXT",
          isRequired: true,
          validationRules: JSON.stringify({ maxLength: 200 }),
          displayOrder: 2,
        },
        {
          formSectionId: section4.id,
          fieldCode: `${programCode}-F10`,
          label: "Designation / Title",
          inputType: "TEXT",
          isRequired: true,
          validationRules: JSON.stringify({ maxLength: 200 }),
          displayOrder: 3,
        },
        {
          formSectionId: section4.id,
          fieldCode: `${programCode}-F11`,
          label: "Date",
          inputType: "DATE",
          isRequired: true,
          displayOrder: 4,
        },
      ],
    });
  }

  for (const def of formDefs) {
    const program = seededPrograms[def.programCode];

    // FormTemplate
    const formTemplate = await prisma.formTemplate.upsert({
      where: { formCode: def.formCode },
      update: {},
      create: { formCode: def.formCode, title: def.title, isActive: true },
    });

    // Check if a current version already exists
    const existingVersion = await prisma.formTemplateVersion.findFirst({
      where: { formTemplateId: formTemplate.id, isCurrent: true },
      include: { sections: { include: { fields: true } } },
    });

    if (!existingVersion) {
      const formVersion = await prisma.formTemplateVersion.create({
        data: {
          formTemplateId: formTemplate.id,
          versionNumber: 1,
          schemaVersion: "1.0",
          isCurrent: true,
          publishedAt: new Date(),
        },
      });
      await buildForm001Sections(formVersion.id, def.programCode);
    } else if (existingVersion.sections.length < 4) {
      // Old 4-field stub (2 sections) detected — replace in place so the
      // FormTemplateVersion id (and any FK from ProposalVersion) stays valid.
      const staleSectionIds = existingVersion.sections.map((s) => s.id);
      const staleFieldIds = existingVersion.sections.flatMap((s) =>
        s.fields.map((f) => f.id),
      );
      // Clear dependent rows saved against the stub fields/sections (dev draft
      // data from manual QA) before the FK-constrained delete below.
      await prisma.proposalFieldValue.deleteMany({ where: { formFieldId: { in: staleFieldIds } } });
      await prisma.proposalComment.updateMany({
        where: { targetFieldId: { in: staleFieldIds } },
        data: { targetFieldId: null },
      });
      await prisma.proposalComment.updateMany({
        where: { targetSectionId: { in: staleSectionIds } },
        data: { targetSectionId: null },
      });
      await prisma.rtecReviewItem.updateMany({
        where: { formSectionId: { in: staleSectionIds } },
        data: { formSectionId: null },
      });
      await prisma.formField.deleteMany({ where: { formSectionId: { in: staleSectionIds } } });
      await prisma.formSection.deleteMany({ where: { id: { in: staleSectionIds } } });
      await buildForm001Sections(existingVersion.id, def.programCode);
    }
    // else: already migrated to the full FORM-001 shape — idempotent no-op.

    // ProposalType — link to program and formTemplate
    await prisma.proposalType.upsert({
      where: { code: def.ptCode },
      update: {},
      create: {
        code: def.ptCode,
        name: def.ptName,
        programId: program.id,
        defaultFormTemplateId: formTemplate.id,
        isActive: true,
      },
    });
  }

  console.log("Phase 8 seed: Office, Programs, Form Templates, and Proposal Types upserted.");

  // ── Phase 10: Workflow definitions ────────────────────────────────────────────
  const proposalWorkflow = await prisma.workflowDefinition.upsert({
    where: { code: "PROPOSAL_LIFECYCLE" },
    update: {},
    create: {
      code: "PROPOSAL_LIFECYCLE",
      name: "Proposal Approval Lifecycle",
      isActive: true,
    },
  });

  const focalTransitions = [
    { fromStatus: "SUBMITTED_TO_FOCAL", toStatus: "UNDER_FOCAL_REVIEW", actionCode: "ACKNOWLEDGE", actorRole: "PROJECT_FOCAL" },
    { fromStatus: "RESUBMITTED_TO_FOCAL", toStatus: "UNDER_FOCAL_REVIEW", actionCode: "ACKNOWLEDGE", actorRole: "PROJECT_FOCAL" },
    { fromStatus: "UNDER_FOCAL_REVIEW", toStatus: "RETURNED_TO_APPLICANT", actionCode: "RETURN_TO_APPLICANT", actorRole: "PROJECT_FOCAL" },
    { fromStatus: "UNDER_FOCAL_REVIEW", toStatus: "ENDORSED_TO_RTEC", actionCode: "ENDORSE_TO_RTEC", actorRole: "PROJECT_FOCAL" },
    { fromStatus: "RETURNED_TO_FOCAL_BY_RTEC", toStatus: "ENDORSED_TO_RTEC", actionCode: "RETURN_TO_RTEC", actorRole: "PROJECT_FOCAL" },
    { fromStatus: "RETURNED_TO_FOCAL_BY_RTEC", toStatus: "ENDORSED_TO_BUDGET", actionCode: "ENDORSE_TO_BUDGET", actorRole: "PROJECT_FOCAL" },
  ];

  for (const t of focalTransitions) {
    const existing = await prisma.workflowTransition.findFirst({
      where: {
        actionCode: t.actionCode,
        actorRole: t.actorRole,
        fromStatus: t.fromStatus,
        workflowDefinitionId: proposalWorkflow.id,
      },
    });
    if (!existing) {
      await prisma.workflowTransition.create({
        data: {
          workflowDefinitionId: proposalWorkflow.id,
          fromStatus: t.fromStatus,
          toStatus: t.toStatus,
          actionCode: t.actionCode,
          actorRole: t.actorRole,
        },
      });
    }
  }
  console.log("✓ Phase 10: workflow_definitions and workflow_transitions seeded");

  // ── Phase 11: RTEC workflow transitions ───────────────────────────────────────
  const rtecTransitions = [
    { fromStatus: "ENDORSED_TO_RTEC", toStatus: "UNDER_RTEC_REVIEW", actionCode: "CONFIRM_RTEC_ASSIGNMENT", actorRole: "SYSTEM" },
    { fromStatus: "UNDER_RTEC_REVIEW", toStatus: "RTEC_MEMBER_REVIEWS_COMPLETE", actionCode: "RTEC_REVIEWS_COMPLETE", actorRole: "SYSTEM" },
    { fromStatus: "RTEC_MEMBER_REVIEWS_COMPLETE", toStatus: "UNDER_RTEC_HEAD_CONSOLIDATION", actionCode: "RTEC_BEGIN_CONSOLIDATION", actorRole: "RTEC_HEAD" },
    { fromStatus: "UNDER_RTEC_HEAD_CONSOLIDATION", toStatus: "RETURNED_TO_FOCAL_BY_RTEC", actionCode: "RTEC_SUBMIT_RECOMMENDATION", actorRole: "RTEC_HEAD" },
    { fromStatus: "RETURNED_TO_FOCAL_BY_RTEC", toStatus: "FOR_APPLICANT_REVISION_AFTER_RTEC", actionCode: "RETURN_TO_APPLICANT", actorRole: "PROJECT_FOCAL" },
  ];

  for (const t of rtecTransitions) {
    const existing = await prisma.workflowTransition.findFirst({
      where: {
        actionCode: t.actionCode,
        actorRole: t.actorRole,
        fromStatus: t.fromStatus,
        workflowDefinitionId: proposalWorkflow.id,
      },
    });
    if (!existing) {
      await prisma.workflowTransition.create({
        data: {
          workflowDefinitionId: proposalWorkflow.id,
          fromStatus: t.fromStatus,
          toStatus: t.toStatus,
          actionCode: t.actionCode,
          actorRole: t.actorRole,
        },
      });
    }
  }
  console.log("✓ Phase 11: RTEC workflow_transitions seeded");

  // ── Phase 11: RTEC dev group, users, and memberships ──────────────────────────
  const rtecRoleCodes = ["RTEC_MEMBER", "RTEC_HEAD"] as const;
  const rtecRoles: Record<string, { id: string }> = {};
  for (const code of rtecRoleCodes) {
    rtecRoles[code] = await prisma.role.findUniqueOrThrow({ where: { code } });
  }

  const RTEC_DEV_PASSWORD = "DevRtecPassw0rd!123";
  const rtecDevPasswordHash = await bcrypt.hash(RTEC_DEV_PASSWORD, 12);

  const rtecDevUserDefs = [
    { email: "rtec.member1@dev.local", firstName: "Rtec", lastName: "Member1", roleCode: "RTEC_MEMBER" as const },
    { email: "rtec.member2@dev.local", firstName: "Rtec", lastName: "Member2", roleCode: "RTEC_MEMBER" as const },
    { email: "rtec.member3@dev.local", firstName: "Rtec", lastName: "Member3", roleCode: "RTEC_MEMBER" as const },
    { email: "rtec.head1@dev.local", firstName: "Rtec", lastName: "Head1", roleCode: "RTEC_HEAD" as const },
  ];

  const rtecDevUsers: Record<string, { id: string }> = {};
  for (const def of rtecDevUserDefs) {
    const user = await prisma.user.upsert({
      where: { email: def.email },
      update: {},
      create: {
        email: def.email,
        passwordHash: rtecDevPasswordHash,
        firstName: def.firstName,
        lastName: def.lastName,
        isActive: true,
        mustChangePassword: false,
      },
    });
    rtecDevUsers[def.email] = user;

    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: rtecRoles[def.roleCode].id } },
      update: {},
      create: { userId: user.id, roleId: rtecRoles[def.roleCode].id },
    });
  }

  const giaProgram = seededPrograms["GIA"];
  const rtecGroup =
    (await prisma.rtecGroup.findFirst({ where: { name: "GIA RTEC Committee" } })) ??
    (await prisma.rtecGroup.create({
      data: { name: "GIA RTEC Committee", programId: giaProgram.id, isActive: true },
    }));

  const membershipDefs = [
    { email: "rtec.member1@dev.local", roleInGroup: "MEMBER" },
    { email: "rtec.member2@dev.local", roleInGroup: "MEMBER" },
    { email: "rtec.member3@dev.local", roleInGroup: "MEMBER" },
    { email: "rtec.head1@dev.local", roleInGroup: "HEAD" },
  ];

  for (const def of membershipDefs) {
    const user = rtecDevUsers[def.email];
    await prisma.rtecMembership.upsert({
      where: { rtecGroupId_userId: { rtecGroupId: rtecGroup.id, userId: user.id } },
      update: { roleInGroup: def.roleInGroup, isActive: true },
      create: { rtecGroupId: rtecGroup.id, userId: user.id, roleInGroup: def.roleInGroup, isActive: true },
    });
  }

  console.log(
    `✓ Phase 11: rtec_groups, rtec_memberships, and 4 dev RTEC users seeded (password: ${RTEC_DEV_PASSWORD} — DEV ONLY)`,
  );

  // ── Phase 12: Budget, Accounting, RD workflow transitions ─────────────────────
  const phase12Transitions = [
    // Budget Officer actor
    { fromStatus: "ENDORSED_TO_BUDGET", toStatus: "UNDER_BUDGET_REVIEW", actionCode: "BUDGET_OPEN", actorRole: "BUDGET_OFFICER" },
    { fromStatus: "UNDER_BUDGET_REVIEW", toStatus: "RETURNED_BY_BUDGET", actionCode: "BUDGET_RETURN", actorRole: "BUDGET_OFFICER" },
    { fromStatus: "UNDER_BUDGET_REVIEW", toStatus: "ENDORSED_TO_ACCOUNTING", actionCode: "BUDGET_ENDORSE", actorRole: "BUDGET_OFFICER" },
    { fromStatus: "RETURNED_BY_ACCOUNTING", toStatus: "ENDORSED_TO_ACCOUNTING", actionCode: "BUDGET_RE_ENDORSE", actorRole: "BUDGET_OFFICER" },
    // Accountant actor
    { fromStatus: "ENDORSED_TO_ACCOUNTING", toStatus: "UNDER_ACCOUNTING_REVIEW", actionCode: "ACCOUNTING_OPEN", actorRole: "ACCOUNTANT" },
    { fromStatus: "UNDER_ACCOUNTING_REVIEW", toStatus: "RETURNED_BY_ACCOUNTING", actionCode: "ACCOUNTING_RETURN_BUDGET", actorRole: "ACCOUNTANT" },
    { fromStatus: "UNDER_ACCOUNTING_REVIEW", toStatus: "RETURNED_BY_ACCOUNTING", actionCode: "ACCOUNTING_RETURN_FOCAL", actorRole: "ACCOUNTANT" },
    { fromStatus: "UNDER_ACCOUNTING_REVIEW", toStatus: "ENDORSED_TO_RD", actionCode: "ACCOUNTING_ENDORSE_RD", actorRole: "ACCOUNTANT" },
    // Project Focal actor (re-route after direct Accountant return)
    { fromStatus: "RETURNED_BY_ACCOUNTING", toStatus: "UNDER_FOCAL_REVIEW", actionCode: "FOCAL_REROUTE", actorRole: "PROJECT_FOCAL" },
    // Regional Director actor
    { fromStatus: "ENDORSED_TO_RD", toStatus: "UNDER_RD_REVIEW", actionCode: "RD_OPEN", actorRole: "REGIONAL_DIRECTOR" },
    { fromStatus: "UNDER_RD_REVIEW", toStatus: "APPROVED", actionCode: "RD_APPROVE", actorRole: "REGIONAL_DIRECTOR" },
    { fromStatus: "UNDER_RD_REVIEW", toStatus: "DEFERRED", actionCode: "RD_DEFER", actorRole: "REGIONAL_DIRECTOR" },
    { fromStatus: "UNDER_RD_REVIEW", toStatus: "REJECTED", actionCode: "RD_REJECT", actorRole: "REGIONAL_DIRECTOR" },
    { fromStatus: "UNDER_RD_REVIEW", toStatus: "RETURNED_TO_APPLICANT", actionCode: "RD_RETURN", actorRole: "REGIONAL_DIRECTOR" },
    { fromStatus: "DEFERRED", toStatus: "UNDER_RD_REVIEW", actionCode: "RD_RESUME", actorRole: "REGIONAL_DIRECTOR" },
  ];

  for (const t of phase12Transitions) {
    await prisma.workflowTransition.upsert({
      where: {
        actionCode_actorRole_fromStatus: {
          actionCode: t.actionCode,
          actorRole: t.actorRole,
          fromStatus: t.fromStatus,
        },
      },
      update: { toStatus: t.toStatus },
      create: {
        workflowDefinitionId: proposalWorkflow.id,
        fromStatus: t.fromStatus,
        toStatus: t.toStatus,
        actionCode: t.actionCode,
        actorRole: t.actorRole,
      },
    });
  }
  console.log("✓ Phase 12: Budget/Accounting/RD workflow_transitions seeded");

  // ── Phase 12: Budget Officer, Accountant, RD dev users ────────────────────────
  const PHASE12_DEV_PASSWORD = "DevPhase12Passw0rd!123";
  const phase12DevPasswordHash = await bcrypt.hash(PHASE12_DEV_PASSWORD, 12);

  const phase12DevUserDefs = [
    { email: "budget1@dev.local", firstName: "Budget", lastName: "Officer1", roleCode: "BUDGET_OFFICER" },
    { email: "accountant1@dev.local", firstName: "Accountant", lastName: "One", roleCode: "ACCOUNTANT" },
    { email: "rd1@dev.local", firstName: "Regional", lastName: "Director1", roleCode: "REGIONAL_DIRECTOR" },
  ];

  for (const def of phase12DevUserDefs) {
    const role = await prisma.role.findUniqueOrThrow({ where: { code: def.roleCode } });
    const user = await prisma.user.upsert({
      where: { email: def.email },
      update: {},
      create: {
        email: def.email,
        passwordHash: phase12DevPasswordHash,
        firstName: def.firstName,
        lastName: def.lastName,
        isActive: true,
        mustChangePassword: false,
      },
    });
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: role.id } },
      update: {},
      create: { userId: user.id, roleId: role.id },
    });
  }

  console.log(
    `✓ Phase 12: budget1, accountant1, rd1 dev users seeded (password: ${PHASE12_DEV_PASSWORD} — DEV ONLY)`,
  );

  // ── Phase 21A: SUBMITTED_TO_FOCAL demo proposal + focal ProposalAssignment ───
  // Unblocks the focal queue and workflow actions for focal@dev.local, which
  // otherwise 403 with NOT_ASSIGNED (see TEST-MATRIX.md § Phase 21A).
  const applicantUser = await prisma.user.findUniqueOrThrow({
    where: { email: "applicant@dev.local" },
  });
  const focalUser = await prisma.user.findUniqueOrThrow({
    where: { email: "focal@dev.local" },
  });
  const giaProposalType = await prisma.proposalType.findUniqueOrThrow({
    where: { code: "GIA-PROPOSAL" },
  });

  let focalDemoProposal = await prisma.proposal.findFirst({
    where: { status: "SUBMITTED_TO_FOCAL", proposalTypeId: giaProposalType.id },
  });

  if (!focalDemoProposal) {
    const giaFormVersion = await prisma.formTemplateVersion.findFirstOrThrow({
      where: { formTemplateId: giaProposalType.defaultFormTemplateId!, isCurrent: true },
    });

    const created = await prisma.proposal.create({
      data: {
        applicantUserId: applicantUser.id,
        proposalTypeId: giaProposalType.id,
        status: "SUBMITTED_TO_FOCAL",
        title: "Seeded GIA Proposal — Focal Demo",
        submittedAt: new Date(),
      },
    });

    const version = await prisma.proposalVersion.create({
      data: {
        proposalId: created.id,
        versionNumber: 1,
        formTemplateVersionId: giaFormVersion.id,
        createdBy: applicantUser.id,
        statusAtCreation: "DRAFT",
        isSubmitted: true,
        submittedAt: new Date(),
      },
    });

    focalDemoProposal = await prisma.proposal.update({
      where: { id: created.id },
      data: { currentVersionId: version.id },
    });
  }

  const existingFocalAssignment = await prisma.proposalAssignment.findFirst({
    where: {
      proposalId: focalDemoProposal.id,
      userId: focalUser.id,
      roleCode: "PROJECT_FOCAL",
    },
  });

  if (existingFocalAssignment) {
    if (!existingFocalAssignment.isActive) {
      await prisma.proposalAssignment.update({
        where: { id: existingFocalAssignment.id },
        data: { isActive: true },
      });
    }
  } else {
    await prisma.proposalAssignment.create({
      data: {
        proposalId: focalDemoProposal.id,
        userId: focalUser.id,
        roleCode: "PROJECT_FOCAL",
        assignedBy: adminUser.id,
        isActive: true,
      },
    });
  }

  console.log(
    `✓ Phase 21A: focal@dev.local assigned as PROJECT_FOCAL on proposal ${focalDemoProposal.id} (${focalDemoProposal.title})`,
  );

  // ── Phase 11: UNDER_RTEC_REVIEW demo proposal + RTEC assignments ─────────────
  // Unblocks the RTEC member/head UI demo path for rtec.member@dev.local and
  // rtec.head@dev.local (the primary dev-login accounts named in
  // DEV-TEST-ACCOUNTS.md), which are not otherwise members of the seeded
  // "GIA RTEC Committee" (only rtec.member1/2/3 + rtec.head1 are).
  const rtecGroupForDemo = await prisma.rtecGroup.findFirstOrThrow({ where: { name: "GIA RTEC Committee" } });

  const rtecMemberDevUser = await prisma.user.findUniqueOrThrow({ where: { email: "rtec.member@dev.local" } });
  const rtecHeadDevUser = await prisma.user.findUniqueOrThrow({ where: { email: "rtec.head@dev.local" } });
  const rtecMember1User = await prisma.user.findUniqueOrThrow({ where: { email: "rtec.member1@dev.local" } });
  const rtecMember2User = await prisma.user.findUniqueOrThrow({ where: { email: "rtec.member2@dev.local" } });
  const rtecMember3User = await prisma.user.findUniqueOrThrow({ where: { email: "rtec.member3@dev.local" } });

  // Ensure the primary dev accounts are active members of the demo committee
  // (idempotent upsert — the Phase 11 RTEC group block above only seeds
  // rtec.member1/2/3 and rtec.head1).
  await prisma.rtecMembership.upsert({
    where: { rtecGroupId_userId: { rtecGroupId: rtecGroupForDemo.id, userId: rtecMemberDevUser.id } },
    update: { roleInGroup: "MEMBER", isActive: true },
    create: { rtecGroupId: rtecGroupForDemo.id, userId: rtecMemberDevUser.id, roleInGroup: "MEMBER", isActive: true },
  });
  await prisma.rtecMembership.upsert({
    where: { rtecGroupId_userId: { rtecGroupId: rtecGroupForDemo.id, userId: rtecHeadDevUser.id } },
    update: { roleInGroup: "HEAD", isActive: true },
    create: { rtecGroupId: rtecGroupForDemo.id, userId: rtecHeadDevUser.id, roleInGroup: "HEAD", isActive: true },
  });

  let rtecDemoProposal = await prisma.proposal.findFirst({
    where: { status: "UNDER_RTEC_REVIEW", proposalTypeId: giaProposalType.id },
  });

  if (!rtecDemoProposal) {
    const giaFormVersionForRtec = await prisma.formTemplateVersion.findFirstOrThrow({
      where: { formTemplateId: giaProposalType.defaultFormTemplateId!, isCurrent: true },
    });

    const created = await prisma.proposal.create({
      data: {
        applicantUserId: applicantUser.id,
        proposalTypeId: giaProposalType.id,
        status: "UNDER_RTEC_REVIEW",
        title: "Seeded GIA Proposal — RTEC Demo",
        submittedAt: new Date(),
      },
    });

    const version = await prisma.proposalVersion.create({
      data: {
        proposalId: created.id,
        versionNumber: 1,
        formTemplateVersionId: giaFormVersionForRtec.id,
        createdBy: applicantUser.id,
        statusAtCreation: "DRAFT",
        isSubmitted: true,
        submittedAt: new Date(),
      },
    });

    rtecDemoProposal = await prisma.proposal.update({
      where: { id: created.id },
      data: { currentVersionId: version.id },
    });
  }

  // Quorum (checkQuorumAndMaybeAdvance) requires a submitted review from every
  // ACTIVE RtecMembership in the group, not just the proposal-level
  // assignments — so all 4 active MEMBER memberships of "GIA RTEC Committee"
  // (rtec.member, rtec.member1, rtec.member2, rtec.member3) must be assigned
  // here, or quorum can never be reached for this demo proposal.
  const rtecDemoAssignments: Array<{ userId: string; roleCode: string }> = [
    { userId: rtecMemberDevUser.id, roleCode: "RTEC_MEMBER" },
    { userId: rtecMember1User.id, roleCode: "RTEC_MEMBER" },
    { userId: rtecMember2User.id, roleCode: "RTEC_MEMBER" },
    { userId: rtecMember3User.id, roleCode: "RTEC_MEMBER" },
    { userId: rtecHeadDevUser.id, roleCode: "RTEC_HEAD" },
    { userId: focalUser.id, roleCode: "PROJECT_FOCAL" },
  ];

  for (const def of rtecDemoAssignments) {
    const existing = await prisma.proposalAssignment.findFirst({
      where: { proposalId: rtecDemoProposal.id, userId: def.userId, roleCode: def.roleCode },
    });
    if (existing) {
      if (!existing.isActive) {
        await prisma.proposalAssignment.update({ where: { id: existing.id }, data: { isActive: true } });
      }
    } else {
      await prisma.proposalAssignment.create({
        data: {
          proposalId: rtecDemoProposal.id,
          userId: def.userId,
          roleCode: def.roleCode,
          assignedBy: adminUser.id,
          isActive: true,
        },
      });
    }
  }

  console.log("✓ Phase 11: RTEC demo proposal seeded (status: UNDER_RTEC_REVIEW)");

  // ── Phase 12: Budget, Accounting, RD demo proposals ───────────────────────────
  const budgetOfficerUser = await prisma.user.findUniqueOrThrow({ where: { email: "budget@dev.local" } });
  const accountantUser = await prisma.user.findUniqueOrThrow({ where: { email: "accountant@dev.local" } });
  const rdUser = await prisma.user.findUniqueOrThrow({ where: { email: "rd@dev.local" } });

  const giaFormVersionForPhase12 = await prisma.formTemplateVersion.findFirstOrThrow({
    where: { formTemplateId: giaProposalType.defaultFormTemplateId!, isCurrent: true },
  });

  async function seedPhase12DemoProposal(
    title: string,
    status: string,
    assignments: Array<{ userId: string; roleCode: string }>,
    logLabel: string,
  ) {
    let proposal = await prisma.proposal.findFirst({ where: { title } });

    if (!proposal) {
      const created = await prisma.proposal.create({
        data: {
          applicantUserId: applicantUser.id,
          proposalTypeId: giaProposalType.id,
          status,
          title,
          submittedAt: new Date(),
        },
      });

      const version = await prisma.proposalVersion.create({
        data: {
          proposalId: created.id,
          versionNumber: 1,
          formTemplateVersionId: giaFormVersionForPhase12.id,
          createdBy: applicantUser.id,
          statusAtCreation: "DRAFT",
          isSubmitted: true,
          submittedAt: new Date(),
        },
      });

      proposal = await prisma.proposal.update({
        where: { id: created.id },
        data: { currentVersionId: version.id },
      });
    }

    for (const def of assignments) {
      const existing = await prisma.proposalAssignment.findFirst({
        where: { proposalId: proposal.id, userId: def.userId, roleCode: def.roleCode },
      });
      if (existing) {
        if (!existing.isActive) {
          await prisma.proposalAssignment.update({ where: { id: existing.id }, data: { isActive: true } });
        }
      } else {
        await prisma.proposalAssignment.create({
          data: {
            proposalId: proposal.id,
            userId: def.userId,
            roleCode: def.roleCode,
            assignedBy: adminUser.id,
            isActive: true,
          },
        });
      }
    }

    console.log(`✓ Phase 12: ${logLabel}`);
  }

  await seedPhase12DemoProposal(
    "Seeded Budget Proposal — Budget Demo",
    "ENDORSED_TO_BUDGET",
    [
      { userId: budgetOfficerUser.id, roleCode: "BUDGET_OFFICER" },
      { userId: focalUser.id, roleCode: "PROJECT_FOCAL" },
    ],
    "budget@dev.local demo proposal seeded (ENDORSED_TO_BUDGET)",
  );

  await seedPhase12DemoProposal(
    "Seeded Accounting Proposal — Accounting Demo",
    "ENDORSED_TO_ACCOUNTING",
    [
      { userId: accountantUser.id, roleCode: "ACCOUNTANT" },
      { userId: budgetOfficerUser.id, roleCode: "BUDGET_OFFICER" },
      { userId: focalUser.id, roleCode: "PROJECT_FOCAL" },
    ],
    "accountant@dev.local demo proposal seeded (ENDORSED_TO_ACCOUNTING)",
  );

  await seedPhase12DemoProposal(
    "Seeded RD Proposal — RD Demo",
    "ENDORSED_TO_RD",
    [
      { userId: rdUser.id, roleCode: "REGIONAL_DIRECTOR" },
      { userId: focalUser.id, roleCode: "PROJECT_FOCAL" },
    ],
    "rd@dev.local demo proposal seeded (ENDORSED_TO_RD)",
  );

  // ── Phase 13: APPROVED demo proposal for export testing ───────────────────────
  const EXPORT_DEMO_TITLE = "Seeded Approved Proposal — Export Demo";
  let exportDemoProposal = await prisma.proposal.findFirst({ where: { title: EXPORT_DEMO_TITLE } });

  if (!exportDemoProposal) {
    const created = await prisma.proposal.create({
      data: {
        applicantUserId: applicantUser.id,
        proposalTypeId: giaProposalType.id,
        status: "APPROVED",
        isLocked: true,
        title: EXPORT_DEMO_TITLE,
        submittedAt: new Date(),
      },
    });

    const version = await prisma.proposalVersion.create({
      data: {
        proposalId: created.id,
        versionNumber: 1,
        formTemplateVersionId: giaFormVersionForPhase12.id,
        createdBy: applicantUser.id,
        statusAtCreation: "DRAFT",
        isSubmitted: true,
        submittedAt: new Date(),
      },
    });

    exportDemoProposal = await prisma.proposal.update({
      where: { id: created.id },
      data: { currentVersionId: version.id },
    });

    await prisma.rdDecision.create({
      data: {
        proposalId: exportDemoProposal.id,
        proposalVersionId: version.id,
        decidedBy: rdUser.id,
        decision: "APPROVED",
        remarks: "Meets all criteria.",
        decidedAt: new Date(),
      },
    });
  }

  const exportDemoAssignments: Array<{ userId: string; roleCode: string }> = [
    { userId: rdUser.id, roleCode: "REGIONAL_DIRECTOR" },
    { userId: focalUser.id, roleCode: "PROJECT_FOCAL" },
  ];

  for (const def of exportDemoAssignments) {
    const existing = await prisma.proposalAssignment.findFirst({
      where: { proposalId: exportDemoProposal.id, userId: def.userId, roleCode: def.roleCode },
    });
    if (existing) {
      if (!existing.isActive) {
        await prisma.proposalAssignment.update({ where: { id: existing.id }, data: { isActive: true } });
      }
    } else {
      await prisma.proposalAssignment.create({
        data: {
          proposalId: exportDemoProposal.id,
          userId: def.userId,
          roleCode: def.roleCode,
          assignedBy: adminUser.id,
          isActive: true,
        },
      });
    }
  }

  console.log("✓ Phase 13: APPROVED demo proposal seeded for export testing");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
