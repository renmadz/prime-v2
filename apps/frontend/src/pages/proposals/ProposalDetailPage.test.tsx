import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
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
    listRtecGroups: vi.fn(() => Promise.resolve({ groups: [] })),
    acknowledge: vi.fn(),
    returnToApplicant: vi.fn(),
    endorseToRtec: vi.fn(),
    endorseToBudget: vi.fn(),
    returnToRtec: vi.fn(),
  },
  phase12Api: {
    budgetOpen: vi.fn(),
    budgetReturn: vi.fn(),
    budgetEndorse: vi.fn(),
    budgetReEndorse: vi.fn(),
    accountingOpen: vi.fn(),
    accountingReturnToBudget: vi.fn(),
    accountingReturnToFocal: vi.fn(),
    accountingEndorseToRd: vi.fn(),
    rdOpen: vi.fn(),
    rdApprove: vi.fn(),
    rdReject: vi.fn(),
    rdDefer: vi.fn(),
    rdResume: vi.fn(),
    rdReturn: vi.fn(),
    focalReroute: vi.fn(),
  },
  exportApi: {
    generate: vi.fn(),
    getLatest: vi.fn(() => Promise.reject(Object.assign(new Error("Not Found"), { status: 404 }))),
  },
}));

import { useAuth } from "../../hooks/useAuth";
import { exportApi } from "../../lib/api";

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

describe("ProposalDetailPage — Phase 12 budget/accounting/RD workflow actions", () => {
  it('TC-BUDGET-UI-01: role="BUDGET_OFFICER", status="ENDORSED_TO_BUDGET" shows "Open for Review"', async () => {
    renderPage("BUDGET_OFFICER", "ENDORSED_TO_BUDGET");
    expect(await screen.findByLabelText("Open for Review")).toBeInTheDocument();
  });

  it('TC-BUDGET-UI-02: role="BUDGET_OFFICER", status="UNDER_BUDGET_REVIEW" shows Return to Focal and Endorse to Accounting', async () => {
    renderPage("BUDGET_OFFICER", "UNDER_BUDGET_REVIEW");
    expect(await screen.findByLabelText("Return to Focal")).toBeInTheDocument();
    expect(screen.getByLabelText("Endorse to Accounting")).toBeInTheDocument();
  });

  it('TC-RD-UI-01: role="REGIONAL_DIRECTOR", status="UNDER_RD_REVIEW" shows Approve, Reject, Defer, Return to Applicant', async () => {
    renderPage("REGIONAL_DIRECTOR", "UNDER_RD_REVIEW");
    expect(await screen.findByLabelText("Approve")).toBeInTheDocument();
    expect(screen.getByLabelText("Reject")).toBeInTheDocument();
    expect(screen.getByLabelText("Defer")).toBeInTheDocument();
    expect(screen.getByLabelText("Return to Applicant")).toBeInTheDocument();
  });
});

describe("ProposalDetailPage — Phase 13 document export", () => {
  it('TC-EXPORT-UI-01: status="APPROVED" shows "Download Export" button', async () => {
    renderPage("APPLICANT", "APPROVED");
    expect(await screen.findByLabelText("Generate and download proposal export")).toBeInTheDocument();
  });

  it('TC-EXPORT-UI-02: status="UNDER_RD_REVIEW" (not approved) hides the button and shows the approval message', async () => {
    renderPage("APPLICANT", "UNDER_RD_REVIEW");
    expect(await screen.findByText("Export is available once the proposal is approved.")).toBeInTheDocument();
    expect(screen.queryByLabelText("Generate and download proposal export")).not.toBeInTheDocument();
  });

  it('TC-EXPORT-UI-03: status="APPROVED", generate() resolves — window.open called with the presigned URL', async () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    vi.mocked(exportApi.generate).mockResolvedValueOnce({
      exportId: "exp-1",
      url: "https://mock-presigned-url/export.html",
      filename: "proposal-test.html",
      format: "HTML",
      generatedAt: "2026-07-09T00:00:00.000Z",
    });

    renderPage("APPLICANT", "APPROVED");
    const button = await screen.findByLabelText("Generate and download proposal export");
    button.click();

    await waitFor(() => {
      expect(openSpy).toHaveBeenCalledWith("https://mock-presigned-url/export.html", "_blank", "noopener,noreferrer");
    });

    openSpy.mockRestore();
  });
});
