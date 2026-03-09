import { getAgents } from '../api/client';
import { usePolling } from '../hooks/usePolling';

type AgentInfo = {
  name: string;
  status: 'running' | 'idle' | 'error' | string;
  lastRun: string | null;
  nextRun: string | null;
  logs: { ts: string; message: string }[];
};

const STATUS_COLORS: Record<string, string> = {
  running: 'bg-green-500/20 text-green-400 border-green-500/30',
  idle: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
  error: 'bg-red-500/20 text-red-400 border-red-500/30',
};

function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_COLORS[status] ?? STATUS_COLORS.idle;
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${cls}`}>
      {status}
    </span>
  );
}

function AgentCard({ agent }: { agent: AgentInfo }) {
  return (
    <div className="bg-surface-card rounded-xl border border-border p-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="font-semibold text-white">{agent.name}</h3>
          <div className="mt-1">
            <StatusBadge status={agent.status} />
          </div>
        </div>
        <span className="text-2xl">🤖</span>
      </div>

      <div className="grid grid-cols-2 gap-4 text-sm mb-4">
        <div>
          <p className="text-gray-500">Last run</p>
          <p className="font-medium text-gray-300">
            {agent.lastRun ? new Date(agent.lastRun).toLocaleString() : '—'}
          </p>
        </div>
        <div>
          <p className="text-gray-500">Next run</p>
          <p className="font-medium text-gray-300">
            {agent.nextRun ? new Date(agent.nextRun).toLocaleString() : '—'}
          </p>
        </div>
      </div>

      {agent.logs.length > 0 && (
        <div>
          <p className="text-xs text-gray-500 mb-2 font-medium uppercase tracking-wide">Recent logs</p>
          <div className="bg-gray-950 rounded-lg p-3 space-y-1 max-h-40 overflow-y-auto">
            {agent.logs.slice(-8).map((log, i) => (
              <div key={i} className="flex gap-2 text-xs font-mono">
                <span className="text-gray-500 shrink-0">
                  {new Date(log.ts).toISOString().slice(11, 19)}
                </span>
                <span className="text-gray-300">{log.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function AgentsPage() {
  const { data, error, loading, refresh } = usePolling(getAgents, 30_000);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-white">Agents</h2>
          <p className="text-sm text-gray-400 mt-1">Autonomous agent health — refreshes every 30s</p>
        </div>
        <button
          onClick={refresh}
          className="px-4 py-2 bg-surface-card border border-border text-sm text-gray-300 rounded-lg hover:bg-surface-hover transition-colors"
        >
          ↻ Refresh
        </button>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-xl px-6 py-4 mb-6">
          {error}
        </div>
      )}

      {loading && !data && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="bg-surface-card rounded-xl border border-border p-6 animate-pulse">
              <div className="h-5 bg-border rounded w-1/2 mb-4" />
              <div className="h-4 bg-border rounded w-1/4 mb-6" />
              <div className="h-24 bg-border rounded" />
            </div>
          ))}
        </div>
      )}

      {data && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {data.agents.map((agent) => (
            <AgentCard key={agent.name} agent={agent as AgentInfo} />
          ))}
        </div>
      )}
    </div>
  );
}
