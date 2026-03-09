import { useState } from 'react';
import { getKeywords } from '../api/client';
import { usePolling } from '../hooks/usePolling';

type Keyword = {
  id: string;
  keyword: string;
  locale: string;
  searchVolume: number | null;
  difficulty: number | null;
  currentRank: number | null;
  targetRank: number | null;
  intent: string | null;
  createdAt: string;
};

type KeywordsResponse = {
  keywords: Keyword[];
  total: number;
  page: number;
  limit: number;
};

function DifficultyBar({ value }: { value: number }) {
  const color =
    value >= 80 ? 'bg-red-500' : value >= 50 ? 'bg-yellow-500' : 'bg-green-500';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-border rounded-full h-1.5">
        <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${value}%` }} />
      </div>
      <span className="text-xs text-gray-400 w-6 text-right">{value}</span>
    </div>
  );
}

export function KeywordsPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const limit = 30;

  const { data, error, loading, refresh } = usePolling<KeywordsResponse>(
    () => getKeywords({ page, limit, search: search || undefined }) as Promise<KeywordsResponse>,
    60_000,
  );

  const keywords = data?.keywords ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / limit);

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Keyword Intelligence</h1>
          <p className="text-sm text-gray-400 mt-1">{total} tracked keywords</p>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="text"
            placeholder="Search keywords…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="bg-surface-card border border-border rounded-lg px-4 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-400/50 w-64"
          />
          <button
            onClick={refresh}
            className="px-4 py-2 bg-surface-card border border-border text-sm text-gray-300 rounded-lg hover:bg-surface-hover transition-colors"
          >
            ↻ Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-xl px-6 py-4 mb-6">{error}</div>
      )}

      <div className="bg-surface-card rounded-xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wide">Keyword</th>
              <th className="text-left px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wide">Locale</th>
              <th className="text-right px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wide">Volume</th>
              <th className="text-left px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wide w-32">Difficulty</th>
              <th className="text-right px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wide">Rank</th>
              <th className="text-right px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wide">Target</th>
              <th className="text-left px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wide">Intent</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {loading && !data && [1,2,3,4,5,6].map((i) => (
              <tr key={i} className="animate-pulse">
                {[1,2,3,4,5,6,7].map((j) => (
                  <td key={j} className="px-6 py-4"><div className="h-4 bg-border rounded" /></td>
                ))}
              </tr>
            ))}
            {keywords.map((kw) => (
              <tr key={kw.id} className="hover:bg-surface-hover transition-colors">
                <td className="px-6 py-4 font-medium text-gray-200">{kw.keyword}</td>
                <td className="px-6 py-4 uppercase text-gray-500">{kw.locale}</td>
                <td className="px-6 py-4 text-right text-gray-300">
                  {kw.searchVolume?.toLocaleString() ?? '—'}
                </td>
                <td className="px-6 py-4">
                  {kw.difficulty != null ? (
                    <DifficultyBar value={kw.difficulty} />
                  ) : (
                    <span className="text-gray-600">—</span>
                  )}
                </td>
                <td className="px-6 py-4 text-right">
                  {kw.currentRank != null ? (
                    <span className={`font-semibold ${kw.currentRank <= 10 ? 'text-green-400' : kw.currentRank <= 30 ? 'text-yellow-400' : 'text-gray-400'}`}>
                      #{kw.currentRank}
                    </span>
                  ) : (
                    <span className="text-gray-600">—</span>
                  )}
                </td>
                <td className="px-6 py-4 text-right text-gray-500">
                  {kw.targetRank != null ? `#${kw.targetRank}` : '—'}
                </td>
                <td className="px-6 py-4">
                  {kw.intent ? (
                    <span className="bg-purple-500/10 text-purple-400 text-xs px-2 py-1 rounded-full">
                      {kw.intent}
                    </span>
                  ) : (
                    <span className="text-gray-600">—</span>
                  )}
                </td>
              </tr>
            ))}
            {!loading && keywords.length === 0 && (
              <tr>
                <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                  {search ? 'No keywords match your search' : 'No keywords tracked yet'}
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
