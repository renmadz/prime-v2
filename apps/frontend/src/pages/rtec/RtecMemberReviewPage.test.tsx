import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import RtecMemberReviewPage from "./RtecMemberReviewPage";

const PROPOSAL_ID = "22222222-2222-2222-2222-222222222222";
const USER_ID = "33333333-3333-3333-3333-333333333333";
const GROUP_ID = "44444444-4444-4444-4444-444444444444";

function makeProposal(status: string) {
  return {
    id: PROPOSAL_ID,
    title: "RTEC Demo Proposal",
    status,
    proposalType: { id: "pt-1", name: "GIA" },
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    currentVersionId: "v-1",
    applicantUserId: "applicant-1",
    currentVersion: { id: "v-1", versionNumber: 1, isSubmitted: true, fieldValues: [] },
  };
}

vi.mock("../../hooks/useAuth", () => ({
  useAuth: vi.fn(() => ({
    user: { id: USER_ID, email: "member@dev.local", firstName: "R", lastName: "M", roles: ["RTEC_MEMBER"], mustChangePassword: false },
    role: "RTEC_MEMBER",
    isLoading: false,
    isAuthenticated: true,
    loginStaff: vi.fn(),
    logout: vi.fn(),
    refreshUser: vi.fn(),
  })),
}));

let mockGetMyReviewImpl: () => Promise<{ review: unknown }>;

vi.mock("../../lib/api", () => ({
  api: {
    get: vi.fn(() => Promise.resolve(mockProposal)),
  },
  workflowApi: {
    listRtecGroups: vi.fn(() =>
      Promise.resolve({
        groups: [
          {
            id: GROUP_ID,
            name: "GIA RTEC Committee",
            isActive: true,
            memberships: [{ id: "m-1", rtecGroupId: GROUP_ID, userId: USER_ID, roleInGroup: "MEMBER", isActive: true }],
          },
        ],
      }),
    ),
  },
  rtecApi: {
    getMyReview: vi.fn(() => mockGetMyReviewImpl()),
    saveReview: vi.fn(() => Promise.resolve({ review: { id: "r-1", isSubmitted: false, items: [] } })),
    submitReview: vi.fn(() => Promise.resolve({ review: { id: "r-1", isSubmitted: true, items: [] } })),
  },
}));

let mockProposal: ReturnType<typeof makeProposal>;

function renderPage(status: string) {
  mockProposal = makeProposal(status);
  return render(
    <MemoryRouter initialEntries={[`/rtec/reviews/${PROPOSAL_ID}`]}>
      <Routes>
        <Route path="/rtec/reviews/:proposalId" element={<RtecMemberReviewPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("RtecMemberReviewPage", () => {
  it("TC-RTEC-UI-01: status=UNDER_RTEC_REVIEW, no existing review — shows Overall Remarks and Save Draft", async () => {
    mockGetMyReviewImpl = () => Promise.reject(Object.assign(new Error("Not Found"), { status: 404 }));
    renderPage("UNDER_RTEC_REVIEW");

    expect(await screen.findByLabelText("Overall Remarks")).toBeInTheDocument();
    expect(screen.getByLabelText("Save Draft")).toBeInTheDocument();
  });

  it("TC-RTEC-UI-02: existing submitted review — Submit Review disabled / shows submitted state", async () => {
    mockGetMyReviewImpl = () =>
      Promise.resolve({
        review: {
          id: "r-1",
          proposalId: PROPOSAL_ID,
          rtecGroupId: GROUP_ID,
          reviewerUserId: USER_ID,
          status: "SUBMITTED",
          isSubmitted: true,
          submittedAt: "2026-07-09T00:00:00.000Z",
          overallRemarks: "Looks good.",
          items: [],
          createdAt: "2026-07-09T00:00:00.000Z",
          updatedAt: "2026-07-09T00:00:00.000Z",
        },
      });
    renderPage("UNDER_RTEC_REVIEW");

    const submitButton = await screen.findByLabelText("Submit Review");
    expect(submitButton).toBeDisabled();
    expect(screen.getAllByText("Review submitted").length).toBeGreaterThan(0);
  });

  it("TC-RTEC-UI-03: 403 from getMyReview — shows not-assigned message", async () => {
    mockGetMyReviewImpl = () => Promise.reject(Object.assign(new Error("Forbidden"), { status: 403 }));
    renderPage("UNDER_RTEC_REVIEW");

    expect(await screen.findByText("You are not assigned to review this proposal.")).toBeInTheDocument();
  });
});
