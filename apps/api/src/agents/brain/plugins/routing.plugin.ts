/**
 * Routing Plugin — intent classification, query routing, disambiguation.
 *
 * Wraps the existing intent-agent regex patterns with enhanced classification.
 * Determines which domain specialists should handle a query and scores routing confidence.
 * This plugin does NOT call an LLM — it's a fast, zero-token local classifier.
 */

import { classifyIntent } from '../../intent-agent.js';
import type { AgentPlugin, AgentContext, AgentResult, PluginHealthStatus, ReasoningStep, AgentPluginSlot } from '@osool/shared';

/** Map intent types to recommended plugin slots. */
const INTENT_TO_SLOTS: Record<string, AgentPluginSlot[]> = {
  pricing_inquiry: ['valuation', 'market-intel'],
  comparison: ['valuation', 'market-intel', 'content'],
  investment_analysis: ['valuation', 'market-intel', 'legal'],
  purchase_intent: ['valuation', 'legal', 'psychology'],
  location_search: ['market-intel', 'content'],
  financing: ['legal', 'valuation'],
  timeline_inquiry: ['market-intel', 'content'],
  specification_search: ['content', 'valuation'],
  general_inquiry: ['content'],
};

/** Disambiguation patterns — queries needing clarification. */
const AMBIGUOUS_PATTERNS = [
  // Very short queries
  { test: (q: string) => q.trim().split(/\s+/).length <= 2, reason: 'Query too short to determine specific intent.' },
  // Pronouns without context
  { test: (q: string) => /^(it|this|that|هو|ده|دي)\b/i.test(q.trim()), reason: 'Pronoun reference without clear context.' },
  // Multiple intents in one query
  {
    test: (q: string) => {
      let matches = 0;
      if (/price|cost|سعر/i.test(q)) matches++;
      if (/legal|law|قانون/i.test(q)) matches++;
      if (/area|location|منطقة/i.test(q)) matches++;
      if (/compare|vs|مقارنة/i.test(q)) matches++;
      return matches >= 3;
    },
    reason: 'Multiple distinct intents detected — may need to be broken into separate questions.',
  },
];

export class RoutingPlugin implements AgentPlugin {
  readonly name = 'routing-v1';
  readonly slot = 'routing' as const;
  readonly version = '1.0.0';

  async shouldActivate(_context: AgentContext): Promise<number> {
    // Routing always activates — it's a lightweight classifier
    return 0.99;
  }

  async execute(context: AgentContext): Promise<AgentResult> {
    const startTime = Date.now();
    const reasoningChain: ReasoningStep[] = [];

    // Step 1: Classify intent using existing pattern matcher
    const classification = classifyIntent(context.query);

    reasoningChain.push({
      stepName: 'intent-classification',
      thought: 'Classify user intent using regex pattern matching.',
      evidence: [
        `Intent: ${classification.intentType}`,
        `Confidence: ${classification.confidence}%`,
      ],
      conclusion: `Primary intent: ${classification.intentType} (${classification.confidence}% confidence).`,
      confidence: classification.confidence / 100,
    });

    // Step 2: Map to recommended plugin slots
    const recommendedSlots = INTENT_TO_SLOTS[classification.intentType] ?? ['content'];

    reasoningChain.push({
      stepName: 'slot-mapping',
      thought: 'Map classified intent to domain specialist plugin slots.',
      evidence: recommendedSlots.map((s) => `Slot: ${s}`),
      conclusion: `Recommended ${recommendedSlots.length} specialist(s): ${recommendedSlots.join(', ')}.`,
      confidence: 0.85,
    });

    // Step 3: Check for ambiguity
    const ambiguities = AMBIGUOUS_PATTERNS
      .filter((p) => p.test(context.query))
      .map((p) => p.reason);

    if (ambiguities.length > 0) {
      reasoningChain.push({
        stepName: 'disambiguation-check',
        thought: 'Check if query is ambiguous or needs clarification.',
        evidence: ambiguities,
        conclusion: `Found ${ambiguities.length} ambiguity flag(s) — some clarification may improve response quality.`,
        confidence: 0.7,
      });
    }

    // Step 4: Assess conversation context
    const messageCount = context.history?.length ?? 0;
    const hasLeadProfile = !!context.leadProfile;
    const conversationDepth = messageCount > 10 ? 'deep' : messageCount > 4 ? 'engaged' : messageCount > 0 ? 'early' : 'new';

    reasoningChain.push({
      stepName: 'context-assessment',
      thought: 'Assess conversation depth and available context for routing.',
      evidence: [
        `Messages: ${messageCount}`,
        `Conversation depth: ${conversationDepth}`,
        `Lead profile available: ${hasLeadProfile}`,
        `ICP segment: ${context.icpSegment ?? 'unknown'}`,
      ],
      conclusion: `${conversationDepth} conversation with ${hasLeadProfile ? 'lead profile' : 'no lead profile'}.`,
      confidence: 0.9,
    });

    const output = [
      `**Intent**: ${classification.intentType} (${classification.confidence}%)`,
      `**Recommended specialists**: ${recommendedSlots.join(', ')}`,
      `**Conversation depth**: ${conversationDepth}`,
      ambiguities.length > 0 ? `**Ambiguity flags**: ${ambiguities.join('; ')}` : null,
    ]
      .filter(Boolean)
      .join('\n');

    return {
      pluginName: this.name,
      slot: this.slot,
      confidence: classification.confidence / 100,
      reasoningChain,
      output,
      data: {
        intentType: classification.intentType,
        intentConfidence: classification.confidence,
        recommendedSlots,
        ambiguities,
        conversationDepth,
      },
      // No tokensUsed — this is a zero-token local classifier
    };
  }

  async healthCheck(): Promise<PluginHealthStatus> {
    // Verify the intent classifier is functional
    const testResult = classifyIntent('How much does a property cost in New Cairo?');
    return {
      healthy: testResult.intentType === 'pricing_inquiry',
      lastCheck: new Date().toISOString(),
      message: `Intent classifier operational, ${Object.keys(INTENT_TO_SLOTS).length} intent types mapped`,
      latencyMs: 0,
    };
  }
}
