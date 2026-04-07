/**
 * Valuation Plugin — pricing, deal scoring, ROI analysis.
 *
 * Uses DEVELOPERS (delivery rates, price/sqm, tier) and LOCATIONS (ROI data, yields)
 * to provide data-driven property valuations and investment analysis.
 */

import Anthropic from '@anthropic-ai/sdk';
import { getConfig } from '../../../config.js';
import { DEVELOPERS, LOCATIONS, DEFAULT_LOCATION_ROI } from '@osool/shared';
import type { AgentPlugin, AgentContext, AgentResult, PluginHealthStatus, ReasoningStep } from '@osool/shared';
import { trackLLMCost } from '../../../lib/llm-cost-tracker.js';

const VALUATION_KEYWORDS = /\b(price|cost|how much|value|worth|valuation|roi|return|yield|investment|deal|sqm|meter|per sqm|ثمن|سعر|كام|قيمة|عائد|استثمار|متر)\b/i;
const COMPARISON_KEYWORDS = /\b(compare|vs|versus|better deal|cheaper|more expensive|مقارنة|أرخص|أغلى)\b/i;

const SYSTEM_PROMPT = `You are the Osool Valuation Specialist — an expert Egyptian real estate pricing and investment analyst.

Your expertise:
- Price-per-sqm benchmarking across all Egyptian locations
- Developer delivery-rate weighting (higher delivery = lower risk premium)
- ROI projections using historical price appreciation data
- Deal scoring on a 1-100 scale based on location, developer, price, and market timing
- Rental yield analysis for income-seeking investors
- Installment plan NPV calculations

Available benchmark data (use these exact figures):
${LOCATIONS.map((l) => {
  const roi = DEFAULT_LOCATION_ROI[l.slug] || DEFAULT_LOCATION_ROI['new-cairo'];
  return `${l.name}: ${roi.avgPricePerSqm.toLocaleString()} EGP/sqm, 1Y change ${roi.priceChange1y}%, 3Y ${roi.priceChange3y}%, yield ${roi.rentalYieldPercent}%, liquidity ${roi.liquidityScore}/100`;
}).join('\n')}

Developer benchmarks:
${DEVELOPERS.map((d) => `${d.name}: ${d.avgPricePerSqm.toLocaleString()} EGP/sqm, ${d.avgDeliveryRatePercent}% delivery, ${d.tier}`).join('\n')}

Rules:
- Always cite specific numbers from the benchmarks above.
- All prices in EGP unless user specifies otherwise.
- When scoring deals, weight: location ROI (30%), developer reliability (25%), price vs benchmark (25%), market timing (20%).
- Flag deals priced >15% above location benchmark as "premium-priced — verify unique value proposition".
- For ROI projections, use conservative (1Y data * 0.8), base (1Y data), optimistic (1Y data * 1.2) scenarios.`;

export class ValuationPlugin implements AgentPlugin {
  readonly name = 'valuation-v1';
  readonly slot = 'valuation' as const;
  readonly version = '1.0.0';

  private anthropic: Anthropic;

  constructor() {
    this.anthropic = new Anthropic({ apiKey: getConfig().ANTHROPIC_API_KEY });
  }

  async shouldActivate(context: AgentContext): Promise<number> {
    const query = context.query.toLowerCase();

    // High relevance for direct pricing / ROI queries
    if (VALUATION_KEYWORDS.test(query)) return 0.9;

    // Medium for comparison queries (which involve pricing)
    if (COMPARISON_KEYWORDS.test(query)) return 0.7;

    // Check intent if available
    if (context.intent) {
      const { type } = context.intent;
      if (type === 'pricing_inquiry' || type === 'investment_analysis') return 0.95;
      if (type === 'comparison') return 0.75;
      if (type === 'purchase_intent') return 0.6;
    }

    // Low base relevance — pricing context is useful for most real estate queries
    return 0.2;
  }

