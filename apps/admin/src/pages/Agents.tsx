import { getAgents } from '../api/client';
import { usePolling } from '../hooks/usePolling';
import { Bot, RotateCw } from 'lucide-react';

type AgentInfo = {
  name: string;
  status: 'running' | 'idle' | 'error' | string;
  lastRun: string | null;
  nextRun: string | null;
  logs: { ts: string; message: string }[];
};

const STATUS_COLORS: Record<string, string> = {
  running: 'bg-brand-500/10 text-brand-400 border-brand-500/20',
  idle: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
  error: 'bg-red-500/10 text-red-400 border-red-500/20',
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
    <div className="bg-surface-card rounded-xl border border-border p-5">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-zinc-100">{agent.name}</h3>
          <div className="mt-1.5">
            <StatusBadge status={agent.status} />
          </div>
        </div>
        <div className="w-8 h-8 rounded-lg bg-brand-500/10 flex items-center justify-center">
          <Bot size={15} className="text-brand-400" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 text-xs mb-4">
        <div>
          <p className="text-zinc-600 mb-0.5">Last run</p>
          <p className="font-medium text-zinc-300">
            {agent.lastRun ? new Date(agent.lastRun).toLocaleString() : '—'}
          </p>
        </div>
        <div>
          <p className="text-zinc-600 mb-0.5">Next run</p>
          <p className="font-medium text-zinc-300">
            {agent.nextRun ? new Date(agent.nextRun).toLocaleString() : '—'}
          </p>
        </div>
      </div>

      {agent.logs.length > 0 && (
        <div>
          <p className="text-[10px] text-zinc-600 mb-2 font-semibold uppercase tracking-widest">Recent logs</p>
          <div className="bg-surface rounded-lg p-3 space-y-1 max-h-40 overflow-y-auto">
            {agent.logs.slice(-8).map((log, i) => (
              <div key={i} className="flex gap-2 text-xs font-mono">
                <span className="text-zinc-600 shrink-0">
                  {new Date(log.ts).toISOString().slice(11, 19)}
                </span>
                <span className="text-zinc-400">{log.message}</span>
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
          <h2 className="text-xl font-semibold text-zinc-100">Agents</h2>
          <p className="text-xs text-zinc-500 mt-1">Autonomous agent health — refreshes every 30s</p>
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
