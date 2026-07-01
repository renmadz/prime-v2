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

// Dev-only known credentials. NEVER use this account or password outside a
// local development database. must_change_password is false here ONLY so
// local dev can log in immediately without an extra step.
const DEV_ADMIN_EMAIL = "admin@dev.local";
const DEV_ADMIN_PASSWORD = "DevAdminPassw0rd!123";

async function main() {
  for (const role of ROLES) {
    await prisma.role.upsert({
      where: { code: role.code },
      update: { name: role.name, description: role.description, isActive: true },
      create: { ...role, isActive: true },
    });
  }

  const adminRole = await prisma.role.findUniqueOrThrow({
    where: { code: "ADMIN" },
  });

  const passwordHash = await bcrypt.hash(DEV_ADMIN_PASSWORD, 12);

  const adminUser = await prisma.user.upsert({
    where: { email: DEV_ADMIN_EMAIL },
    update: {},
    create: {
      email: DEV_ADMIN_EMAIL,
      passwordHash,
      firstName: "Dev",
      lastName: "Admin",
      isActive: true,
      mustChangePassword: false,
    },
  });

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: adminUser.id, roleId: adminRole.id } },
    update: {},
    create: { userId: adminUser.id, roleId: adminRole.id },
  });

  console.log("Seeded 8 role codes.");
  console.log(
    `Seeded dev ADMIN user: ${DEV_ADMIN_EMAIL} / ${DEV_ADMIN_PASSWORD} — DEV ONLY, do not use in staging/production.`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
