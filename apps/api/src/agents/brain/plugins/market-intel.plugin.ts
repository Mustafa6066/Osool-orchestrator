/**
 * Market Intelligence Plugin — market pulse, area benchmarks, price trends.
 *
 * Uses LOCATIONS + DEFAULT_LOCATION_ROI for baseline data. Enriches with
 * macro context (EGP devaluation, Ras El Hikma deal, infrastructure projects).
 */

import Anthropic from '@anthropic-ai/sdk';
import { getConfig } from '../../../config.js';
import { LOCATIONS, DEFAULT_LOCATION_ROI, DEVELOPERS } from '@osool/shared';
import type { AgentPlugin, AgentContext, AgentResult, PluginHealthStatus, ReasoningStep } from '@osool/shared';
import { trackLLMCost } from '../../../lib/llm-cost-tracker.js';

const MARKET_KEYWORDS = /\b(market|trend|growth|demand|supply|forecast|outlook|macro|economy|inflation|devaluation|boom|crash|bubble|سوق|اتجاه|نمو|طلب|عرض|تضخم|فقاعة)\b/i;
const AREA_KEYWORDS = /\b(area|zone|location|neighborhood|district|city|coast|north coast|new capital|new cairo|october|zayed|sahel|sokhna|منطقة|حي|مدينة|ساحل)\b/i;
const SUPPLY_KEYWORDS = /\b(new project|launch|upcoming|pipeline|under construction|مشروع جديد|إطلاق|قيد الإنشاء)\b/i;

const SYSTEM_PROMPT = `You are the Osool Market Intelligence Specialist — an expert in Egyptian real estate market dynamics.

Your expertise:
- Area-by-area market benchmarks and trends
- Macro-economic impact analysis (EGP exchange rate, interest rates, inflation)
- Supply pipeline tracking (new launches, under construction, delivery schedules)
- Demand indicators (transaction volumes, inquiry trends, seasonal patterns)
- Infrastructure catalysts (new roads, metro lines, airports, Ras El Hikma development)
- Market cycle positioning (accumulation, markup, distribution, markdown)

Current market data:
${LOCATIONS.map((l) => {
  const roi = DEFAULT_LOCATION_ROI[l.slug] || DEFAULT_LOCATION_ROI['new-cairo'];
  return `${l.name}: ${roi.avgPricePerSqm.toLocaleString()} EGP/sqm | 1Y: +${roi.priceChange1y}% | 3Y: +${roi.priceChange3y}% | 5Y: +${roi.priceChange5y}% | Yield: ${roi.rentalYieldPercent}% | Liquidity: ${roi.liquidityScore}/100 | Demand: ${roi.demandIndex}/100`;
}).join('\n')}

Developer supply pipeline:
${DEVELOPERS.map((d) => `${d.name}: ${d.projectCount} active projects, ${d.regions.join(', ')}`).join('\n')}

Macro context (2024-2025):
- EGP devalued ~50% in March 2024 (now ~49 EGP/USD)
- CBE raised interest rates to 27.25% (highest in decades)
- Ras El Hikma deal ($35B UAE investment) — transformative for North Coast
- New Capital Phase 1 government relocation in progress
- Real estate remains primary inflation hedge for Egyptian investors

Rules:
- Always reference specific data points from the benchmarks above.
- Distinguish between near-term (6-12mo) and medium-term (2-5Y) outlook.
- Flag market risks alongside opportunities.
- Note seasonal patterns (North Coast summer premium, Ramadan slowdown).
- Compare areas relative to each other for context.`;

export class MarketIntelPlugin implements AgentPlugin {
  readonly name = 'market-intel-v1';
  readonly slot = 'market-intel' as const;
  readonly version = '1.0.0';

  private anthropic: Anthropic;

  constructor() {
    this.anthropic = new Anthropic({ apiKey: getConfig().ANTHROPIC_API_KEY });
  }

