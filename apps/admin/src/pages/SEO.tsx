import { useState } from 'react';
import { getSEOContent } from '../api/client';
import { usePolling } from '../hooks/usePolling';

type SEOItem = {
  id: string;
  slug: string;
  pageType: string;
  locale: string;
  title: string;
  status: string;
  generatedAt: string | null;
  publishedAt: string | null;
};

type SEOResponse = {
  content: SEOItem[];
  total: number;
  page: number;
  limit: number;
};

export function SEOPage() {
  const [page, setPage] = useState(1);
  const limit = 20;

  const { data, error, loading, refresh } = usePolling<SEOResponse>(
    () => getSEOContent({ page, limit }) as Promise<SEOResponse>,
    60_000,
  );

  const items = data?.content ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / limit);

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">SEO Pages</h1>
          <p className="text-sm text-gray-400 mt-1">{total} generated pages</p>
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
              <th className="text-left px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wide">Slug</th>
              <th className="text-left px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wide">Type</th>
              <th className="text-left px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wide">Locale</th>
              <th className="text-left px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wide">Status</th>
              <th className="text-left px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wide">Title</th>
              <th className="text-right px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wide">Generated</th>
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
            {items.map((item) => (
              <tr key={item.id} className="hover:bg-surface-hover transition-colors">
                <td className="px-6 py-4 font-mono text-xs text-gray-300">{item.slug}</td>
                <td className="px-6 py-4">
                  <span className="bg-blue-500/10 text-blue-400 text-xs px-2 py-1 rounded-full">
                    {item.pageType.replace(/_/g, ' ')}
                  </span>
                </td>
                <td className="px-6 py-4 uppercase text-gray-400">{item.locale}</td>
                <td className="px-6 py-4">
                  <span className={`text-xs px-2 py-1 rounded-full ${
                    item.status === 'published'
                      ? 'bg-green-500/10 text-green-400'
                      : 'bg-yellow-500/10 text-yellow-400'
                  }`}>
                    {item.status}
                  </span>
                </td>
                <td className="px-6 py-4 text-gray-300 max-w-xs truncate">{item.title}</td>
                <td className="px-6 py-4 text-right text-gray-500">
                  {item.generatedAt ? new Date(item.generatedAt).toLocaleDateString() : '—'}
                </td>
              </tr>
            ))}
            {!loading && items.length === 0 && (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                  No SEO content yet
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
