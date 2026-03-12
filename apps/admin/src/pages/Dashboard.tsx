import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { getDashboard } from '../api/client';
import { usePolling } from '../hooks/usePolling';

type DashboardData = Awaited<ReturnType<typeof getDashboard>>;

function MetricCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-surface-card rounded-xl border border-border p-5">
      <p className="text-xs font-medium text-zinc-500 mb-2 uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-semibold text-zinc-100">{typeof value === 'number' ? value.toLocaleString() : value}</p>
      {sub && <p className="text-xs mt-1.5 text-zinc-600">{sub}</p>}
    </div>
  );
}

function StatusDot({ ok }: { ok: boolean }) {
  return <span className={`inline-block w-2 h-2 rounded-full ${ok ? 'bg-green-400' : 'bg-red-400'}`} />;
}

export function DashboardPage() {
  const { data, error, loading } = usePolling<DashboardData>(getDashboard, 30_000);

  if (loading && !data) {
    return (
      <div>
        <h1 className="text-xl font-semibold text-zinc-100 mb-8">Dashboard</h1>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="bg-surface-card rounded-xl border border-border p-5 animate-pulse">
              <div className="h-3 bg-border rounded w-1/2 mb-3" />
              <div className="h-7 bg-border rounded w-1/3" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div>
        <h1 className="text-xl font-semibold text-zinc-100 mb-8">Dashboard</h1>
        <div className="bg-red-500/8 border border-red-500/20 text-red-400 text-xs rounded-xl px-6 py-4">{error}</div>
      </div>
    );
  }

  const m = data!.metrics;
  const sys = data!.system;
  const funnel = data!.funnel;
  const trending = data!.topTrending;

  const funnelData = [
    { stage: 'Discover', count: funnel.discover },
    { stage: 'Engage', count: funnel.engage },
    { stage: 'Qualify', count: funnel.qualify },
    { stage: 'Convert', count: funnel.convert },
    { stage: 'Retain', count: funnel.retain },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-xl font-semibold text-zinc-100">Dashboard</h1>
        <div className="flex items-center gap-4 text-zinc-500">
          <span className="flex items-center gap-2 text-xs"><StatusDot ok={sys.dbStatus === 'ok'} /> DB</span>
          <span className="flex items-center gap-2 text-xs"><StatusDot ok={sys.redisStatus === 'ok'} /> Redis</span>
          <span className="text-xs">Queue: {sys.queueDepth}</span>
        </div>
      </div>

      {/* Metrics cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-6 mb-10">
        <MetricCard label="Total Users" value={m.totalUsers} sub={`+${m.today.newUsers} today`} />
        <MetricCard label="Chat Sessions" value={m.totalChatSessions} sub={`+${m.today.chatSessions} today`} />
        <MetricCard label="Intent Signals" value={m.totalIntentSignals} sub={`+${m.today.intentSignals} today`} />
        <MetricCard label="SEO Pages" value={m.totalSEOPages} />
        <MetricCard label="Waitlist Size" value={m.waitlistCount} sub={`+${m.today.waitlistJoins} today`} />
        <MetricCard label="Emails Sent Today" value={m.today.emailsSent} />
      </div>

      <div className="grid lg:grid-cols-2 gap-8 mb-10">
        {/* Funnel chart */}
        <div className="bg-surface-card rounded-xl border border-border p-6">
          <h2 className="text-sm font-semibold text-zinc-300 mb-4">Funnel Overview</h2>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={funnelData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis type="number" stroke="#52525b" tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="stage" width={80} stroke="#52525b" tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={{ backgroundColor: '#111113', border: '1px solid #27272a', borderRadius: 10, color: '#f4f4f5', fontSize: 12 }} />
              <Bar dataKey="count" fill="#10b981" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Trending */}
        <div className="bg-surface-card rounded-xl border border-border p-6">
          <h2 className="text-sm font-semibold text-zinc-300 mb-4">Trending Now</h2>
          <div className="grid grid-cols-2 gap-6">
            <div>
              <h3 className="text-[10px] font-semibold text-zinc-600 uppercase tracking-widest mb-3">Top Developers</h3>
              <div className="space-y-2">
                {trending.developers.slice(0, 5).map((d, i) => (
                  <div key={d.name} className="flex items-center justify-between text-xs">
                    <span className="text-zinc-400"><span className="text-zinc-600 mr-1.5">{i + 1}.</span>{d.name}</span>
                    <span className="text-brand-400 font-semibold tabular-nums">{d.count}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h3 className="text-[10px] font-semibold text-zinc-600 uppercase tracking-widest mb-3">Top Locations</h3>
              <div className="space-y-2">
                {trending.locations.slice(0, 5).map((l, i) => (
                  <div key={l.name} className="flex items-center justify-between text-xs">
                    <span className="text-zinc-400"><span className="text-zinc-600 mr-1.5">{i + 1}.</span>{l.name}</span>
                    <span className="text-brand-400 font-semibold tabular-nums">{l.count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Agent status */}
      <div className="bg-surface-card rounded-xl border border-border p-6">
        <h2 className="text-sm font-semibold text-zinc-300 mb-4">Agent Last Runs</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {Object.entries(sys.lastAgentRun).map(([name, ts]) => (
            <div key={name}>
              <p className="text-xs text-zinc-500 capitalize mb-0.5">{name.replace(/([A-Z])/g, ' $1').trim()}</p>
              <p className="text-xs text-zinc-300 font-medium">{ts ? new Date(ts).toLocaleString() : '—'}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
