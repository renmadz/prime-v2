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

async function ensureRolesSeeded() {
  for (const code of ROLE_CODES) {
    await db.role.upsert({
      where: { code },
      update: {},
      create: { code, name: code, isActive: true },
    });
  }
}

let ipCounter = 100;
function nextIp() {
  ipCounter += 1;
  return `10.0.3.${ipCounter}`;
}

async function createAdminSession(app: FastifyInstance, email: string) {
  const passwordHash = await bcrypt.hash("AdminPassw0rd!", 12);
  const adminRole = await db.role.findUniqueOrThrow({ where: { code: "ADMIN" } });
  await db.user.create({
    data: {
      email,
      passwordHash,
      firstName: "Admin",
      lastName: "User",
      isActive: true,
      mustChangePassword: false,
      userRoles: { create: [{ roleId: adminRole.id }] },
    },
  });

  const loginResponse = await app.inject({
    method: "POST",
    url: "/api/auth/staff/login",
    remoteAddress: nextIp(),
    payload: { email, password: "AdminPassw0rd!" },
  });
  return sessionCookieHeader(loginResponse);
}

async function createNonAdminSession(app: FastifyInstance, email: string) {
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

const TEST_EMAILS = [
  "admin-form-01@test.local",
  "admin-form-02@test.local",
  "admin-form-02b@test.local",
  "admin-form-03@test.local",
  "focal-form-04@test.local",
];

const TEST_FORM_CODES = ["FT-FORM-01", "FT-FORM-02", "FT-FORM-03", "FT-FORM-04"];

async function cleanupTestData() {
  // Delete form template versions and children (cascade should handle sections/fields)
  const templates = await db.formTemplate.findMany({
    where: { formCode: { in: TEST_FORM_CODES } },
  });
  const templateIds = templates.map((t) => t.id);

  if (templateIds.length > 0) {
    const versions = await db.formTemplateVersion.findMany({
      where: { formTemplateId: { in: templateIds } },
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

    await db.formTemplate.deleteMany({ where: { id: { in: templateIds } } });
  }

  // Remove test users
  const users = await db.user.findMany({ where: { email: { in: TEST_EMAILS } } });
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

describe("Form Templates routes", () => {
  let app: FastifyInstance;
  let seededTemplateId: string;
  let seededVersionId: string;

  beforeAll(async () => {
    await ensureRolesSeeded();
    await cleanupTestData();
    app = await buildApp();
    await app.ready();

    // Seed a form template with a current version for TC-FORM-01
    const template = await db.formTemplate.create({
      data: {
        formCode: "FT-FORM-01",
        title: "Test Form Template",
        isActive: true,
      },
    });
    seededTemplateId = template.id;

    const version = await db.formTemplateVersion.create({
      data: {
        formTemplateId: template.id,
        versionNumber: 1,
        schemaVersion: "1.0",
        isCurrent: true,
        publishedAt: new Date(),
      },
    });
    seededVersionId = version.id;

    const section = await db.formSection.create({
      data: {
        formTemplateVersionId: version.id,
        sectionCode: "S1",
        title: "Project Information",
        displayOrder: 1,
        isRepeating: false,
        isRequired: true,
      },
    });

    await db.formField.create({
      data: {
        formSectionId: section.id,
        fieldCode: "F1",
        label: "Project Title",
        inputType: "TEXT",
        isRequired: true,
        displayOrder: 1,
      },
    });

    // Seed a second form template for TC-FORM-03 (POST test)
    await db.formTemplate.create({
      data: {
        formCode: "FT-FORM-03",
        title: "Test Form Template for POST",
        isActive: true,
      },
    });

    // Seed a fourth form template for TC-FORM-04 (403 test)
    await db.formTemplate.create({
      data: {
        formCode: "FT-FORM-04",
        title: "Test Form Template for 403",
        isActive: true,
      },
    });
  });

  afterAll(async () => {
    await app.close();
    await cleanupTestData();
    await db.$disconnect();
  });

  it("TC-FORM-01: GET /api/form-templates/:id/versions/current returns sections and fields", async () => {
    const adminCookie = await createAdminSession(app, "admin-form-01@test.local");

    const response = await app.inject({
      method: "GET",
      url: `/api/form-templates/${seededTemplateId}/versions/current`,
      headers: { cookie: adminCookie },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      id: string;
      formTemplateId: string;
      versionNumber: number;
      schemaVersion: string;
      isCurrent: boolean;
      publishedAt: string | null;
      sections: Array<{
        id: string;
        sectionCode: string;
        title: string;
        displayOrder: number;
        isRepeating: boolean;
        isRequired: boolean;
        fields: Array<{
          id: string;
          fieldCode: string;
          label: string;
          inputType: string;
          isRequired: boolean;
          validationRules: string | null;
          displayOrder: number;
        }>;
      }>;
    };

    expect(body.id).toBe(seededVersionId);
    expect(body.formTemplateId).toBe(seededTemplateId);
    expect(body.versionNumber).toBe(1);
    expect(body.schemaVersion).toBe("1.0");
    expect(body.isCurrent).toBe(true);
    expect(body.sections).toHaveLength(1);
    expect(body.sections[0].sectionCode).toBe("S1");
    expect(body.sections[0].title).toBe("Project Information");
    expect(body.sections[0].displayOrder).toBe(1);
    expect(body.sections[0].fields).toHaveLength(1);
    expect(body.sections[0].fields[0].fieldCode).toBe("F1");
    expect(body.sections[0].fields[0].label).toBe("Project Title");
    expect(body.sections[0].fields[0].inputType).toBe("TEXT");
    expect(body.sections[0].fields[0].isRequired).toBe(true);
    expect(body.sections[0].fields[0].displayOrder).toBe(1);
  });

  it("TC-FORM-02: GET /api/form-templates/:id/versions/current for non-existent template returns 404", async () => {
    const adminCookie = await createAdminSession(app, "admin-form-02@test.local");

    const response = await app.inject({
      method: "GET",
      url: "/api/form-templates/00000000-0000-0000-0000-000000000000/versions/current",
      headers: { cookie: adminCookie },
    });

    expect(response.statusCode).toBe(404);
  });

  it("TC-FORM-02b: GET /versions/:versionId returns 404 when version does not belong to template", async () => {
    const adminCookie = await createAdminSession(app, "admin-form-02b@test.local");

    const response = await app.inject({
      method: "GET",
      url: `/api/form-templates/00000000-0000-0000-0000-000000000000/versions/${seededVersionId}`,
      headers: { cookie: adminCookie },
    });

    expect(response.statusCode).toBe(404);
  });

  it("TC-FORM-03: POST /api/form-templates/:id/versions as ADMIN creates version, marks previous as not current → 201", async () => {
    const adminCookie = await createAdminSession(app, "admin-form-03@test.local");

    // Find the template seeded for this test
    const template = await db.formTemplate.findUniqueOrThrow({
      where: { formCode: "FT-FORM-03" },
    });

    // Create an initial version so we can verify it gets marked not current
    const initialVersion = await db.formTemplateVersion.create({
      data: {
        formTemplateId: template.id,
        versionNumber: 1,
        schemaVersion: "1.0",
        isCurrent: true,
        publishedAt: new Date(),
      },
    });

    const response = await app.inject({
      method: "POST",
      url: `/api/form-templates/${template.id}/versions`,
      headers: { cookie: adminCookie },
      payload: {
        schemaVersion: "1.1",
        sections: [
          {
            sectionCode: "S1",
            title: "Basic Info",
            displayOrder: 1,
            isRepeating: false,
            isRequired: true,
            fields: [
              {
                fieldCode: "F1",
                label: "Title",
                inputType: "TEXT",
                isRequired: true,
                displayOrder: 1,
              },
            ],
          },
        ],
      },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json() as { id: string; versionNumber: number };
    expect(body.id).toBeDefined();
    expect(body.versionNumber).toBe(2);

    // Verify previous version is now not current
    const previous = await db.formTemplateVersion.findUniqueOrThrow({
      where: { id: initialVersion.id },
    });
    expect(previous.isCurrent).toBe(false);

    // Verify new version is current
    const newVersion = await db.formTemplateVersion.findUniqueOrThrow({
      where: { id: body.id },
    });
    expect(newVersion.isCurrent).toBe(true);
    expect(newVersion.versionNumber).toBe(2);
    expect(newVersion.schemaVersion).toBe("1.1");
    expect(newVersion.publishedAt).not.toBeNull();

    // Verify sections and fields were created
    const sections = await db.formSection.findMany({
      where: { formTemplateVersionId: body.id },
    });
    expect(sections).toHaveLength(1);
    expect(sections[0].sectionCode).toBe("S1");

    const fields = await db.formField.findMany({
      where: { formSectionId: sections[0].id },
    });
    expect(fields).toHaveLength(1);
    expect(fields[0].fieldCode).toBe("F1");
  });

  it("TC-FORM-04: POST /api/form-templates/:id/versions as non-ADMIN returns 403", async () => {
    const nonAdminCookie = await createNonAdminSession(app, "focal-form-04@test.local");

    const template = await db.formTemplate.findUniqueOrThrow({
      where: { formCode: "FT-FORM-04" },
    });

    const response = await app.inject({
      method: "POST",
      url: `/api/form-templates/${template.id}/versions`,
      headers: { cookie: nonAdminCookie },
      payload: {
        schemaVersion: "1.0",
        sections: [],
      },
    });

    expect(response.statusCode).toBe(403);
  });
});
