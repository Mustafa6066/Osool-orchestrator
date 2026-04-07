/**
 * Psychology Plugin — buyer psychology, objection handling, commitment ladder.
 *
 * Adapts communication strategy based on ICP segment, lead temperature,
 * and conversation stage to maximize conversion while maintaining trust.
 */

import Anthropic from '@anthropic-ai/sdk';
import { getConfig } from '../../../config.js';
import { ICP_SEGMENTS } from '@osool/shared';
import type { AgentPlugin, AgentContext, AgentResult, PluginHealthStatus, ReasoningStep } from '@osool/shared';
import { trackLLMCost } from '../../../lib/llm-cost-tracker.js';

const OBJECTION_KEYWORDS = /\b(expensive|too much|can't afford|not sure|need time|think about|later|worried|risk|safe|guarantee|concerned|غالي|مش متأكد|محتاج وقت|خايف|ضمان|أمان)\b/i;
const URGENCY_KEYWORDS = /\b(now|today|ready|urgent|quickly|soon|immediately|دلوقتي|النهارده|جاهز|بسرعة|حالا)\b/i;
const TRUST_KEYWORDS = /\b(trust|reliable|reputation|reviews|scam|fraud|legitimate|ثقة|سمعة|نصب|احتيال|موثوق)\b/i;

const SYSTEM_PROMPT = `You are the Osool Psychology Specialist — an expert in buyer psychology for high-value Egyptian real estate transactions.

Your expertise:
- Buyer commitment ladder: Awareness → Interest → Evaluation → Decision → Action → Advocacy
- Objection handling frameworks tailored to Egyptian market concerns
- ICP-specific communication strategies
- Cultural nuances in Egyptian property buying (family decision-making, social proof, wasta)
- Loss aversion triggers (price increase warnings, limited availability)
- Trust-building through transparency and data-backed recommendations

ICP Segment Profiles:
${ICP_SEGMENTS.map((s) => `${s.label} (${s.segment}):
  Budget: ${s.budgetRange.min.toLocaleString()}-${s.budgetRange.max.toLocaleString()} EGP
  Goals: ${s.investmentGoal}
  Risk: ${s.riskTolerance}
  Timeline: ${s.decisionTimeline}
  Preferred: ${s.preferredLocations.join(', ')}`).join('\n\n')}

Objection handling strategies:
1. Price objection → Reframe as investment (show ROI data), offer installment plans, compare price/sqm to area benchmark
2. Timing objection → Urgency via price appreciation data, limited inventory, upcoming launches
3. Trust objection → Developer delivery rates, project track record, Osool verification process
4. Location objection → Infrastructure roadmap, price trajectory, upcoming amenities
5. Decision paralysis → Narrow options to 2-3, side-by-side comparison, "if you had to choose today"

Rules:
- Never be pushy or manipulative — Egyptian buyers value relationship and trust over hard selling.
- Adapt tone to the buyer's stage on the commitment ladder.
- For hot leads (score >70), be direct with next steps. For warm leads, educate and build confidence.
- Acknowledge family involvement in decision-making naturally.
- Use social proof appropriately (X other buyers chose this compound, Y% price increase since launch).`;

export class PsychologyPlugin implements AgentPlugin {
  readonly name = 'psychology-v1';
  readonly slot = 'psychology' as const;
  readonly version = '1.0.0';

  private anthropic: Anthropic;

  constructor() {
    this.anthropic = new Anthropic({ apiKey: getConfig().ANTHROPIC_API_KEY });
  }

  async shouldActivate(context: AgentContext): Promise<number> {
    const query = context.query.toLowerCase();

    // High for objection patterns
    if (OBJECTION_KEYWORDS.test(query)) return 0.9;

    // High for trust concerns
    if (TRUST_KEYWORDS.test(query)) return 0.85;

    // Medium for urgency signals
    if (URGENCY_KEYWORDS.test(query)) return 0.7;

    // Check lead profile
    if (context.leadProfile) {
      if (context.leadProfile.temperature === 'hot') return 0.8;
      if (context.leadProfile.temperature === 'warm') return 0.6;
    }

    // Check intent
    if (context.intent) {
      if (context.intent.type === 'purchase_intent') return 0.75;
    }

    // Psychology always has some relevance in a sales conversation
    return 0.15;
  }

  async execute(context: AgentContext): Promise<AgentResult> {
    const startTime = Date.now();
    const reasoningChain: ReasoningStep[] = [];

    // Step 1: Assess buyer stage
    const messageCount = context.history?.length ?? 0;
    let buyerStage: string;
    if (messageCount === 0) buyerStage = 'awareness';
    else if (messageCount < 4) buyerStage = 'interest';
    else if (messageCount < 8) buyerStage = 'evaluation';
    else if (messageCount < 14) buyerStage = 'decision';
    else buyerStage = 'action';

    // Adjust based on lead score
    if (context.leadProfile?.score && context.leadProfile.score > 70) buyerStage = 'decision';
    if (context.leadProfile?.score && context.leadProfile.score > 85) buyerStage = 'action';

    reasoningChain.push({
      stepName: 'stage-assessment',
      thought: 'Determine buyer position on the commitment ladder.',
      evidence: [
        `Message count: ${messageCount}`,
        `Lead score: ${context.leadProfile?.score ?? 'unknown'}`,
        `Temperature: ${context.leadProfile?.temperature ?? 'unknown'}`,
      ],
      conclusion: `Buyer stage: ${buyerStage}.`,
      confidence: 0.75,
    });

    // Step 2: Detect objection type
    const query = context.query.toLowerCase();
    const objections: string[] = [];
    if (OBJECTION_KEYWORDS.test(query)) objections.push('objection-detected');
    if (/\b(expensive|too much|غالي|كتير)\b/i.test(query)) objections.push('price-objection');
    if (/\b(not sure|think about|need time|محتاج وقت|مش متأكد)\b/i.test(query)) objections.push('timing-objection');
    if (TRUST_KEYWORDS.test(query)) objections.push('trust-objection');

    reasoningChain.push({
      stepName: 'objection-detection',
      thought: 'Identify any buyer objections or concerns in the query.',
      evidence: objections.length > 0 ? objections : ['No objection detected'],
      conclusion: objections.length > 0
        ? `Detected objection(s): ${objections.join(', ')}. Apply appropriate handling strategy.`
        : 'No objection — proceed with stage-appropriate engagement.',
      confidence: objections.length > 0 ? 0.85 : 0.7,
    });

    // Step 3: Match ICP segment
    const segment = context.icpSegment
      ? ICP_SEGMENTS.find((s) => s.segment === context.icpSegment)
      : undefined;

    // Step 4: Call Claude for psychology-informed response guidance
    const messages: Anthropic.Messages.MessageParam[] = [];
    if (context.history) {
      messages.push(...context.history.map((h) => ({ role: h.role, content: h.content })));
    }
    messages.push({
      role: 'user',
      content: `Generate psychology-informed response guidance for this query:\n\n"${context.query}"\n\nBuyer stage: ${buyerStage}\nObjections: ${objections.join(', ') || 'none'}\nICP segment: ${segment ? `${segment.label} (${segment.investmentGoal}, risk: ${segment.riskTolerance})` : 'unknown'}\nLead score: ${context.leadProfile?.score ?? 'unknown'}\n\nProvide: recommended tone, key talking points, objection handling strategy (if applicable), and suggested next step to advance on the commitment ladder.`,
    });

    const response = await this.anthropic.messages.create({
      model: getConfig().ANTHROPIC_MODEL,
      max_tokens: 600,
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
      operation: 'psychology-analysis',
      agentName: this.name,
      tokensIn: tokensUsed.input,
      tokensOut: tokensUsed.output,
      durationMs: Date.now() - startTime,
      sessionId: context.sessionId,
    });

    reasoningChain.push({
      stepName: 'response-strategy',
      thought: 'Generate psychology-informed communication strategy.',
      evidence: [`Stage: ${buyerStage}`, `Segment: ${segment?.label ?? 'unknown'}`, `Objections: ${objections.length}`],
      conclusion: 'Psychology strategy generated with tone, talking points, and next step.',
      confidence: 0.8,
    });

    return {
      pluginName: this.name,
      slot: this.slot,
      confidence: objections.length > 0 ? 0.85 : 0.6,
      reasoningChain,
      output,
      data: {
        buyerStage,
        objections,
        icpSegment: segment?.segment,
        leadScore: context.leadProfile?.score,
      },
      tokensUsed,
    };
  }

  async healthCheck(): Promise<PluginHealthStatus> {
    return {
      healthy: true,
      lastCheck: new Date().toISOString(),
      message: `${ICP_SEGMENTS.length} ICP segments loaded, commitment ladder active`,
    };
  }
}