  async shouldActivate(context: AgentContext): Promise<number> {
    const query = context.query.toLowerCase();

    // High for market/trend queries
    if (MARKET_KEYWORDS.test(query)) return 0.9;

    // High for area-specific queries (market context is always relevant)
    if (AREA_KEYWORDS.test(query)) return 0.7;

    // Medium for supply pipeline queries
    if (SUPPLY_KEYWORDS.test(query)) return 0.75;

    // Check intent
    if (context.intent) {
      const { type } = context.intent;
      if (type === 'investment_analysis') return 0.8;
      if (type === 'location_search') return 0.75;
      if (type === 'comparison') return 0.65;
    }

    // Market context adds value to most queries
    return 0.25;
  }

  async execute(context: AgentContext): Promise<AgentResult> {
    const startTime = Date.now();
    const reasoningChain: ReasoningStep[] = [];

    // Step 1: Identify relevant locations
    const mentionedLocations = LOCATIONS.filter(
      (l) =>
        context.query.toLowerCase().includes(l.name.toLowerCase()) ||
        context.query.toLowerCase().includes(l.slug),
    );

    // If no specific location, provide top performers
    const targetLocations =
      mentionedLocations.length > 0
        ? mentionedLocations
        : LOCATIONS.slice(0, 5); // Top 5 by default

    const locationData = targetLocations.map((l) => {
      const roi = DEFAULT_LOCATION_ROI[l.slug] || DEFAULT_LOCATION_ROI['new-cairo'];
      return { name: l.name, slug: l.slug, ...roi };
    });

    reasoningChain.push({
      stepName: 'location-identification',
      thought: 'Identify which locations to provide market intelligence for.',
      evidence: mentionedLocations.length > 0
        ? mentionedLocations.map((l) => `Mentioned: ${l.name}`)
        : ['No specific location — providing top 5 market overview'],
      conclusion: `Analyzing ${targetLocations.length} location(s): ${targetLocations.map((l) => l.name).join(', ')}.`,
      confidence: mentionedLocations.length > 0 ? 0.9 : 0.6,
    });

    // Step 2: Rank locations by 1Y performance
    const rankedLocations = [...locationData].sort((a, b) => b.priceChange1y - a.priceChange1y);

    reasoningChain.push({
      stepName: 'performance-ranking',
      thought: 'Rank locations by recent price appreciation for comparative context.',
      evidence: rankedLocations.slice(0, 3).map((l) => `${l.name}: +${l.priceChange1y}% (1Y)`),
      conclusion: `Top performer: ${rankedLocations[0].name} at +${rankedLocations[0].priceChange1y}% (1Y).`,
      confidence: 0.95,
    });

    // Step 3: Call Claude for market analysis
    const messages: Anthropic.Messages.MessageParam[] = [];
    if (context.history) {
      messages.push(...context.history.map((h) => ({ role: h.role, content: h.content })));
    }
    messages.push({
      role: 'user',
      content: `Provide market intelligence for this query:\n\n"${context.query}"\n\nLocation data: ${JSON.stringify(locationData)}\n\nProvide: market positioning, near-term outlook, key risk factors, and comparative analysis across locations.`,
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
      operation: 'market-intel-analysis',
      agentName: this.name,
      tokensIn: tokensUsed.input,
      tokensOut: tokensUsed.output,
      durationMs: Date.now() - startTime,
      sessionId: context.sessionId,
    });

    reasoningChain.push({
      stepName: 'market-analysis',
      thought: 'Generate comprehensive market intelligence report.',
      evidence: [`Locations analyzed: ${targetLocations.length}`, `Tokens: ${tokensUsed.input}in/${tokensUsed.output}out`],
      conclusion: 'Market intelligence report generated with trends and outlook.',
      confidence: 0.85,
    });

    return {
      pluginName: this.name,
      slot: this.slot,
      confidence: mentionedLocations.length > 0 ? 0.9 : 0.7,
      reasoningChain,
      output,
      data: {
        locations: locationData,
        topPerformer: rankedLocations[0],
      },
      uiActions: ['show-market-heatmap', 'show-trend-chart'],
      tokensUsed,
    };
  }

  async healthCheck(): Promise<PluginHealthStatus> {
    return {
      healthy: true,
      lastCheck: new Date().toISOString(),
      message: `${LOCATIONS.length} locations tracked, ROI data for ${Object.keys(DEFAULT_LOCATION_ROI).length} areas`,
    };
  }
}
