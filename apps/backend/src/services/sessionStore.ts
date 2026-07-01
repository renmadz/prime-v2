import type { PrismaClient } from "@prisma/client";

// connect-pg-simple's default table is "session" with a JSON "sess" column
// holding whatever @fastify/session wrote (cookie + our custom fields, e.g.
// userId). Deleting matching rows here immediately invalidates every active
// session for that user — not just the next request's session (which
// requireAuth's is_active check would catch anyway, but Security Plan §2.5
// requires immediate invalidation on deactivation, not deferred).
export async function invalidateUserSessions(
  db: PrismaClient,
  userId: string,
): Promise<void> {
  await db.$executeRaw`DELETE FROM "session" WHERE sess->>'userId' = ${userId}`;
}
