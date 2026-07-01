import type { PrismaClient } from "@prisma/client";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_PER_IP = 10;
const MAX_FAILED_PER_EMAIL = 5;

export class RateLimitExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RateLimitExceededError";
  }
}

// Rate-limit state is derived from audit_logs (already written on every login
// attempt) rather than an in-memory counter, so limits survive a process
// restart and are never client-trusted.
export async function checkStaffLoginRateLimit(
  db: PrismaClient,
  params: { ipAddress: string | null; email: string },
): Promise<void> {
  const since = new Date(Date.now() - WINDOW_MS);

  if (params.ipAddress) {
    const ipAttempts = await db.auditLog.count({
      where: {
        action: { in: ["USER_LOGIN_SUCCESS", "USER_LOGIN_FAILED"] },
        ipAddress: params.ipAddress,
        createdAt: { gte: since },
      },
    });
    if (ipAttempts >= MAX_PER_IP) {
      throw new RateLimitExceededError("Too many login attempts from this IP.");
    }
  }

  const failedForEmail = await db.auditLog.count({
    where: {
      action: "USER_LOGIN_FAILED",
      entityType: "users",
      afterState: { contains: `"email":"${params.email}"` },
      createdAt: { gte: since },
    },
  });
  if (failedForEmail >= MAX_FAILED_PER_EMAIL) {
    throw new RateLimitExceededError(
      "Too many failed login attempts for this account.",
    );
  }
}
