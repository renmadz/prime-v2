import type { Prisma } from "@prisma/client";
import { validateTransition, WorkflowError } from "./workflowEngine.js";

// Resolves the RTEC group currently associated with a proposal. Consolidation
// rows are the source of truth once a round has begun (multiple rounds are
// allowed via the Focal return-to-rtec path, so we take the most recent);
// before any consolidation exists, the group is resolved from the most
// recent review instead.
export async function getActiveRtecGroupForProposal(
  proposalId: string,
  tx: Prisma.TransactionClient,
): Promise<string> {
  const consolidation = await tx.rtecConsolidation.findFirst({
    where: { proposalId },
    orderBy: { createdAt: "desc" },
  });
  if (consolidation) {
    return consolidation.rtecGroupId;
  }

  const review = await tx.rtecReview.findFirst({
    where: { proposalId },
    orderBy: { createdAt: "desc" },
  });
  if (review) {
    return review.rtecGroupId;
  }

  throw new WorkflowError(
    404,
    "RTEC_GROUP_NOT_FOUND",
    `No RTEC group is associated with proposal ${proposalId}`,
  );
}

export async function notifyRtecGroup(
  rtecGroupId: string,
  proposalId: string,
  eventType: string,
  message: string,
  tx: Prisma.TransactionClient,
): Promise<void> {
  const memberships = await tx.rtecMembership.findMany({
    where: { rtecGroupId, isActive: true },
  });
  for (const membership of memberships) {
    await tx.notification.create({
      data: {
        recipientUserId: membership.userId,
        proposalId,
        eventType,
        message,
      },
    });
  }
}

export async function assertActiveRtecMembership(
  rtecGroupId: string,
  userId: string,
  roleInGroup: "MEMBER" | "HEAD",
  tx: Prisma.TransactionClient,
): Promise<void> {
  const membership = await tx.rtecMembership.findFirst({
    where: { rtecGroupId, userId, roleInGroup, isActive: true },
  });
  if (!membership) {
    throw new WorkflowError(
      403,
      "NOT_RTEC_MEMBER",
      `You are not an active ${roleInGroup} of this proposal's RTEC group`,
    );
  }
}

// Called after a member submits their review. If every active MEMBER
// membership of the group now has a submitted review for this proposal
// version, auto-advances the proposal status. validateTransition is invoked
// with actorRole "SYSTEM" to match the seeded auto-transition row, but the
// workflow history / audit log record the real submitting member's role for
// accountability.
export async function checkQuorumAndMaybeAdvance(
  proposalId: string,
  proposalVersionId: string,
  rtecGroupId: string,
  actorUserId: string,
  actorRole: string,
  tx: Prisma.TransactionClient,
): Promise<void> {
  const activeMembers = await tx.rtecMembership.findMany({
    where: { rtecGroupId, roleInGroup: "MEMBER", isActive: true },
  });

  const submittedReviews = await tx.rtecReview.findMany({
    where: { proposalId, proposalVersionId, rtecGroupId, isSubmitted: true },
  });
  const submittedUserIds = new Set(submittedReviews.map((r) => r.reviewerUserId));
  const allSubmitted =
    activeMembers.length > 0 && activeMembers.every((m) => submittedUserIds.has(m.userId));

  if (!allSubmitted) {
    return;
  }

  const { proposal, transition } = await validateTransition(
    proposalId,
    "RTEC_REVIEWS_COMPLETE",
    "SYSTEM",
    tx,
  );
  const versionNumber = (proposal as any).currentVersion?.versionNumber ?? 0;

  await tx.proposal.update({
    where: { id: proposalId },
    data: { status: transition.toStatus },
  });

  await tx.proposalWorkflowHistory.create({
    data: {
      proposalId,
      fromStatus: transition.fromStatus,
      toStatus: transition.toStatus,
      actorUserId,
      actorRole,
      workflowAction: "RTEC_REVIEWS_COMPLETE",
      proposalVersionNumber: versionNumber,
    },
  });

  await tx.auditLog.create({
    data: {
      actorUserId,
      actorRole,
      action: "WORKFLOW_RTEC_REVIEWS_COMPLETE",
      entityType: "proposals",
      entityId: proposalId,
      beforeState: JSON.stringify({ status: transition.fromStatus }),
      afterState: JSON.stringify({ status: transition.toStatus }),
    },
  });
}

// Shared by POST /rtec/consolidation/submit and
// POST /workflow/rtec-submit-recommendation so there is exactly one
// transactional code path for this action.
export async function performRtecSubmitRecommendation(
  proposalId: string,
  actorUserId: string,
  tx: Prisma.TransactionClient,
): Promise<{ id: string; status: string }> {
  const consolidation = await tx.rtecConsolidation.findFirst({
    where: { proposalId },
    orderBy: { createdAt: "desc" },
  });

  if (!consolidation) {
    throw new WorkflowError(
      404,
      "CONSOLIDATION_NOT_FOUND",
      "No RTEC consolidation draft exists for this proposal",
    );
  }
  if (consolidation.isSubmitted) {
    throw new WorkflowError(409, "ALREADY_SUBMITTED", "This consolidation has already been submitted");
  }
  if (!consolidation.consolidatedRemarks || consolidation.consolidatedRemarks.trim().length === 0) {
    throw new WorkflowError(
      422,
      "REMARKS_REQUIRED",
      "consolidatedRemarks must not be empty before submitting",
    );
  }

  const { proposal, transition } = await validateTransition(
    proposalId,
    "RTEC_SUBMIT_RECOMMENDATION",
    "RTEC_HEAD",
    tx,
  );
  const versionNumber = (proposal as any).currentVersion?.versionNumber ?? 0;

  const updated = await tx.proposal.update({
    where: { id: proposalId },
    data: { status: transition.toStatus },
  });

  await tx.rtecConsolidation.update({
    where: { id: consolidation.id },
    data: { isSubmitted: true, submittedAt: new Date() },
  });

  await tx.proposalWorkflowHistory.create({
    data: {
      proposalId,
      fromStatus: transition.fromStatus,
      toStatus: transition.toStatus,
      actorUserId,
      actorRole: "RTEC_HEAD",
      workflowAction: "RTEC_SUBMIT_RECOMMENDATION",
      proposalVersionNumber: versionNumber,
    },
  });

  await tx.auditLog.create({
    data: {
      actorUserId,
      actorRole: "RTEC_HEAD",
      action: "WORKFLOW_RTEC_SUBMIT_RECOMMENDATION",
      entityType: "proposals",
      entityId: proposalId,
      beforeState: JSON.stringify({ status: transition.fromStatus }),
      afterState: JSON.stringify({ status: transition.toStatus }),
    },
  });

  const focalAssignment = await tx.proposalAssignment.findFirst({
    where: { proposalId, roleCode: "PROJECT_FOCAL", isActive: true },
  });
  if (focalAssignment) {
    await tx.notification.create({
      data: {
        recipientUserId: focalAssignment.userId,
        proposalId,
        eventType: "RTEC_RECOMMENDATION_SUBMITTED",
        message: "The RTEC Head has submitted a consolidated recommendation for your proposal.",
      },
    });
  }

  return { id: updated.id, status: updated.status };
}