  async execute(context: AgentContext): Promise<AgentResult> {
    const startTime = Date.now();
    const reasoningChain: ReasoningStep[] = [];

    // Step 1: Extract location/developer from query
    const matchedLocation = LOCATIONS.find(
      (l) =>
        context.query.toLowerCase().includes(l.name.toLowerCase()) ||
        context.query.toLowerCase().includes(l.slug),
    );
    const matchedDeveloper = DEVELOPERS.find(
      (d) =>
        context.query.toLowerCase().includes(d.name.toLowerCase()) ||
        context.query.toLowerCase().includes(d.slug),
    );

    reasoningChain.push({
      stepName: 'entity-extraction',
      thought: 'Identify location and developer from user query for benchmark lookup.',
      evidence: [
        matchedLocation ? `Location: ${matchedLocation.name}` : 'No specific location detected',
        matchedDeveloper ? `Developer: ${matchedDeveloper.name}` : 'No specific developer detected',
      ],
      conclusion: `Matched ${matchedLocation ? matchedLocation.name : 'general market'} / ${matchedDeveloper ? matchedDeveloper.name : 'all developers'}.`,
      confidence: matchedLocation || matchedDeveloper ? 0.9 : 0.5,
    });

    // Step 2: Gather benchmark data
    const benchmarkData: Record<string, unknown> = {};
    if (matchedLocation) {
      const roi = DEFAULT_LOCATION_ROI[matchedLocation.slug] || DEFAULT_LOCATION_ROI['new-cairo'];
      benchmarkData.location = { name: matchedLocation.name, ...roi };
    }
    if (matchedDeveloper) {
      benchmarkData.developer = {
        name: matchedDeveloper.name,
        avgPricePerSqm: matchedDeveloper.avgPricePerSqm,
        deliveryRate: matchedDeveloper.avgDeliveryRatePercent,
        tier: matchedDeveloper.tier,
      };
    }

    reasoningChain.push({
      stepName: 'benchmark-lookup',
      thought: 'Pull benchmark data for the identified entities.',
      evidence: Object.keys(benchmarkData).map((k) => `${k}: ${JSON.stringify(benchmarkData[k])}`),
      conclusion: `Retrieved ${Object.keys(benchmarkData).length} benchmark datasets.`,
      confidence: 0.95,
    });

    // Step 3: Call Claude for analysis
    const messages: Anthropic.Messages.MessageParam[] = [];
    if (context.history) {
      messages.push(...context.history.map((h) => ({ role: h.role, content: h.content })));
    }
    messages.push({
      role: 'user',
      content: `Analyze this query with the benchmark data provided in your system prompt:\n\n"${context.query}"\n\nBenchmark context: ${JSON.stringify(benchmarkData)}\n\nProvide: price benchmarks, deal score (1-100), ROI projections (conservative/base/optimistic), and actionable recommendation.`,
    });

    const response = await this.anthropic.messages.create({
      model: getConfig().ANTHROPIC_MODEL,
      max_tokens: 800,
      system: SYSTEM_PROMPT,
      messages,
    });

    const output = response.content
      .filter((b): b is Anthropic.Messages.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');

    const tokensUsed = {
      input: response.usage.input_tokens,
      output: response.usage.output_tokens,
      model: getConfig().ANTHROPIC_MODEL,
    };

    await trackLLMCost({
      model: tokensUsed.model,
      provider: 'anthropic',
      operation: 'valuation-analysis',
      agentName: this.name,
      tokensIn: tokensUsed.input,
      tokensOut: tokensUsed.output,
      durationMs: Date.now() - startTime,
      sessionId: context.sessionId,
    });

    reasoningChain.push({
      stepName: 'llm-analysis',
      thought: 'Generate valuation analysis with deal score and ROI projections.',
      evidence: [`Tokens: ${tokensUsed.input}in/${tokensUsed.output}out`, `Latency: ${Date.now() - startTime}ms`],
      conclusion: 'Valuation analysis complete with benchmarks and projections.',
      confidence: 0.85,
    });

    return {
      pluginName: this.name,
      slot: this.slot,
      confidence: matchedLocation || matchedDeveloper ? 0.9 : 0.7,
      reasoningChain,
      output,
      data: benchmarkData,
      uiActions: matchedLocation ? ['show-price-chart', 'show-roi-comparison'] : undefined,
      tokensUsed,
    };
  }

  async healthCheck(): Promise<PluginHealthStatus> {
    return {
      healthy: true,
      lastCheck: new Date().toISOString(),
      message: `${DEVELOPERS.length} developers, ${LOCATIONS.length} locations loaded`,
    };
  }
}
