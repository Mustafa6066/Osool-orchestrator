/**
 * Consensus Router — multi-agent fan-out/merge brain for the Osool Hybrid Intelligence.
 *
 * Instead of routing a query to a single agent, the Consensus Router:
 *  1. Determines which domain plugins are relevant (via shouldActivate())
 *  2. Fans out to 2-4 plugins in parallel
 *  3. Merges results with confidence-weighted consensus
 *  4. Synthesizes a single coherent response via Claude
 *
 * Inspired by Composio Agent-Orchestrator's orchestrator→worker spawn pattern
 * and Repowise's multi-layer intelligence (graph + git + documentation + decision).
 */

import Anthropic from '@anthropic-ai/sdk';
import { getConfig } from '../../config.js';
import type {
  AgentPlugin,
  AgentContext,
  AgentResult,
  ConsensusResult,
  ReasoningStep,
  PluginRegistryEntry,
} from '@osool/shared';
import { getCircuitBreaker } from '@osool/shared';
import { getRedis } from '../../lib/redis.js';

// ── Plugin Registry ─────────────────────────────────────────────────────────────

const pluginRegistry: PluginRegistryEntry[] = [];

/** Register a domain plugin with the consensus router. */
export function registerPlugin(plugin: AgentPlugin, options?: { enabled?: boolean; priority?: number }): void {
  pluginRegistry.push({
    plugin,
    enabled: options?.enabled ?? true,
    priority: options?.priority ?? 10,
  });

  // Sort by priority (lower = higher priority)
  pluginRegistry.sort((a, b) => a.priority - b.priority);
}

/** Get all registered plugins. */
export function getRegisteredPlugins(): readonly PluginRegistryEntry[] {
  return pluginRegistry;
}

/** Enable/disable a plugin by name. */
export function setPluginEnabled(name: string, enabled: boolean): boolean {
  const entry = pluginRegistry.find((e) => e.plugin.name === name);
  if (entry) {
    entry.enabled = enabled;
    return true;
  }
  return false;
}

// ── Consensus Router ────────────────────────────────────────────────────────────

/** Min relevance score from shouldActivate() to include a plugin. */
const ACTIVATION_THRESHOLD = 0.3;

/** Max plugins to fan out to (prevents runaway costs). */
const MAX_CONCURRENT_PLUGINS = 4;

/** Per-plugin execution timeout (ms). */
const PLUGIN_TIMEOUT_MS = 15_000;

export class ConsensusRouter {
  private anthropic: Anthropic;
  private breaker = getCircuitBreaker('consensus-synthesis', {
    failureThreshold: 3,
    resetTimeoutMs: 60_000,
  });

  constructor() {
    this.anthropic = new Anthropic({ apiKey: getConfig().ANTHROPIC_API_KEY });
  }

  /**
   * Route a query through the multi-agent consensus pipeline.
   *
   * 1. Activation: Score all enabled plugins → select top N relevant ones
   * 2. Fan-out: Execute selected plugins in parallel with timeout
   * 3. Merge: Confidence-weighted merge of results
   * 4. Synthesize: Claude generates final coherent response from merged reasoning
   */
  async route(context: AgentContext): Promise<ConsensusResult> {
    const startTime = Date.now();

    // ── Step 1: Activation scoring ──────────────────────────────────────────
    const enabledPlugins = pluginRegistry.filter((e) => e.enabled);

    const activationScores = await Promise.all(
      enabledPlugins.map(async (entry) => {
        try {
          const score = await entry.plugin.shouldActivate(context);
          return { entry, score };
        } catch {
          return { entry, score: 0 };
        }
      }),
    );

    // Select top plugins above threshold, limited to MAX_CONCURRENT_PLUGINS
    const selectedPlugins = activationScores
      .filter((a) => a.score >= ACTIVATION_THRESHOLD)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_CONCURRENT_PLUGINS);

