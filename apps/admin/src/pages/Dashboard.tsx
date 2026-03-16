import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { getDashboard, getUnifiedDashboard } from '../api/client';
import { usePolling } from '../hooks/usePolling';

type DashboardData = Awaited<ReturnType<typeof getDashboard>>;
type UnifiedData = Awaited<ReturnType<typeof getUnifiedDashboard>>;

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
  const { data: unified } = usePolling<UnifiedData>(getUnifiedDashboard, 60_000);

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
          <span className="flex items-center gap-2 text-xs"><StatusDot ok={sys.dbStatus === 'healthy'} /> DB</span>
          <span className="flex items-center gap-2 text-xs"><StatusDot ok={sys.redisStatus === 'healthy'} /> Redis</span>
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
              <p className="text-xs text-zinc-300 font-medium">{(() => { const d = new Date(ts); return ts && ts !== 'never' && !isNaN(d.getTime()) ? d.toLocaleString() : '—'; })()}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Unified Platform + Lead Distribution */}
      {unified && (
        <div className="grid lg:grid-cols-2 gap-8 mt-10">
          {/* Platform Health */}
          <div className="bg-surface-card rounded-xl border border-border p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-zinc-300">Platform Health</h2>
              <span className="text-[10px] text-zinc-600">
                Updated {new Date(unified.lastUpdated).toLocaleTimeString()}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-zinc-500 mb-1">Properties</p>
                <p className="text-lg font-semibold text-zinc-100">{Number(unified.platform.totalProperties).toLocaleString()}</p>
              </div>
              <div>
                <p className="text-xs text-zinc-500 mb-1">Platform Users</p>
                <p className="text-lg font-semibold text-zinc-100">{Number(unified.platform.totalPlatformUsers).toLocaleString()}</p>
              </div>
              <div>
                <p className="text-xs text-zinc-500 mb-1">Transactions</p>
                <p className="text-lg font-semibold text-zinc-100">{Number(unified.platform.totalTransactions).toLocaleString()}</p>
              </div>
              <div>
                <p className="text-xs text-zinc-500 mb-1">Chat Volume</p>
                <p className="text-lg font-semibold text-zinc-100">{Number(unified.platform.chatVolume).toLocaleString()}</p>
              </div>
            </div>
            {unified.platform.avgResponseTime > 0 && (
              <div className="mt-4 pt-4 border-t border-border">
                <p className="text-xs text-zinc-500 mb-1">Avg Response Time</p>
                <p className="text-sm font-semibold text-zinc-200">{Number(unified.platform.avgResponseTime).toFixed(1)}s</p>
              </div>
            )}
          </div>

          {/* Lead Distribution */}
          <div className="bg-surface-card rounded-xl border border-border p-6">
            <h2 className="text-sm font-semibold text-zinc-300 mb-4">Lead Distribution</h2>
            {(() => {
              const ld = unified.orchestrator.leadDistribution;
              const total = ld.hot + ld.warm + ld.nurture + ld.cold;
              const COLORS = ['#ef4444', '#f59e0b', '#3b82f6', '#6b7280'];
              const pieData = [
                { name: 'Hot', value: ld.hot },
                { name: 'Warm', value: ld.warm },
                { name: 'Nurture', value: ld.nurture },
                { name: 'Cold', value: ld.cold },
              ].filter(d => d.value > 0);

              if (total === 0) {
                return <p className="text-xs text-zinc-600 text-center py-8">No scored leads yet</p>;
              }

              return (
                <div className="flex items-center gap-6">
                  <ResponsiveContainer width={140} height={140}>
                    <PieChart>
                      <Pie data={pieData} dataKey="value" cx="50%" cy="50%" innerRadius={35} outerRadius={60} paddingAngle={2}>
                        {pieData.map((_, i) => (
                          <Cell key={i} fill={COLORS[['Hot','Warm','Nurture','Cold'].indexOf(pieData[i].name)]} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ backgroundColor: '#111113', border: '1px solid #27272a', borderRadius: 10, color: '#f4f4f5', fontSize: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex-1 space-y-2">
                    {[
                      { label: 'Hot (≥85)', value: ld.hot, color: 'bg-red-500' },
                      { label: 'Warm (60–84)', value: ld.warm, color: 'bg-amber-500' },
                      { label: 'Nurture (30–59)', value: ld.nurture, color: 'bg-blue-500' },
                      { label: 'Cold (<30)', value: ld.cold, color: 'bg-zinc-500' },
                    ].map(tier => (
                      <div key={tier.label} className="flex items-center gap-2 text-xs">
                        <span className={`w-2 h-2 rounded-full ${tier.color}`} />
                        <span className="text-zinc-400 flex-1">{tier.label}</span>
                        <span className="text-zinc-200 font-semibold tabular-nums">{tier.value}</span>
                        <span className="text-zinc-600 w-10 text-right">{total > 0 ? Math.round(tier.value / total * 100) : 0}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
