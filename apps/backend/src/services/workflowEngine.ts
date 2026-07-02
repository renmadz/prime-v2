import type { Prisma } from "@prisma/client";

// ── WorkflowError ─────────────────────────────────────────────────────────────

export class WorkflowError extends Error {
  statusCode: 403 | 404 | 409 | 422;
  code: string;

  constructor(statusCode: 403 | 404 | 409 | 422, code: string, message: string) {
    super(message);
    this.name = "WorkflowError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

// ── validateTransition ────────────────────────────────────────────────────────

/**
 * Validates that a workflow transition is permitted for the given proposal.
 * Must be called inside a prisma.$transaction — the tx argument is the
 * transaction client. Does NOT commit; the caller owns the transaction boundary.
 *
 * Throws WorkflowError:
 *   404 — proposal not found
 *   422 — no matching transition rule (INVALID_TRANSITION)
 *   409 — proposal status changed since this request started (CONCURRENT_TRANSITION)
 */
export async function validateTransition(
  proposalId: string,
  action: string,
  actorRole: string,
  tx: Prisma.TransactionClient,
): Promise<{
  proposal: Awaited<ReturnType<typeof tx.proposal.findUniqueOrThrow>>;
  transition: Awaited<ReturnType<typeof tx.workflowTransition.findFirstOrThrow>>;
}> {
  // 1. Fetch the proposal (includes currentVersion for versionNumber)
  const proposal = await tx.proposal.findUnique({
    where: { id: proposalId },
    include: { currentVersion: true },
  });

  if (!proposal) {
    throw new WorkflowError(404, "PROPOSAL_NOT_FOUND", `Proposal ${proposalId} not found`);
  }

  // 2. Look up the matching transition rule using the proposal's CURRENT status.
  //    Using fromStatus: proposal.status in the query means: if the status has
  //    already changed (concurrent request), findFirst returns null → 409.
  const transition = await tx.workflowTransition.findFirst({
    where: {
      actionCode: action,
      actorRole,
      fromStatus: proposal.status,
    },
  });

  if (!transition) {
    // Could be invalid action OR concurrent status change — distinguish by
    // checking whether ANY transition exists for this action+role regardless of status.
    const anyTransition = await tx.workflowTransition.findFirst({
      where: { actionCode: action, actorRole },
    });

    if (anyTransition) {
      // Action is valid in principle but wrong from-status → concurrent edit
      throw new WorkflowError(
        409,
        "CONCURRENT_TRANSITION",
        `Proposal status '${proposal.status}' does not match the expected from-status for action '${action}'. A concurrent transition may have occurred.`,
      );
    }

    // Action is simply not valid for this role
    throw new WorkflowError(
      422,
      "INVALID_TRANSITION",
      `Transition '${action}' is not valid for role '${actorRole}' from status '${proposal.status}'`,
    );
  }

  return { proposal, transition };
}
