import type { ReactNode } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import ProtectedRoute from "./components/auth/ProtectedRoute";
import ShellLayout from "./components/shell/ShellLayout";
import DashboardPage from "./pages/DashboardPage";
import LoginPage from "./pages/LoginPage";
import NotFoundPage from "./pages/NotFoundPage";
import NotificationsPage from "./pages/notifications/NotificationsPage";
import ProfilePage from "./pages/profile/ProfilePage";
import QueuePage from "./pages/queues/QueuePage";
import UsersPage from "./pages/admin/UsersPage";
import RolesPage from "./pages/admin/RolesPage";
import ProposalTypesPage from "./pages/admin/ProposalTypesPage";
import FormsPage from "./pages/admin/FormsPage";
import WorkflowPage from "./pages/admin/WorkflowPage";
import AuditLogsPage from "./pages/admin/AuditLogsPage";
import SystemPage from "./pages/admin/SystemPage";
import ProposalListPage from "./pages/proposals/ProposalListPage";
import ProposalTypePage from "./pages/proposals/ProposalTypePage";
import ProposalFormPage from "./pages/proposals/ProposalFormPage";
import ProposalDetailPage from "./pages/proposals/ProposalDetailPage";
import ProposalHistoryPage from "./pages/proposals/ProposalHistoryPage";
import ProposalComparePage from "./pages/proposals/ProposalComparePage";
import RtecMemberReviewPage from "./pages/rtec/RtecMemberReviewPage";
import RtecHeadConsolidationPage from "./pages/rtec/RtecHeadConsolidationPage";

function protectedShell(title: string, element: ReactNode) {
  return (
    <ProtectedRoute>
      <ShellLayout title={title}>{element}</ShellLayout>
    </ProtectedRoute>
  );
}

export default function App() {
  return (
    <BrowserRouter
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    >
      <Routes>
        <Route path="/" element={<LoginPage />} />
        <Route path="/login" element={<Navigate to="/" replace />} />

        <Route path="/dashboard" element={protectedShell("Dashboard", <DashboardPage />)} />
        <Route path="/proposals" element={protectedShell("Proposals", <ProposalListPage />)} />
        <Route path="/proposals/new" element={protectedShell("New Proposal", <ProposalTypePage />)} />
        <Route
          path="/proposals/new/:typeId"
          element={protectedShell("New Proposal", <ProposalFormPage />)}
        />
        <Route
          path="/proposals/:id"
          element={protectedShell("Proposal Detail", <ProposalDetailPage />)}
        />
        <Route
          path="/proposals/:id/history"
          element={protectedShell("Change History", <ProposalHistoryPage />)}
        />
        <Route
          path="/proposals/:id/compare"
          element={protectedShell("Compare Versions", <ProposalComparePage />)}
        />

        <Route
          path="/notifications"
          element={protectedShell("Notifications", <NotificationsPage />)}
        />
        <Route path="/profile" element={protectedShell("Profile", <ProfilePage />)} />

        <Route
          path="/queue"
          element={protectedShell(
            "My Queue",
            <QueuePage
              queueKey="focal"
              title="Project Focal Queue"
              description="Proposals assigned to you for completeness and substantive review."
            />,
          )}
        />
        <Route
          path="/rtec/queue"
          element={protectedShell(
            "RTEC Queue",
            <QueuePage
              queueKey="rtec"
              title="RTEC Queue"
              description="Proposals endorsed for technical committee review."
            />,
          )}
        />
        <Route
          path="/rtec/reviews"
          element={protectedShell(
            "My Reviews",
            <QueuePage
              queueKey="rtec_reviews"
              title="My RTEC Reviews"
              description="Proposals currently under your independent RTEC review."
            />,
          )}
        />
        <Route
          path="/rtec/consolidation"
          element={protectedShell(
            "RTEC Consolidation",
            <QueuePage
              queueKey="rtec_consolidation"
              title="RTEC Consolidation"
              description="Proposals ready for RTEC Head consolidation."
            />,
          )}
        />
        <Route
          path="/rtec/reviews/:proposalId"
          element={protectedShell("RTEC Review", <RtecMemberReviewPage />)}
        />
        <Route
          path="/rtec/consolidation/:proposalId"
          element={protectedShell("RTEC Consolidation", <RtecHeadConsolidationPage />)}
        />
        <Route
          path="/budget/queue"
          element={protectedShell(
            "Budget Queue",
            <QueuePage
              queueKey="budget"
              title="Budget Queue"
              description="Proposals awaiting budget review."
            />,
          )}
        />
        <Route
          path="/accounting/queue"
          element={protectedShell(
            "Accounting Queue",
            <QueuePage
              queueKey="accounting"
              title="Accounting Queue"
              description="Proposals awaiting accounting review."
            />,
          )}
        />
        <Route
          path="/rd/queue"
          element={protectedShell(
            "For Decision",
            <QueuePage
              queueKey="rd"
              title="Regional Director Queue"
              description="Proposals ready for final decision."
            />,
          )}
        />

        <Route path="/admin/users" element={protectedShell("Users", <UsersPage />)} />
        <Route path="/admin/roles" element={protectedShell("Roles", <RolesPage />)} />
        <Route
          path="/admin/proposal-types"
          element={protectedShell("Proposal Types", <ProposalTypesPage />)}
        />
        <Route path="/admin/forms" element={protectedShell("Forms", <FormsPage />)} />
        <Route
          path="/admin/workflow"
          element={protectedShell("Workflow Config", <WorkflowPage />)}
        />
        <Route path="/admin/audit" element={protectedShell("Audit Logs", <AuditLogsPage />)} />
        <Route path="/admin/system" element={protectedShell("System", <SystemPage />)} />

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  );
}
