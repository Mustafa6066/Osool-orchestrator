import { useState } from 'react';
import { getFeedbackLoops } from '../api/client';
import { usePolling } from '../hooks/usePolling';

type FeedbackEvent = {
  id: string;
  source: string;
  eventType: string;
  loopType: string | null;
  data: unknown;
  actionsTriggered: string[] | null;
  summary: string | null;
  runAt: string | null;
  createdAt: string;
};

type FeedbackLoopsResponse = {
  events: FeedbackEvent[];
  total: number;
  page: number;
  limit: number;
};

const LOOP_TYPE_COLORS: Record<string, string> = {
  keyword_seo_sync: 'bg-blue-500/10 text-blue-400',
  audience_performance_sync: 'bg-purple-500/10 text-purple-400',
  email_sequence_optimize: 'bg-orange-500/10 text-orange-400',
  lead_scoring_recalibrate: 'bg-green-500/10 text-green-400',
  content_gap_analysis: 'bg-pink-500/10 text-pink-400',
};

export function FeedbackLoopsPage() {
  const [page, setPage] = useState(1);
  const limit = 25;

  const { data, error, loading, refresh } = usePolling<FeedbackLoopsResponse>(
    () => getFeedbackLoops({ page, limit }) as Promise<FeedbackLoopsResponse>,
    60_000,
  );

  const events = data?.events ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / limit);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-white">Feedback Loops</h2>
          <p className="text-sm text-gray-400 mt-1">Autonomous optimization events — {total} total</p>
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

      <div className="space-y-3">
        {loading && !data && [1, 2, 3, 4].map((i) => (
          <div key={i} className="animate-pulse bg-surface-card rounded-xl border border-border p-5">
            <div className="h-4 bg-border rounded w-1/3 mb-3" />
            <div className="h-3 bg-border rounded w-2/3" />
          </div>
        ))}

        {events.map((ev) => (
          <div key={ev.id} className="bg-surface-card rounded-xl border border-border p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3 flex-wrap">
                {ev.loopType && (
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    LOOP_TYPE_COLORS[ev.loopType] ?? 'bg-gray-500/10 text-gray-400'
                  }`}>
                    {ev.loopType.replace(/_/g, ' ')}
                  </span>
                )}
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs text-gray-400 bg-surface-hover border border-border">
                  {ev.eventType}
                </span>
                <span className="text-xs text-gray-400">via {ev.source}</span>
              </div>
              <time className="text-xs text-gray-400 shrink-0">
                {new Date(ev.createdAt).toLocaleString()}
              </time>
            </div>

            {ev.summary && (
              <p className="mt-3 text-sm text-gray-300">{ev.summary}</p>
            )}

            {ev.actionsTriggered && ev.actionsTriggered.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {ev.actionsTriggered.map((action, i) => (
                  <span key={i} className="inline-flex items-center px-2 py-0.5 rounded text-xs font-mono bg-gray-950 text-green-400">
                    {action}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}

        {!loading && events.length === 0 && (
          <div className="bg-surface-card rounded-xl border border-border px-6 py-12 text-center text-gray-500">
            No feedback loop events yet
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-6 text-sm text-gray-400">
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
