/**
 * Typed API client for the admin dashboard.
 * Reads the auth token from localStorage and injects it in every request.
 */

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

function getToken(): string | null {
  return localStorage.getItem('admin_token');
}

function setToken(token: string) {
  localStorage.setItem('admin_token', token);
}

function clearToken() {
  localStorage.removeItem('admin_token');
  localStorage.removeItem('admin_refresh');
}

export function setRefreshToken(token: string) {
  localStorage.setItem('admin_refresh', token);
}

function getRefreshToken(): string | null {
  return localStorage.getItem('admin_refresh');
}

async function request<T>(
  path: string,
  opts: RequestInit = {},
): Promise<T> {
  const token = getToken();
  const res = await fetch(`${BASE_URL}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers ?? {}),
    },
  });

  if (res.status === 401) {
    // Try to refresh
    const refreshed = await tryRefresh();
    if (refreshed) {
      // Retry the original request
      return request<T>(path, opts);
    } else {
      clearToken();
      window.location.href = '/login';
      throw new Error('Session expired');
    }
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }

  return res.json() as Promise<T>;
}

async function tryRefresh(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;

  try {
    const res = await fetch(`${BASE_URL}/admin/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) return false;
    const data = await res.json() as { accessToken: string };
    setToken(data.accessToken);
    return true;
  } catch {
    return false;
  }
}

// ── Auth ──────────────────────────────────────────────────────────────────────

export async function login(email: string, password: string) {
  const data = await request<{ accessToken: string; refreshToken: string; expiresIn: number }>(
    '/admin/auth/login',
    { method: 'POST', body: JSON.stringify({ email, password }) },
  );
  setToken(data.accessToken);
  setRefreshToken(data.refreshToken);
  return data;
}

export function logout() {
  clearToken();
}

export function isAuthenticated(): boolean {
  return !!getToken();
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

export async function getDashboard() {
  return request<{
    system: { apiUptime: string; dbStatus: string; redisStatus: string; queueDepth: number; lastAgentRun: Record<string, string> };
    metrics: {
      totalUsers: number;
      totalChatSessions: number;
      totalIntentSignals: number;
      totalSEOPages: number;
      waitlistCount: number;
      today: { newUsers: number; chatSessions: number; intentSignals: number; emailsSent: number; waitlistJoins: number };
    };
    funnel: { discover: number; engage: number; qualify: number; convert: number; retain: number };
    topTrending: { developers: { name: string; count: number }[]; locations: { name: string; count: number }[] };
  }>('/admin/dashboard');
}

// ── Agents ────────────────────────────────────────────────────────────────────

export async function getAgents() {
  return request<{
    agents: { name: string; status: string; lastRun: string | null; nextRun: string | null; logs: unknown[] }[];
  }>('/admin/agents');
}

// ── Funnel ────────────────────────────────────────────────────────────────────

export async function getFunnel(params?: { startDate?: string; endDate?: string }) {
  const qs = new URLSearchParams(params as Record<string, string>).toString();
  return request<{
    stages: { stage: string; count: number }[];
    dailyBreakdown: { date: string; stage: string; cnt: number }[];
  }>(`/admin/funnel${qs ? `?${qs}` : ''}`);
}

// ── Keywords ──────────────────────────────────────────────────────────────────

export async function getKeywords(params?: { page?: number; limit?: number; search?: string }) {
  const qs = new URLSearchParams(Object.fromEntries(Object.entries(params ?? {}).map(([k, v]) => [k, String(v)]))).toString();
  return request<{ keywords: unknown[]; total: number; page: number; limit: number }>(
    `/admin/keywords${qs ? `?${qs}` : ''}`,
  );
}

// ── Campaigns ─────────────────────────────────────────────────────────────────

export async function getCampaigns() {
  return request<{ campaigns: unknown[] }>('/admin/campaigns');
}

export async function toggleCampaign(id: string, active: boolean) {
  return request<{ success: boolean }>(`/admin/campaigns/${id}/toggle`, {
    method: 'POST',
    body: JSON.stringify({ active }),
  });
}

// ── Feedback loops ────────────────────────────────────────────────────────────

export async function getFeedbackLoops(params?: { page?: number; limit?: number }) {
  const qs = new URLSearchParams(Object.fromEntries(Object.entries(params ?? {}).map(([k, v]) => [k, String(v)]))).toString();
  return request<{ events: unknown[]; total: number; page: number; limit: number }>(
    `/admin/feedback-loops${qs ? `?${qs}` : ''}`,
  );
}

// ── Intents ───────────────────────────────────────────────────────────────────

export async function getIntents(params?: { page?: number; limit?: number; intentType?: string; startDate?: string; endDate?: string }) {
  const qs = new URLSearchParams(Object.fromEntries(Object.entries(params ?? {}).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)]))).toString();
  return request<{ intents: unknown[]; total: number; page: number; limit: number }>(
    `/admin/intents${qs ? `?${qs}` : ''}`,
  );
}

export async function getIntentHeatmap(days = 30) {
  return request<{ matrix: Record<string, Record<string, number>>; days: number; since: string }>(
    `/admin/intents/heatmap?days=${days}`,
  );
}

// ── Leads ─────────────────────────────────────────────────────────────────────

export async function getLeads(params?: { page?: number; limit?: number }) {
  const qs = new URLSearchParams(Object.fromEntries(Object.entries(params ?? {}).map(([k, v]) => [k, String(v)]))).toString();
  return request<{ leads: unknown[]; total: number; page: number; limit: number }>(
    `/admin/leads${qs ? `?${qs}` : ''}`,
  );
}

// ── Waitlist ──────────────────────────────────────────────────────────────────

export async function getWaitlist(params?: { page?: number; limit?: number }) {
  const qs = new URLSearchParams(Object.fromEntries(Object.entries(params ?? {}).map(([k, v]) => [k, String(v)]))).toString();
  return request<{ waitlist: unknown[]; total: number; page: number; limit: number }>(
    `/admin/waitlist${qs ? `?${qs}` : ''}`,
  );
}

// ── SEO Content ───────────────────────────────────────────────────────────────

export async function getSEOContent(params?: { page?: number; limit?: number; status?: string }) {
  const qs = new URLSearchParams(Object.fromEntries(Object.entries(params ?? {}).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)]))).toString();
  return request<{ content: unknown[]; total: number; page: number; limit: number }>(
    `/admin/seo-content${qs ? `?${qs}` : ''}`,
  );
}

// ── Chat Sessions ─────────────────────────────────────────────────────────────

export async function getChatSessions(params?: { page?: number; limit?: number }) {
  const qs = new URLSearchParams(Object.fromEntries(Object.entries(params ?? {}).map(([k, v]) => [k, String(v)]))).toString();
  return request<{ sessions: unknown[]; total: number; page: number; limit: number }>(
    `/admin/chat-sessions${qs ? `?${qs}` : ''}`,
  );
}

// ── Email Sequences ───────────────────────────────────────────────────────────

export async function getEmailSequences() {
  return request<{ sequences: unknown[] }>('/admin/email-sequences');
}