    // If no plugins activate, return a fallback response
    if (selectedPlugins.length === 0) {
      return this.fallbackResponse(context, startTime);
    }

    // Log to Redis for admin visibility
    const redis = getRedis();
    await redis.lpush(
      'consensus:activations',
      JSON.stringify({
        ts: new Date().toISOString(),
        query: context.query.slice(0, 200),
        activated: selectedPlugins.map((s) => ({ name: s.entry.plugin.name, score: s.score })),
      }),
    );
    await redis.ltrim('consensus:activations', 0, 99);

    // ── Step 2: Parallel fan-out with timeout ───────────────────────────────
    const results = await Promise.allSettled(
      selectedPlugins.map(({ entry }) => this.executeWithTimeout(entry.plugin, context)),
    );

    const successfulResults: AgentResult[] = [];
    const warnings: string[] = [];

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.status === 'fulfilled') {
        successfulResults.push(result.value);
      } else {
        const pluginName = selectedPlugins[i].entry.plugin.name;
        warnings.push(`Plugin "${pluginName}" failed: ${result.reason}`);
      }
    }

    // If all plugins failed, return fallback
    if (successfulResults.length === 0) {
      return this.fallbackResponse(context, startTime, warnings);
    }

    // ── Step 3: Confidence-weighted merge ────────────────────────────────────
    const mergedData = this.mergeResults(successfulResults);

    // ── Step 4: Synthesize final response via Claude ────────────────────────
    const synthesized = await this.synthesize(context, successfulResults, mergedData);

    // Collect token usage
    const totalTokens = successfulResults.reduce(
      (acc, r) => ({
        input: acc.input + (r.tokensUsed?.input ?? 0),
        output: acc.output + (r.tokensUsed?.output ?? 0),
      }),
      { input: synthesized.tokensIn, output: synthesized.tokensOut },
    );

    const consensusResult: ConsensusResult = {
      response: synthesized.text,
      contributors: successfulResults.map((r) => ({
        pluginName: r.pluginName,
        slot: r.slot,
        confidence: r.confidence,
      })),
      reasoningChains: Object.fromEntries(
        successfulResults.map((r) => [r.pluginName, r.reasoningChain]),
      ),
      uiActions: mergedData.uiActions,
      data: mergedData.data,
      totalTokens,
      latencyMs: Date.now() - startTime,
    };

    // Persist consensus result metadata in Redis for the admin dashboard
    await redis.lpush(
      'consensus:results',
      JSON.stringify({
        ts: new Date().toISOString(),
        sessionId: context.sessionId,
        contributors: consensusResult.contributors.length,
        latencyMs: consensusResult.latencyMs,
        totalTokens,
      }),
    );
    await redis.ltrim('consensus:results', 0, 199);

    return consensusResult;
  }

  /** Execute a single plugin with a timeout guard. */
  private async executeWithTimeout(plugin: AgentPlugin, context: AgentContext): Promise<AgentResult> {
    return new Promise<AgentResult>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`Plugin "${plugin.name}" timed out after ${PLUGIN_TIMEOUT_MS}ms`)),
        PLUGIN_TIMEOUT_MS,
      );

      plugin
        .execute(context)
        .then((result) => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch((err) => {
          clearTimeout(timer);
          reject(err);
        });
    });
  }

  /** Merge data and UI actions from multiple agent results. */
  private mergeResults(results: AgentResult[]): { data: Record<string, unknown>; uiActions: string[] } {
    const data: Record<string, unknown> = {};
    const uiActionSet = new Set<string>();

    // Sort by confidence (highest first) so higher-confidence agents take precedence for conflicting keys
    const sorted = [...results].sort((a, b) => b.confidence - a.confidence);

    for (const result of sorted) {
      if (result.data) {
        // Namespace data by plugin name to avoid conflicts
        data[result.pluginName] = result.data;
      }
      if (result.uiActions) {
        for (const action of result.uiActions) {
          uiActionSet.add(action);
        }
      }
    }

    return { data, uiActions: Array.from(uiActionSet) };
  }

  /** Synthesize a final coherent response from multiple agent outputs using Claude. */
  private async synthesize(
    context: AgentContext,
    results: AgentResult[],
    mergedData: { data: Record<string, unknown>; uiActions: string[] },
  ): Promise<{ text: string; tokensIn: number; tokensOut: number }> {
    // Sort by confidence for the synthesis prompt
    const sorted = [...results].sort((a, b) => b.confidence - a.confidence);

    const agentContributions = sorted
      .map((r) => {
        const reasoning = r.reasoningChain
          .map((step) => `  - ${step.stepName}: ${step.conclusion} (conf: ${step.confidence})`)
          .join('\n');

        return `## ${r.pluginName} (${r.slot}, confidence: ${r.confidence})
${r.output}

Reasoning:
${reasoning}`;
      })
      .join('\n\n---\n\n');

    const systemPrompt = `You are the Osool Consensus Synthesizer. You receive outputs from multiple domain-specialist AI agents and merge them into a single, coherent, actionable response for the user.

Rules:
- Prioritize higher-confidence agent outputs
- Resolve conflicts by favoring the specialist agent for that domain
- Never fabricate data — only use what agents provided
- Response language should match the user's locale: ${context.locale === 'ar' ? 'Arabic' : 'English'}
- Be warm, professional, and concise
- If agents disagree, note the range (e.g., "valuations range from X to Y")
- Include specific numbers, prices (in EGP), and actionable next steps`;

    return this.breaker.execute(async () => {
      const response = await this.anthropic.messages.create({
        model: getConfig().ANTHROPIC_MODEL,
        max_tokens: 1500,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: `User query: "${context.query}"

The following domain agents have analyzed this query:

${agentContributions}

Synthesize a single coherent response that addresses the user's needs, incorporating insights from all agents.`,
          },
        ],
      });

      const text = response.content
        .filter((block): block is Anthropic.Messages.TextBlock => block.type === 'text')
        .map((block) => block.text)
        .join('');

      return {
        text,
        tokensIn: response.usage.input_tokens ?? 0,
        tokensOut: response.usage.output_tokens ?? 0,
      };
    });
  }

  /** Fallback when no plugins activate or all fail. */
  private async fallbackResponse(
    context: AgentContext,
    startTime: number,
    warnings?: string[],
  ): Promise<ConsensusResult> {
    return {
      response: context.locale === 'ar'
        ? 'عذراً، لم أتمكن من معالجة طلبك بالكامل. يرجى إعادة صياغة سؤالك أو الاتصال بفريق الدعم.'
        : "I wasn't able to fully process your request. Please try rephrasing your question, or contact our support team for assistance.",
      contributors: [],
      reasoningChains: {},
      uiActions: [],
      data: { warnings: warnings ?? ['No domain agents activated for this query'] },
      totalTokens: { input: 0, output: 0 },
      latencyMs: Date.now() - startTime,
    };
  }

  /** Get health status for all registered plugins. */
  async getPluginHealth(): Promise<Array<{ name: string; slot: string; enabled: boolean; healthy: boolean; latencyMs?: number }>> {
    return Promise.all(
      pluginRegistry.map(async (entry) => {
        try {
          const health = await entry.plugin.healthCheck();
          return {
            name: entry.plugin.name,
            slot: entry.plugin.slot,
            enabled: entry.enabled,
            healthy: health.healthy,
            latencyMs: health.latencyMs,
          };
        } catch {
          return {
            name: entry.plugin.name,
            slot: entry.plugin.slot,
            enabled: entry.enabled,
            healthy: false,
          };
        }
      }),
    );
  }
}

// ── Singleton ───────────────────────────────────────────────────────────────────

let router: ConsensusRouter | null = null;

export function getConsensusRouter(): ConsensusRouter {
  if (!router) {
    router = new ConsensusRouter();
  }
  return router;
}
