import { useState } from 'react';
import { getLeads } from '../api/client';
import { usePolling } from '../hooks/usePolling';

type Lead = {
  sessionId: string;
  score: number;
  tier: string;
  segment: string | null;
  intentCount: number;
  lastSeen: string;
};

type LeadsResponse = {
  leads: Lead[];
  total: number;
  page: number;
  limit: number;
};

const TIER_STYLES: Record<string, string> = {
  hot: 'bg-red-500/10 text-red-400 border-red-500/30',
  warm: 'bg-orange-500/10 text-orange-400 border-orange-500/30',
  nurture: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30',
  cold: 'bg-gray-500/10 text-gray-400 border-gray-500/30',
};

function ScoreBar({ score }: { score: number }) {
  const pct = Math.max(0, Math.min(100, score));
  const color = pct >= 85 ? 'bg-red-500' : pct >= 60 ? 'bg-orange-500' : pct >= 30 ? 'bg-yellow-500' : 'bg-gray-500';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-border rounded-full h-2">
        <div className={`h-2 rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-sm font-semibold text-gray-200 w-8 text-right">{score}</span>
    </div>
  );
}

export function LeadsPage() {
  const [page, setPage] = useState(1);
  const limit = 20;

  const { data, error, loading, refresh } = usePolling<LeadsResponse>(
    () => getLeads({ page, limit }) as Promise<LeadsResponse>,
    60_000,
  );

  const leads = data?.leads ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / limit);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-white">Leads</h2>
          <p className="text-sm text-gray-400 mt-1">{total} scored leads</p>
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

      <div className="bg-surface-card rounded-xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wide">Session</th>
              <th className="text-left px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wide">Score</th>
              <th className="text-left px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wide">Tier</th>
              <th className="text-left px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wide">Segment</th>
              <th className="text-right px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wide">Intents</th>
              <th className="text-right px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wide">Last seen</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {loading && !data && [1,2,3,4,5].map((i) => (
              <tr key={i} className="animate-pulse">
                {[1,2,3,4,5,6].map((j) => (
                  <td key={j} className="px-6 py-4"><div className="h-4 bg-border rounded" /></td>
                ))}
              </tr>
            ))}
            {leads.map((lead) => (
              <tr key={lead.sessionId} className="hover:bg-surface-hover">
                <td className="px-6 py-4 font-mono text-xs text-gray-400 max-w-[120px] truncate">
                  {lead.sessionId}
                </td>
                <td className="px-6 py-4 min-w-[160px]">
                  <ScoreBar score={lead.score} />
                </td>
                <td className="px-6 py-4">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border capitalize ${
                    TIER_STYLES[lead.tier] ?? TIER_STYLES.cold
                  }`}>
                    {lead.tier}
                  </span>
                </td>
                <td className="px-6 py-4 text-gray-300 capitalize">{lead.segment ?? '—'}</td>
                <td className="px-6 py-4 text-right text-gray-300">{lead.intentCount}</td>
                <td className="px-6 py-4 text-right text-gray-500">
                  {new Date(lead.lastSeen).toLocaleString()}
                </td>
              </tr>
            ))}
            {!loading && leads.length === 0 && (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                  No scored leads yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm text-gray-400">
          <span>Page {page} of {totalPages} ({total} total)</span>
          <div className="flex gap-2">
            <button
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
              className="px-3 py-1.5 border border-border rounded-lg hover:bg-surface-hover disabled:opacity-50 text-gray-300"
            >
              ← Prev
            </button>
            <button
              disabled={page === totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="px-3 py-1.5 border border-border rounded-lg hover:bg-surface-hover disabled:opacity-50 text-gray-300"
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
