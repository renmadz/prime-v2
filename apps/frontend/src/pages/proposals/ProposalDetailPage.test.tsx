import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import ProposalDetailPage from "./ProposalDetailPage";

const PROPOSAL_ID = "11111111-1111-1111-1111-111111111111";

function makeProposal(status: string) {
  return {
    id: PROPOSAL_ID,
    title: "Test Proposal",
    status,
    proposalType: { id: "pt-1", name: "GIA" },
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    currentVersionId: "v-1",
    applicantUserId: "applicant-1",
    currentVersion: {
      id: "v-1",
      versionNumber: 1,
      isSubmitted: true,
      fieldValues: [],
    },
  };
}

vi.mock("../../hooks/useAuth", () => ({
  useAuth: vi.fn(),
}));

vi.mock("../../lib/api", () => ({
  api: {
    get: vi.fn((path: string) => {
      if (path.endsWith("/attachments")) return Promise.resolve([]);
      return Promise.resolve(mockProposal);
    }),
  },
  phase9Api: {
    getComments: vi.fn(() => Promise.resolve([])),
    getVersions: vi.fn(() => Promise.resolve([])),
  },
  assignmentsApi: {
    list: vi.fn(() => Promise.resolve([])),
  },
  adminApi: {
    listUsers: vi.fn(() => Promise.resolve([])),
  },
  workflowApi: {
    getHistory: vi.fn(() => Promise.resolve({ history: [] })),
    listRtecGroups: vi.fn(() => Promise.resolve([])),
    acknowledge: vi.fn(),
    returnToApplicant: vi.fn(),
    endorseToRtec: vi.fn(),
    endorseToBudget: vi.fn(),
    returnToRtec: vi.fn(),
  },
}));

import { useAuth } from "../../hooks/useAuth";

let mockProposal: ReturnType<typeof makeProposal>;

function renderPage(role: string, status: string) {
  mockProposal = makeProposal(status);
  vi.mocked(useAuth).mockReturnValue({
    user: null,
    role,
    isLoading: false,
    isAuthenticated: true,
    loginStaff: vi.fn(),
    logout: vi.fn(),
    refreshUser: vi.fn(),
  } as unknown as ReturnType<typeof useAuth>);

  return render(
    <MemoryRouter initialEntries={[`/proposals/${PROPOSAL_ID}`]}>
      <Routes>
        <Route path="/proposals/:id" element={<ProposalDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ProposalDetailPage — focal workflow actions", () => {
  it('TC-FOCAL-01: role="PROJECT_FOCAL", status="SUBMITTED_TO_FOCAL" shows Acknowledge, not Return to Applicant', async () => {
    renderPage("PROJECT_FOCAL", "SUBMITTED_TO_FOCAL");
    expect(await screen.findByLabelText("Acknowledge proposal")).toBeInTheDocument();
    expect(screen.queryByLabelText("Return proposal to applicant")).not.toBeInTheDocument();
  });

  it('TC-FOCAL-02: role="PROJECT_FOCAL", status="UNDER_FOCAL_REVIEW" shows Return to Applicant and Endorse to RTEC', async () => {
    renderPage("PROJECT_FOCAL", "UNDER_FOCAL_REVIEW");
    expect(await screen.findByLabelText("Return proposal to applicant")).toBeInTheDocument();
    expect(screen.getByLabelText("Endorse proposal to RTEC")).toBeInTheDocument();
    // Backend (seed.ts) only allows ENDORSE_TO_BUDGET from RETURNED_TO_FOCAL_BY_RTEC,
    // not UNDER_FOCAL_REVIEW — button must not appear here or the action always 422s.
    expect(screen.queryByLabelText("Endorse proposal to budget")).not.toBeInTheDocument();
  });

  it('TC-FOCAL-04: role="PROJECT_FOCAL", status="RETURNED_TO_FOCAL_BY_RTEC" shows Endorse to Budget and Return to RTEC', async () => {
    renderPage("PROJECT_FOCAL", "RETURNED_TO_FOCAL_BY_RTEC");
    expect(await screen.findByLabelText("Endorse proposal to budget")).toBeInTheDocument();
    expect(screen.getByLabelText("Return proposal to RTEC")).toBeInTheDocument();
  });

  it('TC-FOCAL-03: role="APPLICANT" shows no focal action buttons', async () => {
    renderPage("APPLICANT", "UNDER_FOCAL_REVIEW");
    expect(await screen.findByText("Test Proposal")).toBeInTheDocument();
    expect(screen.queryByLabelText("Acknowledge proposal")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Return proposal to applicant")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Endorse proposal to RTEC")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Endorse proposal to budget")).not.toBeInTheDocument();
  });
});
