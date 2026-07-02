import { BrowserRouter, Routes, Route } from "react-router-dom";
import AppShell from "./components/shell/AppShell";
import DashboardPage from "./pages/DashboardPage";
import LoginPage from "./pages/LoginPage";
import NotFoundPage from "./pages/NotFoundPage";
import ProposalListPage from "./pages/proposals/ProposalListPage";
import ProposalTypePage from "./pages/proposals/ProposalTypePage";
import ProposalFormPage from "./pages/proposals/ProposalFormPage";
import ProposalDetailPage from "./pages/proposals/ProposalDetailPage";
import ProposalHistoryPage from "./pages/proposals/ProposalHistoryPage";
import ProposalComparePage from "./pages/proposals/ProposalComparePage";
import { useAuth } from "./hooks/useAuth";

function DashboardRoute() {
  const { role } = useAuth();
  return (
    <AppShell role={role} title="Dashboard">
      <DashboardPage />
    </AppShell>
  );
}

function ProposalListRoute() {
  const { role } = useAuth();
  return (
    <AppShell role={role} title="My Proposals">
      <ProposalListPage />
    </AppShell>
  );
}

function ProposalTypeRoute() {
  const { role } = useAuth();
  return (
    <AppShell role={role} title="Select Proposal Type">
      <ProposalTypePage />
    </AppShell>
  );
}

function ProposalFormRoute() {
  const { role } = useAuth();
  return (
    <AppShell role={role} title="New Proposal">
      <ProposalFormPage />
    </AppShell>
  );
}

function ProposalDetailRoute() {
  const { role } = useAuth();
  return (
    <AppShell role={role} title="Proposal Detail">
      <ProposalDetailPage />
    </AppShell>
  );
}

function ProposalHistoryRoute() {
  const { role } = useAuth();
  return (
    <AppShell role={role} title="Change History">
      <ProposalHistoryPage />
    </AppShell>
  );
}

function ProposalCompareRoute() {
  const { role } = useAuth();
  return (
    <AppShell role={role} title="Compare Versions">
      <ProposalComparePage />
    </AppShell>
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
        <Route path="/dashboard" element={<DashboardRoute />} />
        <Route path="/proposals" element={<ProposalListRoute />} />
        <Route path="/proposals/new" element={<ProposalTypeRoute />} />
        <Route path="/proposals/new/:typeId" element={<ProposalFormRoute />} />
        <Route path="/proposals/:id" element={<ProposalDetailRoute />} />
        <Route path="/proposals/:id/history" element={<ProposalHistoryRoute />} />
        <Route path="/proposals/:id/compare" element={<ProposalCompareRoute />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  );
}
