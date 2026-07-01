export const ROLE_CODES = [
  "APPLICANT",
  "ADMIN",
  "PROJECT_FOCAL",
  "RTEC_MEMBER",
  "RTEC_HEAD",
  "BUDGET_OFFICER",
  "ACCOUNTANT",
  "REGIONAL_DIRECTOR",
] as const;

export type RoleCode = (typeof ROLE_CODES)[number];

export const STAFF_ROLE_CODES: RoleCode[] = ROLE_CODES.filter(
  (code) => code !== "APPLICANT",
);
