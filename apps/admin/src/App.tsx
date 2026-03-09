import { Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { Layout } from './components/Layout';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { DashboardPage } from './pages/Dashboard';
import { FunnelPage } from './pages/Funnel';
import { SEOPage } from './pages/SEO';
import { ChatSessionsPage } from './pages/ChatSessions';
import { WaitlistPage } from './pages/Waitlist';
import { LoginPage } from './pages/Login';
import { AgentsPage } from './pages/Agents';
import { CampaignsPage } from './pages/Campaigns';
import { IntentsPage } from './pages/Intents';
import { FeedbackLoopsPage } from './pages/FeedbackLoops';
import { LeadsPage } from './pages/Leads';
import { KeywordsPage } from './pages/Keywords';

function PrivateRoute() {
  const { authed, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <span className="text-gray-400 text-sm">Loading…</span>
      </div>
    );
  }
  return authed ? <Outlet /> : <Navigate to="/login" replace />;
}

function AuthWrapper() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<PrivateRoute />}>
          <Route element={<Layout />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/agents" element={<AgentsPage />} />
            <Route path="/funnel" element={<FunnelPage />} />
            <Route path="/campaigns" element={<CampaignsPage />} />
            <Route path="/intents" element={<IntentsPage />} />
            <Route path="/keywords" element={<KeywordsPage />} />
            <Route path="/feedback-loops" element={<FeedbackLoopsPage />} />
            <Route path="/seo" element={<SEOPage />} />
            <Route path="/chat-sessions" element={<ChatSessionsPage />} />
            <Route path="/waitlist" element={<WaitlistPage />} />
            <Route path="/leads" element={<LeadsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Route>
      </Routes>
    </AuthProvider>
  );
}

export function App() {
  return <AuthWrapper />;
}
