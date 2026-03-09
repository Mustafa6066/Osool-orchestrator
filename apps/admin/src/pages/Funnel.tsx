import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { getFunnel } from '../api/client';
import { usePolling } from '../hooks/usePolling';

type FunnelData = Awaited<ReturnType<typeof getFunnel>>;

export function FunnelPage() {
  const { data, error, loading, refresh } = usePolling<FunnelData>(getFunnel, 60_000);

  const stages = data?.stages ?? [];
  const maxCount = stages.length > 0 ? stages[0].count : 1;

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Funnel Analytics</h1>
          <p className="text-sm text-gray-400 mt-1">Conversion funnel from discovery to retention</p>
        </div>
        <button
          onClick={refresh}
          className="px-4 py-2 bg-surface-card border border-border text-sm text-gray-300 rounded-lg hover:bg-surface-hover transition-colors"
        >
          ↻ Refresh
        </button>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-xl px-6 py-4 mb-6">{error}</div>
      )}

      <div className="grid lg:grid-cols-2 gap-8 mb-10">
        <div className="bg-surface-card rounded-xl border border-border p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Conversion Funnel</h2>
          {loading && !data ? (
            <div className="animate-pulse space-y-3">
              {[1,2,3,4,5].map((i) => <div key={i} className="h-8 bg-border rounded" />)}
            </div>
          ) : (
            <div className="space-y-3">
              {stages.map((s) => (
                <div key={s.stage} className="flex items-center gap-4">
                  <div className="w-28 text-sm font-medium text-gray-300 capitalize">{s.stage}</div>
                  <div className="flex-1 bg-border rounded-full h-8 overflow-hidden">
                    <div
                      className="bg-brand-500 h-full rounded-full flex items-center justify-end pr-3"
                      style={{ width: `${Math.max(8, (s.count / maxCount) * 100)}%` }}
                    >
                      <span className="text-xs text-white font-medium">{s.count.toLocaleString()}</span>
                    </div>
                  </div>
                  <div className="w-16 text-sm text-gray-500 text-right">
                    {((s.count / maxCount) * 100).toFixed(1)}%
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-surface-card rounded-xl border border-border p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Daily Breakdown</h2>
          {data?.dailyBreakdown && data.dailyBreakdown.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={data.dailyBreakdown}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="date" stroke="#64748b" tick={{ fontSize: 11 }} />
                <YAxis stroke="#64748b" />
                <Tooltip contentStyle={{ backgroundColor: '#111827', border: '1px solid #1e293b', borderRadius: 8, color: '#e2e8f0' }} />
                <Bar dataKey="cnt" fill="#4a9eff" name="Events" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-64 text-gray-500 text-sm">
              {loading ? 'Loading...' : 'No daily breakdown data'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
