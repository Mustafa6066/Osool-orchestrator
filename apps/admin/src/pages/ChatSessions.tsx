import { useState } from 'react';
import { getChatSessions } from '../api/client';
import { usePolling } from '../hooks/usePolling';
import { RotateCw } from 'lucide-react';

type ChatSession = {
  id: string;
  visitorId: string | null;
  locale: string;
  segment: string | null;
  leadScore: number | null;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
};

type ChatSessionsResponse = {
  sessions: ChatSession[];
  total: number;
  page: number;
  limit: number;
};

function scoreColor(score: number): string {
  if (score >= 80) return 'text-green-400 bg-green-500/10';
  if (score >= 60) return 'text-yellow-400 bg-yellow-500/10';
  return 'text-zinc-400 bg-zinc-500/10';
}

export function ChatSessionsPage() {
  const [page, setPage] = useState(1);
  const limit = 25;

  const { data, error, loading, refresh } = usePolling<ChatSessionsResponse>(
    () => getChatSessions({ page, limit }) as Promise<ChatSessionsResponse>,
    30_000,
  );

  const sessions = data?.sessions ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / limit);

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100">Chat Sessions</h1>
          <p className="text-xs text-zinc-500 mt-1">{total} total sessions</p>
        </div>
        <button
          onClick={refresh}
          className="flex items-center gap-2 px-3 py-2 bg-surface-card border border-border text-xs text-zinc-400 rounded-lg hover:text-zinc-100 hover:bg-surface-hover"
        >
          <RotateCw size={13} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-xl px-6 py-4 mb-6">{error}</div>
      )}

      <div className="bg-surface-card rounded-xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left px-6 py-4 text-xs font-semibold text-zinc-600 uppercase tracking-widest">Session</th>
              <th className="text-left px-6 py-4 text-xs font-semibold text-zinc-600 uppercase tracking-widest">Visitor</th>
              <th className="text-right px-6 py-4 text-xs font-semibold text-zinc-600 uppercase tracking-widest">Messages</th>
              <th className="text-left px-6 py-4 text-xs font-semibold text-zinc-600 uppercase tracking-widest">Score</th>
              <th className="text-left px-6 py-4 text-xs font-semibold text-zinc-600 uppercase tracking-widest">Segment</th>
              <th className="text-left px-6 py-4 text-xs font-semibold text-zinc-600 uppercase tracking-widest">Language</th>
              <th className="text-right px-6 py-4 text-xs font-semibold text-zinc-600 uppercase tracking-widest">Started</th>
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
            {sessions.map((s) => (
              <tr key={s.id} className="hover:bg-surface-hover transition-colors">
                <td className="px-6 py-4 font-mono text-xs text-zinc-400">{s.id.slice(0, 12)}…</td>
                <td className="px-6 py-4 font-mono text-xs text-zinc-500">{s.visitorId?.slice(0, 12) ?? '—'}…</td>
                <td className="px-6 py-4 text-right text-zinc-300">{s.messageCount}</td>
                <td className="px-6 py-4">
                  {s.leadScore != null ? (
                    <span className={`text-xs px-2 py-1 rounded-full font-semibold ${scoreColor(s.leadScore)}`}>
                      {s.leadScore}
                    </span>
                  ) : (
                    <span className="text-zinc-600">—</span>
                  )}
                </td>
                <td className="px-6 py-4">
                  {s.segment ? (
                    <span className="bg-brand-500/10 text-brand-400 text-xs px-2 py-1 rounded-full">
                      {s.segment.replace(/_/g, ' ')}
                    </span>
                  ) : (
                    <span className="text-zinc-600">—</span>
                  )}
                </td>
                <td className="px-6 py-4 uppercase text-zinc-500">{s.locale}</td>
                <td className="px-6 py-4 text-right text-zinc-500">
                  {new Date(s.createdAt).toLocaleString()}
                </td>
              </tr>
            ))}
            {!loading && sessions.length === 0 && (
              <tr>
                <td colSpan={7} className="px-6 py-12 text-center text-zinc-500">
                  No chat sessions yet
                </td>
              </tr>
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
