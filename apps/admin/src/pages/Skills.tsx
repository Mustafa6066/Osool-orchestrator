import { useState, useCallback } from 'react';
import { Puzzle, ToggleLeft, ToggleRight, RefreshCw, ChevronDown, ChevronUp, Bot } from 'lucide-react';
import { getSkills, toggleSkill, type Skill } from '../api/client';
import { usePolling } from '../hooks/usePolling';

function AgentBadge({ agent }: { agent: string }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-brand-500/10 text-brand-400 border border-brand-500/20">
      <Bot size={10} />
      {agent}
    </span>
  );
}

function SkillRow({ skill, onToggle }: { skill: Skill; onToggle: (id: string, enabled: boolean) => void }) {
  const [expanded, setExpanded] = useState(false);
  const [toggling, setToggling] = useState(false);
  const tools = Array.isArray(skill.toolsJson)
    ? (skill.toolsJson as Array<Record<string, unknown>>)
        .filter((tool) => typeof tool.name === 'string')
        .map((tool) => ({
          name: tool.name as string,
          description: typeof tool.description === 'string' ? tool.description : '',
        }))
    : [];

  async function handleToggle() {
    setToggling(true);
    try {
      await onToggle(skill.id, !skill.enabled);
    } finally {
      setToggling(false);
    }
  }

  return (
    <div className="bg-surface-card rounded-xl border border-border overflow-hidden">
      <div className="flex items-center gap-4 p-4">
        {/* Toggle */}
        <button
          onClick={handleToggle}
          disabled={toggling}
          title={skill.enabled ? 'Disable skill' : 'Enable skill'}
          className="shrink-0 text-zinc-400 hover:text-zinc-100 disabled:opacity-40 transition-colors"
        >
          {skill.enabled ? (
            <ToggleRight size={22} className="text-brand-400" />
          ) : (
            <ToggleLeft size={22} />
          )}
        </button>

        {/* Name + version */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-semibold text-zinc-100 truncate">{skill.name}</span>
            <span className="text-[10px] text-zinc-600 font-mono shrink-0">v{skill.version}</span>
            {!skill.enabled && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-500 border border-zinc-700 shrink-0">
                disabled
              </span>
            )}
          </div>
          {skill.description && (
            <p className="text-xs text-zinc-500 truncate">{skill.description}</p>
          )}
        </div>

        {/* Target agents */}
        <div className="hidden md:flex items-center gap-1.5 shrink-0">
          {(skill.targetAgents ?? []).map((a) => (
            <AgentBadge key={a} agent={a} />
          ))}
          {skill.targetAgents?.includes('*') && (
            <AgentBadge agent="all agents" />
          )}
        </div>

        {/* Expand button */}
        <button
          onClick={() => setExpanded((e) => !e)}
          className="shrink-0 text-zinc-600 hover:text-zinc-300 transition-colors"
        >
          {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        </button>
      </div>

      {expanded && (
        <div className="border-t border-border px-4 pb-4 pt-3 space-y-3">
          {skill.promptFragment && (
            <div>
              <p className="text-[10px] font-semibold text-zinc-600 uppercase tracking-widest mb-1.5">
                Prompt Fragment
              </p>
              <pre className="bg-surface rounded-lg p-3 text-xs text-zinc-400 font-mono whitespace-pre-wrap max-h-48 overflow-y-auto">
                {skill.promptFragment}
              </pre>
            </div>
          )}

          {tools.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-zinc-600 uppercase tracking-widest mb-1.5">
                Tools ({tools.length})
              </p>
              <div className="space-y-1">
                {tools.map((tool) => (
                  <div key={tool.name} className="flex items-start gap-2 text-xs">
                    <code className="text-brand-400 font-mono shrink-0">{tool.name}</code>
                    <span className="text-zinc-500">{tool.description}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {skill.config && Object.keys(skill.config).length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-zinc-600 uppercase tracking-widest mb-1.5">
                Config
              </p>
              <pre className="bg-surface rounded-lg p-3 text-xs text-zinc-400 font-mono max-h-32 overflow-y-auto">
                {JSON.stringify(skill.config, null, 2)}
              </pre>
            </div>
          )}

          <div className="flex gap-4 text-[10px] text-zinc-600">
            <span>Created {new Date(skill.createdAt).toLocaleString()}</span>
            <span>Updated {new Date(skill.updatedAt).toLocaleString()}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export function SkillsPage() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'enabled' | 'disabled'>('all');

  const load = useCallback(async () => {
    try {
      const data = await getSkills();
      setSkills(Array.isArray(data) ? data : []);
    } catch {
      // silently keep stale data on poll errors
    } finally {
      setLoading(false);
    }
  }, []);

  usePolling(load, 15_000);

  const handleToggle = useCallback(async (id: string, enabled: boolean) => {
    const updated = await toggleSkill(id, enabled);
    setSkills((prev) => prev.map((s) => (s.id === id ? updated : s)));
  }, []);

  const visible = skills.filter((s) => {
    if (filter === 'enabled') return s.enabled;
    if (filter === 'disabled') return !s.enabled;
    return true;
  });

  const enabledCount = skills.filter((s) => s.enabled).length;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-brand-500/10 flex items-center justify-center">
            <Puzzle size={17} className="text-brand-400" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-zinc-100">Skills Registry</h1>
            <p className="text-xs text-zinc-500">
              {enabledCount} of {skills.length} skills enabled
            </p>
          </div>
        </div>

        <button
          onClick={() => void load()}
          className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-100 transition-colors"
        >
          <RefreshCw size={13} />
          Refresh
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 mb-5 bg-surface-card rounded-lg p-1 w-fit border border-border">
        {(['all', 'enabled', 'disabled'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors capitalize ${
              filter === f
                ? 'bg-brand-500/20 text-brand-400'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-16 rounded-xl bg-surface-card border border-border animate-pulse" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div className="text-center py-16 text-zinc-600">
          <Puzzle size={28} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">No skills found</p>
        </div>
      ) : (
        <div className="space-y-2">
          {visible.map((skill) => (
            <SkillRow key={skill.id} skill={skill} onToggle={handleToggle} />
          ))}
        </div>
      )}
    </div>
  );
}
