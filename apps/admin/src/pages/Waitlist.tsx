import { useState } from 'react';
import { getWaitlist } from '../api/client';
import { usePolling } from '../hooks/usePolling';

type WaitlistEntry = {
  id: string;
  email: string;
  name: string | null;
  phone: string | null;
  segment: string | null;
  preferredLocations: string[] | null;
  budget: string | null;
  source: string | null;
  leadScore: number | null;
  createdAt: string;
};

type WaitlistResponse = {
  waitlist: WaitlistEntry[];
  total: number;
  page: number;
  limit: number;
};

export function WaitlistPage() {
  const [page, setPage] = useState(1);
  const limit = 25;

  const { data, error, loading, refresh } = usePolling<WaitlistResponse>(
    () => getWaitlist({ page, limit }) as Promise<WaitlistResponse>,
    60_000,
  );

  const entries = data?.waitlist ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / limit);

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Waitlist</h1>
          <p className="text-sm text-gray-400 mt-1">{total} total entries</p>
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
              <th className="text-left px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wide">Name</th>
              <th className="text-left px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wide">Email</th>
              <th className="text-left px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wide">Score</th>
              <th className="text-left px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wide">Segment</th>
              <th className="text-left px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wide">Locations</th>
              <th className="text-left px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wide">Source</th>
              <th className="text-right px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wide">Joined</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {loading && !data && [1,2,3,4,5].map((i) => (
              <tr key={i} className="animate-pulse">
                {[1,2,3,4,5,6,7].map((j) => (
                  <td key={j} className="px-6 py-4"><div className="h-4 bg-border rounded" /></td>
                ))}
              </tr>
            ))}
            {entries.map((w) => (
              <tr key={w.id} className="hover:bg-surface-hover transition-colors">
                <td className="px-6 py-4 font-medium text-gray-200">{w.name ?? '—'}</td>
                <td className="px-6 py-4 text-gray-400">{w.email}</td>
                <td className="px-6 py-4">
                  {w.leadScore != null ? (
                    <span className="text-green-400 bg-green-500/10 text-xs px-2 py-1 rounded-full font-semibold">
                      {w.leadScore}
                    </span>
                  ) : (
                    <span className="text-gray-600">—</span>
                  )}
                </td>
                <td className="px-6 py-4">
                  {w.segment ? (
                    <span className="bg-brand-500/10 text-brand-400 text-xs px-2 py-1 rounded-full">
                      {w.segment.replace(/_/g, ' ')}
                    </span>
                  ) : (
                    <span className="text-gray-600">—</span>
                  )}
                </td>
                <td className="px-6 py-4">
                  <div className="flex flex-wrap gap-1">
                    {(w.preferredLocations ?? []).map((l) => (
                      <span key={l} className="bg-border text-gray-300 text-xs px-2 py-0.5 rounded">{l}</span>
                    ))}
                  </div>
                </td>
                <td className="px-6 py-4 text-gray-500 text-xs">{w.source ?? '—'}</td>
                <td className="px-6 py-4 text-right text-gray-500">
                  {new Date(w.createdAt).toLocaleDateString()}
                </td>
              </tr>
            ))}
            {!loading && entries.length === 0 && (
              <tr>
                <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                  No waitlist entries yet
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
