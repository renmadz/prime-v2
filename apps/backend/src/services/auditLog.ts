import type { PrismaClient } from "@prisma/client";

export interface AuditLogEntry {
  actorUserId?: string | null;
  actorRole?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  beforeState?: unknown;
  afterState?: unknown;
  ipAddress?: string | null;
  sessionReference?: string | null;
}

// audit_logs is append-only (docs/database/DATA-DICTIONARY.md §10). This is the
// only write path the codebase uses against that table — never UPDATE/DELETE.
export async function auditLog(
  db: PrismaClient,
  entry: AuditLogEntry,
): Promise<void> {
  await db.auditLog.create({
    data: {
      actorUserId: entry.actorUserId ?? null,
      actorRole: entry.actorRole ?? null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      beforeState:
        entry.beforeState !== undefined
          ? JSON.stringify(entry.beforeState)
          : null,
      afterState:
        entry.afterState !== undefined
          ? JSON.stringify(entry.afterState)
          : null,
      ipAddress: entry.ipAddress ?? null,
      sessionReference: entry.sessionReference ?? null,
    },
  });
}
