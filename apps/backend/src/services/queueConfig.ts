export type QueueKey =
  | "focal"
  | "rtec"
  | "rtec_reviews"
  | "rtec_consolidation"
  | "budget"
  | "accounting"
  | "rd";

export interface QueueDefinition {
  label: string;
  assignmentRoleCode?: string;
  statuses: string[];
  allowedRoles: string[];
}

export const QUEUE_DEFINITIONS: Record<QueueKey, QueueDefinition> = {
  focal: {
    label: "Project Focal Queue",
    assignmentRoleCode: "PROJECT_FOCAL",
    statuses: [
      "SUBMITTED_TO_FOCAL",
      "RESUBMITTED_TO_FOCAL",
      "UNDER_FOCAL_REVIEW",
      "RETURNED_TO_FOCAL_BY_RTEC",
    ],
    allowedRoles: ["PROJECT_FOCAL", "ADMIN"],
  },
  rtec: {
    label: "RTEC Queue",
    assignmentRoleCode: "RTEC_MEMBER",
    statuses: ["ENDORSED_TO_RTEC", "UNDER_RTEC_REVIEW"],
    allowedRoles: ["RTEC_MEMBER", "RTEC_HEAD", "ADMIN"],
  },
  rtec_reviews: {
    label: "My RTEC Reviews",
    assignmentRoleCode: "RTEC_MEMBER",
    statuses: ["UNDER_RTEC_REVIEW"],
    allowedRoles: ["RTEC_MEMBER", "ADMIN"],
  },
  rtec_consolidation: {
    label: "RTEC Consolidation",
    statuses: ["RTEC_MEMBER_REVIEWS_COMPLETE", "UNDER_RTEC_HEAD_CONSOLIDATION"],
    allowedRoles: ["RTEC_HEAD", "ADMIN"],
  },
  budget: {
    label: "Budget Queue",
    assignmentRoleCode: "BUDGET_OFFICER",
    statuses: ["ENDORSED_TO_BUDGET", "UNDER_BUDGET_REVIEW", "RETURNED_BY_BUDGET"],
    allowedRoles: ["BUDGET_OFFICER", "ADMIN"],
  },
  accounting: {
    label: "Accounting Queue",
    assignmentRoleCode: "ACCOUNTANT",
    statuses: [
      "ENDORSED_TO_ACCOUNTING",
      "UNDER_ACCOUNTING_REVIEW",
      "RETURNED_BY_ACCOUNTING",
    ],
    allowedRoles: ["ACCOUNTANT", "ADMIN"],
  },
  rd: {
    // No assignmentRoleCode: Roles-and-Permissions §3.1 marks REGIONAL_DIRECTOR
    // "✅" (unconditional), not "Assigned" — same tier as ADMIN. No workflow
    // route ever creates a REGIONAL_DIRECTOR ProposalAssignment, so gating this
    // queue on one would leave it permanently empty for real proposals.
    label: "Regional Director Queue",
    statuses: ["ENDORSED_TO_RD", "UNDER_RD_REVIEW"],
    allowedRoles: ["REGIONAL_DIRECTOR", "ADMIN"],
  },
};

export function isQueueKey(value: string): value is QueueKey {
  return value in QUEUE_DEFINITIONS;
}
