import { useState } from 'react';
import { getIntents, getIntentHeatmap } from '../api/client';
import { usePolling } from '../hooks/usePolling';

type IntentSignal = {
  id: string;
  sessionId: string | null;
  intentType: string;
  segment: string | null;
  confidence: number;
  message: string | null;
  createdAt: string;
};

type IntentsResponse = {
  intents: IntentSignal[];
  total: number;
  page: number;
  limit: number;
};

type HeatmapResponse = {
  matrix: Record<string, Record<string, number>>;
  days: number;
};

const CONFIDENCE_LABEL = (c: number) =>
  c >= 80 ? { label: 'High', cls: 'bg-green-500/10 text-green-400' }
  : c >= 50 ? { label: 'Med', cls: 'bg-yellow-500/10 text-yellow-400' }
  : { label: 'Low', cls: 'bg-zinc-500/10 text-zinc-400' };

const HEAT_COLOR = (v: number, max: number) => {
  if (max === 0 || v === 0) return 'bg-border';
  const pct = v / max;
  if (pct >= 0.8) return 'bg-brand-950 text-white';
  if (pct >= 0.6) return 'bg-brand-800 text-white';
  if (pct >= 0.4) return 'bg-brand-600 text-white';
  if (pct >= 0.2) return 'bg-brand-400 text-white';
  return 'bg-brand-100 text-zinc-800';
};

function IntentsList() {
  const [page, setPage] = useState(1);
  const limit = 20;

  const { data, error, loading } = usePolling<IntentsResponse>(
    () => getIntents({ page, limit }) as Promise<IntentsResponse>,
    60_000,
  );

  const intents = data?.intents ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / limit);

  return (
    <div>
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-xl px-6 py-4 mb-4">{error}</div>
      )}
      <div className="bg-surface-card rounded-xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left px-5 py-4 text-xs font-semibold text-zinc-600 uppercase tracking-widest">Type</th>
              <th className="text-left px-5 py-4 text-xs font-semibold text-zinc-600 uppercase tracking-widest">Segment</th>
              <th className="text-right px-5 py-4 text-xs font-semibold text-zinc-600 uppercase tracking-widest">Confidence</th>
              <th className="text-left px-5 py-4 text-xs font-semibold text-zinc-600 uppercase tracking-widest">Message preview</th>
              <th className="text-right px-5 py-4 text-xs font-semibold text-zinc-600 uppercase tracking-widest">Time</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {loading && !data && [1,2,3,4,5].map((i) => (
              <tr key={i} className="animate-pulse">
                {[1,2,3,4,5].map((j) => (
                  <td key={j} className="px-5 py-4"><div className="h-4 bg-border rounded" /></td>
                ))}
              </tr>
            ))}
            {intents.map((sig) => {
              const conf = CONFIDENCE_LABEL(sig.confidence);
              return (
                <tr key={sig.id} className="hover:bg-surface-hover">
                  <td className="px-5 py-3">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-brand-500/10 text-brand-400">
                      {sig.intentType}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-zinc-400">{sig.segment ?? '—'}</td>
                  <td className="px-5 py-3 text-right">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${conf.cls}`}>
                      {conf.label} {sig.confidence}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-zinc-300 max-w-xs truncate">
                    {sig.message ?? '—'}
                  </td>
                  <td className="px-5 py-3 text-right text-zinc-500">
                    {new Date(sig.createdAt).toLocaleString()}
                  </td>
                </tr>
              );
            })}
            {!loading && intents.length === 0 && (
              <tr><td colSpan={5} className="px-5 py-12 text-center text-zinc-500">No signals found</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm text-zinc-400">
          <span>Page {page} of {totalPages} ({total} total)</span>
          <div className="flex gap-2">
            <button
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
              className="px-3 py-1.5 border border-border rounded-lg hover:bg-surface-hover disabled:opacity-50 text-zinc-300"
            >
              ← Prev
            </button>
            <button
              disabled={page === totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="px-3 py-1.5 border border-border rounded-lg hover:bg-surface-hover disabled:opacity-50 text-zinc-300"
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Heatmap() {
  const [days, setDays] = useState(30);
  const { data, error, loading } = usePolling<HeatmapResponse>(
    () => getIntentHeatmap(days) as Promise<HeatmapResponse>,
    120_000,
  );

  const intentTypes = data ? Object.keys(data.matrix) : [];
  const allDates = data ? Object.values(data.matrix).flatMap((d) => Object.keys(d)) : [];
  const uniqueDates = [...new Set(allDates)].sort();
  const maxVal = intentTypes.reduce((m, it) =>
    Math.max(m, ...Object.values(data!.matrix[it] ?? {})), 0);

  if (loading && !data) return <div className="animate-pulse h-64 bg-border rounded-xl" />;
  if (error) return <div className="text-red-400 text-sm">{error}</div>;
  if (!data || intentTypes.length === 0) return <div className="text-zinc-600 text-xs py-8 text-center">No heatmap data</div>;

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xs text-zinc-500">Last</span>
        {[7, 14, 30, 60].map((d) => (
          <button
            key={d}
            onClick={() => setDays(d)}
            className={`px-3 py-1 text-sm rounded-lg border transition-colors ${
              days === d ? 'bg-brand-500 text-white border-brand-500' : 'border-border text-zinc-400 hover:text-zinc-100 hover:bg-surface-hover'
            }`}
          >
            {d}d
          </button>
        ))}
      </div>

      <div className="overflow-x-auto">
        <table className="text-xs">
          <thead>
            <tr>
              <th className="pr-3 py-1 text-left text-zinc-500 font-normal w-40">Intent</th>
              {uniqueDates.map((d) => (
                <th key={d} className="px-1 py-1 text-center text-zinc-400 font-normal" style={{ minWidth: 28 }}>
                  {d.slice(5)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {intentTypes.map((it) => (
              <tr key={it}>
                <td className="pr-3 py-0.5 text-zinc-300 font-medium whitespace-nowrap">{it}</td>
                {uniqueDates.map((d) => {
                  const v = data.matrix[it]?.[d] ?? 0;
                  return (
                    <td key={d} className="px-0.5 py-0.5">
                      <div
                        title={`${it} on ${d}: ${v}`}
                        className={`w-6 h-6 rounded flex items-center justify-center font-medium ${HEAT_COLOR(v, maxVal)}`}
                      >
                        {v || ''}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function IntentsPage() {
  const [tab, setTab] = useState<'list' | 'heatmap'>('list');

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-zinc-100">Intent Explorer</h2>
        <p className="text-xs text-zinc-500 mt-1">User intent signals captured from chat sessions</p>
      </div>

      <div className="flex gap-1 mb-6 bg-surface-card border border-border p-1 rounded-lg w-fit">
        {(['list', 'heatmap'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 text-sm font-medium rounded-md capitalize ${
              tab === t ? 'bg-surface-hover text-zinc-100' : 'text-zinc-500 hover:text-zinc-100'
            }`}
          >
            {t === 'list' ? 'List' : 'Heatmap'}
          </button>
        ))}
      </div>

      {tab === 'list' ? <IntentsList /> : <Heatmap />}
    </div>
  );
}
