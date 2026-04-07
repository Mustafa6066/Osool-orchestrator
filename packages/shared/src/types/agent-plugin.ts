/**
 * Agent Plugin Interface — typed domain-specialist plugin system.
 *
 * Inspired by Composio Agent-Orchestrator's 7-slot plugin architecture,
 * adapted for Osool's Egyptian real estate intelligence domain.
 *
 * Each plugin represents a domain-specialist agent that can be invoked
 * by the Consensus Router to contribute reasoning for a given query.
 */

// ── Plugin Slots ────────────────────────────────────────────────────────────────

/**
 * Domain-specialist slots for the Osool Hybrid Brain.
 *
 *  valuation   — pricing, deal scoring, XGBoost predictions, ROI analysis
 *  legal       — Egyptian real estate law, contract analysis, CBE compliance
 *  market-intel — market pulse, geopolitical context, macro data, area benchmarks
 *  psychology  — buyer psychology, objection handling, commitment ladder
 *  content     — SEO content, narrative generation, bilingual output
 *  routing     — intent classification, query routing, disambiguation
 */
export type AgentPluginSlot =
  | 'valuation'
  | 'legal'
  | 'market-intel'
  | 'psychology'
  | 'content'
  | 'routing';

// ── Agent Context ───────────────────────────────────────────────────────────────

/** Context passed to every agent plugin during execution. */
export interface AgentContext {
  /** The user's raw query / message */
  query: string;

  /** Extracted intent from the perception layer */
  intent?: {
    type: string;
    confidence: number;
    entities: Record<string, unknown>;
  };

  /** Session identifiers */
  sessionId: string;
  userId?: string;

  /** Conversation history (last N messages) */
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;

  /** Pre-fetched market data (avoid duplicate lookups) */
  marketPulse?: Record<string, unknown>;

  /** Lead profile from scoring */
  leadProfile?: {
    score: number;
    segment?: string;
    temperature?: 'hot' | 'warm' | 'cold';
  };

  /** ICP segment identifier */
  icpSegment?: string;

  /** Language preference */
  locale: 'en' | 'ar';

  /** Properties currently being discussed */
  activeProperties?: Array<Record<string, unknown>>;

  /** Extra context injected by the router */
  extra?: Record<string, unknown>;
}

// ── Agent Result ────────────────────────────────────────────────────────────────

/** Structured reasoning step within an agent's chain of thought. */
export interface ReasoningStep {
  stepName: string;
  thought: string;
  evidence: string[];
  conclusion: string;
  confidence: number; // 0.0 – 1.0
}

/** Result returned by each agent plugin after execution. */
export interface AgentResult {
  /** Which plugin produced this result */
  pluginName: string;
  slot: AgentPluginSlot;

  /** Overall confidence in this result (0.0–1.0) */
  confidence: number;

  /** Structured reasoning chain (for audit trail / admin dashboard) */
  reasoningChain: ReasoningStep[];

  /** The agent's contribution to the final response — plain text or structured */
  output: string;

  /** Structured data the agent wants to surface (e.g., scores, prices, comparisons) */
  data?: Record<string, unknown>;

  /** UI actions this agent recommends (charts, cards, alerts) */
  uiActions?: string[];

  /** Tokens consumed by this agent's LLM calls */
  tokensUsed?: { input: number; output: number; model: string };

  /** Errors encountered (non-fatal — agent can still return partial output) */
  warnings?: string[];
}

// ── Plugin Manifest ─────────────────────────────────────────────────────────────

/** Health status for a plugin. */
export interface PluginHealthStatus {
  healthy: boolean;
  lastCheck: string; // ISO 8601
  message?: string;
  latencyMs?: number;
}

/** Plugin manifest — every agent plugin must implement this interface. */
export interface AgentPlugin {
  /** Unique plugin name (e.g., 'valuation-v1', 'legal-egypt-v2') */
  readonly name: string;

  /** Which specialist slot this plugin fills */
  readonly slot: AgentPluginSlot;

  /** Semantic version */
  readonly version: string;

  /**
   * Given a query context, decide if this plugin should participate.
   * Returns a relevance score 0.0–1.0 (0 = skip, >0.3 = include).
   */
  shouldActivate(context: AgentContext): Promise<number>;

  /**
   * Execute the plugin's domain logic and return structured results.
   * Will only be called if shouldActivate() returned > 0.3.
   */
  execute(context: AgentContext): Promise<AgentResult>;

  /** Quick health check — used by the admin dashboard and /health endpoint. */
  healthCheck(): Promise<PluginHealthStatus>;
}

// ── Consensus Result ────────────────────────────────────────────────────────────

/** Result from the Consensus Router after merging multiple agent outputs. */
export interface ConsensusResult {
  /** Final merged narrative for the user */
  response: string;

  /** Which agents contributed, in order of confidence */
  contributors: Array<{
    pluginName: string;
    slot: AgentPluginSlot;
    confidence: number;
  }>;

  /** Full reasoning chains from all contributors (for persistence/audit) */
  reasoningChains: Record<string, ReasoningStep[]>;

  /** Merged UI actions (deduplicated) */
  uiActions: string[];

  /** Merged structured data from all agents */
  data: Record<string, unknown>;

  /** Total tokens consumed across all agents + final synthesis */
  totalTokens: { input: number; output: number };

  /** Total latency in milliseconds */
  latencyMs: number;
}

// ── Plugin Registry ─────────────────────────────────────────────────────────────

/** Configuration for a registered plugin in the system. */
export interface PluginRegistryEntry {
  plugin: AgentPlugin;
  enabled: boolean;
  priority: number; // lower = higher priority within the same slot
}

// ── LLM Cost Log ────────────────────────────────────────────────────────────────

/** Record of a single LLM API call for cost tracking. */
export interface LLMCostLogEntry {
  timestamp: string; // ISO 8601
  model: string;
  provider: 'anthropic' | 'openai' | 'ollama';
  operation: string; // e.g., 'valuation-reasoning', 'seo-generation', 'chat-synthesis'
  agentName?: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  sessionId?: string;
  durationMs: number;
}
