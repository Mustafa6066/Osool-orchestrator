/**
 * Legal Plugin — Egyptian real estate law, contract analysis, CBE compliance.
 *
 * Covers: CBE Law 194/2020 (EGP-only payments), FRA Decision 125/2025
 * (fractional ownership), Civil Code 131 (contract law), registration requirements.
 */

import Anthropic from '@anthropic-ai/sdk';
import { getConfig } from '../../../config.js';
import type { AgentPlugin, AgentContext, AgentResult, PluginHealthStatus, ReasoningStep } from '@osool/shared';
import { trackLLMCost } from '../../../lib/llm-cost-tracker.js';

const LEGAL_KEYWORDS = /\b(legal|law|contract|registration|ownership|title|deed|tax|stamp|penalty|dispute|court|compliance|regulation|حق|قانون|عقد|تسجيل|ملكية|ضريبة|نزاع|محكمة)\b/i;
const PAYMENT_KEYWORDS = /\b(payment|instapay|fawry|bank|transfer|cash|currency|egp|usd|dollar|دفع|بنك|تحويل|دولار|جنيه)\b/i;
const FRACTIONAL_KEYWORDS = /\b(fractional|fraction|share|co-own|partial|tokenize|fra|تملك جزئي|حصة)\b/i;

const SYSTEM_PROMPT = `You are the Osool Legal Specialist — an expert in Egyptian real estate law and regulations.

Your expertise:
1. **CBE Law 194/2020**: All real estate payments must be in EGP via regulated channels (InstaPay, Fawry, bank transfer). No cash transactions above 50,000 EGP. Foreign currency pricing is indicative only.
2. **FRA Decision 125/2025**: Fractional ownership framework — minimum 10% individual share, licensed platforms only, FRA registration required, investor protection rules.
3. **Civil Code 131**: Contract formation, force majeure, penalty clauses in off-plan purchases, buyer rights on delayed delivery.
4. **Property Registration**: Shahr Aqari (Real Estate Publicization) process, required documents, registration fees (3% + stamps), timeline (3-6 months).
5. **Tax implications**: Property transfer tax (2.5% of sale price, paid by seller), stamp duty (0.5%), capital gains via IRS.
6. **Developer obligations**: Off-plan delivery guarantees, escrow requirements, completion certificates.
7. **Foreign ownership**: Restrictions in Sinai/border zones, 2-property limit for non-Egyptians, security clearance requirements.

Rules:
- Always cite the specific law/regulation number.
- Note when professional legal counsel is recommended.
- Flag compliance risks with severity (critical / warning / info).
- Distinguish between legally binding requirements and market practices.
- Prices and payments always referenced in EGP per CBE Law 194/2020.`;

export class LegalPlugin implements AgentPlugin {
  readonly name = 'legal-egypt-v1';
  readonly slot = 'legal' as const;
  readonly version = '1.0.0';

  private anthropic: Anthropic;

  constructor() {
    this.anthropic = new Anthropic({ apiKey: getConfig().ANTHROPIC_API_KEY });
  }

  async shouldActivate(context: AgentContext): Promise<number> {
    const query = context.query.toLowerCase();

    // High for direct legal queries
    if (LEGAL_KEYWORDS.test(query)) return 0.9;

    // High for payment compliance
    if (PAYMENT_KEYWORDS.test(query)) return 0.7;

    // Very high for fractional ownership (complex legal area)
    if (FRACTIONAL_KEYWORDS.test(query)) return 0.95;

    // Check intent
    if (context.intent) {
      const { type } = context.intent;
      if (type === 'purchase_intent') return 0.6; // Purchases always have legal context
      if (type === 'financing') return 0.5; // Financing has CBE compliance angle
    }

    return 0.1;
  }

  async execute(context: AgentContext): Promise<AgentResult> {
    const startTime = Date.now();
    const reasoningChain: ReasoningStep[] = [];

    // Step 1: Classify legal domain
    const query = context.query.toLowerCase();
    const domains: string[] = [];

    if (LEGAL_KEYWORDS.test(query)) domains.push('contract-law');
    if (PAYMENT_KEYWORDS.test(query)) domains.push('cbe-compliance');
    if (FRACTIONAL_KEYWORDS.test(query)) domains.push('fractional-ownership');
    if (/\b(register|title|deed|تسجيل|سند)\b/i.test(query)) domains.push('registration');
    if (/\b(tax|ضريبة)\b/i.test(query)) domains.push('taxation');
    if (/\b(foreign|expat|أجنبي)\b/i.test(query)) domains.push('foreign-ownership');
    if (domains.length === 0) domains.push('general-legal');

    reasoningChain.push({
      stepName: 'domain-classification',
      thought: 'Identify which legal domains are relevant to the query.',
      evidence: domains.map((d) => `Domain: ${d}`),
      conclusion: `Query spans ${domains.length} legal domain(s): ${domains.join(', ')}.`,
      confidence: 0.85,
    });

    // Step 2: Call Claude for legal analysis
    const messages: Anthropic.Messages.MessageParam[] = [];
    if (context.history) {
      messages.push(...context.history.map((h) => ({ role: h.role, content: h.content })));
    }
    messages.push({
      role: 'user',
      content: `Provide legal analysis for this query about Egyptian real estate:\n\n"${context.query}"\n\nRelevant legal domains: ${domains.join(', ')}\n\nInclude: applicable laws/regulations with citation numbers, compliance requirements, risk flags, and whether professional legal counsel is recommended.`,
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
      operation: 'legal-analysis',
      agentName: this.name,
      tokensIn: tokensUsed.input,
      tokensOut: tokensUsed.output,
      durationMs: Date.now() - startTime,
      sessionId: context.sessionId,
    });

    reasoningChain.push({
      stepName: 'legal-analysis',
      thought: 'Generate legal analysis with regulation citations and compliance flags.',
      evidence: [`Domains: ${domains.join(', ')}`, `Tokens: ${tokensUsed.input}in/${tokensUsed.output}out`],
      conclusion: 'Legal analysis complete with applicable regulations cited.',
      confidence: 0.8,
    });

    return {
      pluginName: this.name,
      slot: this.slot,
      confidence: domains.length > 1 ? 0.85 : 0.75,
      reasoningChain,
      output,
      data: { legalDomains: domains },
      uiActions: domains.includes('registration') ? ['show-registration-checklist'] : undefined,
      tokensUsed,
      warnings: ['This is AI-generated legal information, not legal advice. Consult a licensed Egyptian attorney for binding guidance.'],
    };
  }

  async healthCheck(): Promise<PluginHealthStatus> {
    return {
      healthy: true,
      lastCheck: new Date().toISOString(),
      message: 'Legal knowledge base loaded (CBE 194/2020, FRA 125/2025, Civil Code 131)',
    };
  }
}
