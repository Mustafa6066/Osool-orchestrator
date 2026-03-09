import { useState } from 'react';
import { getCampaigns, toggleCampaign } from '../api/client';
import { usePolling } from '../hooks/usePolling';

type Campaign = {
  id: string;
  name: string;
  type: string;
  platform: string;
  active: boolean;
  budget: number | null;
  spent: number | null;
  impressions: number | null;
  clicks: number | null;
  conversions: number | null;
  createdAt: string;
};

type CampaignsResponse = {
  campaigns: Campaign[];
};

export function CampaignsPage() {
  const { data, error, loading, refresh } = usePolling(
    () => getCampaigns() as Promise<CampaignsResponse>,
    60_000,
  );
  const [toggling, setToggling] = useState<Set<string>>(new Set());
  const [toggleError, setToggleError] = useState<string | null>(null);

  async function handleToggle(id: string, currentlyActive: boolean) {
    setToggling((prev) => new Set(prev).add(id));
    setToggleError(null);
    try {
      await toggleCampaign(id, !currentlyActive);
      await refresh();
    } catch (e) {
      setToggleError((e as Error).message);
    } finally {
      setToggling((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  const campaigns = data?.campaigns ?? [];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-white">Campaigns</h2>
          <p className="text-sm text-gray-400 mt-1">{campaigns.length} campaign{campaigns.length !== 1 ? 's' : ''}</p>
        </div>
        <button
          onClick={refresh}
          className="px-4 py-2 bg-surface-card border border-border text-sm text-gray-300 rounded-lg hover:bg-surface-hover transition-colors"
        >
          ↻ Refresh
        </button>
      </div>

      {(error || toggleError) && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-xl px-6 py-4 mb-6">
          {error ?? toggleError}
        </div>
      )}

      <div className="bg-surface-card rounded-xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wide">Name</th>
              <th className="text-left px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wide">Platform</th>
              <th className="text-left px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wide">Type</th>
              <th className="text-right px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wide">Budget</th>
              <th className="text-right px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wide">Spent</th>
              <th className="text-right px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wide">Impressions</th>
              <th className="text-right px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wide">Clicks</th>
              <th className="text-right px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wide">CVR</th>
              <th className="text-center px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wide">Active</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {loading && !data &&
              [1, 2, 3].map((i) => (
                <tr key={i} className="animate-pulse">
                  {[1,2,3,4,5,6,7,8,9].map((j) => (
                    <td key={j} className="px-6 py-4">
                      <div className="h-4 bg-border rounded" />
                    </td>
                  ))}
                </tr>
              ))}
            {campaigns.map((c) => {
              const cvr = c.clicks && c.conversions
                ? ((c.conversions / c.clicks) * 100).toFixed(1) + '%'
                : '—';
              return (
                <tr key={c.id} className="hover:bg-surface-hover transition-colors">
                  <td className="px-6 py-4 font-medium text-gray-200">{c.name}</td>
                  <td className="px-6 py-4 text-gray-400 capitalize">{c.platform}</td>
                  <td className="px-6 py-4 text-gray-400 capitalize">{c.type}</td>
                  <td className="px-6 py-4 text-right text-gray-300">
                    {c.budget ? `$${c.budget.toLocaleString()}` : '—'}
                  </td>
                  <td className="px-6 py-4 text-right text-gray-300">
                    {c.spent ? `$${c.spent.toLocaleString()}` : '—'}
                  </td>
                  <td className="px-6 py-4 text-right text-gray-300">
                    {c.impressions?.toLocaleString() ?? '—'}
                  </td>
                  <td className="px-6 py-4 text-right text-gray-300">
                    {c.clicks?.toLocaleString() ?? '—'}
                  </td>
                  <td className="px-6 py-4 text-right text-gray-300">{cvr}</td>
                  <td className="px-6 py-4 text-center">
                    <button
                      disabled={toggling.has(c.id)}
                      onClick={() => handleToggle(c.id, c.active)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none disabled:opacity-50 ${
                        c.active ? 'bg-green-500' : 'bg-gray-300'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          c.active ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </td>
                </tr>
              );
            })}
            {!loading && campaigns.length === 0 && (
              <tr>
                <td colSpan={9} className="px-6 py-12 text-center text-gray-500">
                  No campaigns found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
