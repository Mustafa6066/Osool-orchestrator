/**
 * Content Plugin — narrative generation, bilingual output, SEO-informed responses.
 *
 * Enhances chat responses with polished, context-aware narratives.
 * Handles bilingual (English/Arabic) output seamlessly.
 */

import Anthropic from '@anthropic-ai/sdk';
import { getConfig } from '../../../config.js';
import { DEVELOPERS, LOCATIONS } from '@osool/shared';
import type { AgentPlugin, AgentContext, AgentResult, PluginHealthStatus, ReasoningStep } from '@osool/shared';
import { trackLLMCost } from '../../../lib/llm-cost-tracker.js';

const CONTENT_KEYWORDS = /\b(describe|tell me about|overview|summary|explain|details|info|information|أخبرني|اشرح|تفاصيل|معلومات|وصف|نبذة)\b/i;
const LISTING_KEYWORDS = /\b(listing|properties|available|options|show me|what's available|عقارات|متاح|اعرض|الخيارات)\b/i;
const ARABIC_PATTERN = /[\u0600-\u06FF\u0750-\u077F]/;

const SYSTEM_PROMPT = `You are the Osool Content Specialist — a master of Egyptian real estate narrative and bilingual communication.

Your expertise:
- Crafting compelling property and area descriptions
- Bilingual writing (English and Arabic) with native-level fluency in both
- Developer brand voice adaptation (each developer has a distinct positioning)
- Location storytelling (lifestyle, community, infrastructure, future vision)
- SEO-friendly content that reads naturally
- Formatting chat responses for clarity (bullet points, headers, key highlights)

Developer positioning:
${DEVELOPERS.map((d) => `${d.name} (${d.nameAr}): ${d.tier} tier, ${d.projectCount} projects, known for ${d.regions.join(' & ')}`).join('\n')}

Location narratives:
${LOCATIONS.map((l) => `${l.name} (${l.nameAr}): ${l.description ?? l.name}`).join('\n')}

Rules:
- Match the user's language. If they write in Arabic, respond in Arabic. If mixed, follow their dominant language.
- Use Egyptian Arabic dialect (عامية) for informal chat, MSA for formal content.
- Structure long responses with clear sections and bullet points.
- Highlight key numbers (prices, areas, delivery dates) prominently.
- Include developer Arabic names when responding in Arabic.
- Never use robotic or generic marketing language — be warm and authentic.`;

export class ContentPlugin implements AgentPlugin {
  readonly name = 'content-v1';
  readonly slot = 'content' as const;
  readonly version = '1.0.0';

  private anthropic: Anthropic;

  constructor() {
    this.anthropic = new Anthropic({ apiKey: getConfig().ANTHROPIC_API_KEY });
  }

  async shouldActivate(context: AgentContext): Promise<number> {
    const query = context.query;

    // High for content/description requests
    if (CONTENT_KEYWORDS.test(query)) return 0.85;

    // High for listing requests (need formatted content)
    if (LISTING_KEYWORDS.test(query)) return 0.75;

    // Higher when Arabic is detected (bilingual expertise needed)
    if (ARABIC_PATTERN.test(query)) return 0.7;

    // Check intent
    if (context.intent) {
      if (context.intent.type === 'general_inquiry') return 0.7;
      if (context.intent.type === 'location_search') return 0.65;
      if (context.intent.type === 'specification_search') return 0.6;
    }

    // Content polish is useful for longer conversations
    if (context.history && context.history.length > 6) return 0.5;

    return 0.2;
  }

  async execute(context: AgentContext): Promise<AgentResult> {
    const startTime = Date.now();
    const reasoningChain: ReasoningStep[] = [];

    // Step 1: Detect language
    const isArabic = ARABIC_PATTERN.test(context.query);
    const locale = isArabic ? 'ar' : context.locale;

    reasoningChain.push({
      stepName: 'language-detection',
      thought: 'Detect user language to match response language.',
      evidence: [
        `Arabic characters detected: ${isArabic}`,
        `User locale setting: ${context.locale}`,
      ],
      conclusion: `Response language: ${locale === 'ar' ? 'Arabic' : 'English'}.`,
      confidence: 0.95,
    });

    // Step 2: Identify content entities
    const matchedDevelopers = DEVELOPERS.filter(
      (d) =>
        context.query.toLowerCase().includes(d.name.toLowerCase()) ||
        context.query.includes(d.nameAr),
    );
    const matchedLocations = LOCATIONS.filter(
      (l) =>
        context.query.toLowerCase().includes(l.name.toLowerCase()) ||
        (l.nameAr && context.query.includes(l.nameAr)),
    );

    reasoningChain.push({
      stepName: 'entity-matching',
      thought: 'Match developers and locations for content generation.',
      evidence: [
        ...matchedDevelopers.map((d) => `Developer: ${d.name}`),
        ...matchedLocations.map((l) => `Location: ${l.name}`),
      ],
      conclusion: `Found ${matchedDevelopers.length} developer(s) and ${matchedLocations.length} location(s).`,
      confidence: 0.9,
    });

    // Step 3: Call Claude for polished content
    const messages: Anthropic.Messages.MessageParam[] = [];
    if (context.history) {
      messages.push(...context.history.map((h) => ({ role: h.role, content: h.content })));
    }
    messages.push({
      role: 'user',
      content: `Generate a polished, well-structured response for this query:\n\n"${context.query}"\n\nLanguage: ${locale === 'ar' ? 'Arabic (Egyptian dialect for chat, MSA for formal content)' : 'English'}\nDevelopers mentioned: ${matchedDevelopers.map((d) => `${d.name} (${d.nameAr})`).join(', ') || 'none'}\nLocations mentioned: ${matchedLocations.map((l) => `${l.name} (${l.nameAr})`).join(', ') || 'none'}\n\nUse bullet points for multiple items. Highlight key numbers. Be warm and authentic.`,
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
      operation: 'content-generation',
      agentName: this.name,
      tokensIn: tokensUsed.input,
      tokensOut: tokensUsed.output,
      durationMs: Date.now() - startTime,
      sessionId: context.sessionId,
    });

    reasoningChain.push({
      stepName: 'content-generation',
      thought: 'Generate polished, structured content in the appropriate language.',
      evidence: [`Language: ${locale}`, `Tokens: ${tokensUsed.input}in/${tokensUsed.output}out`],
      conclusion: 'Content generated with proper formatting and language matching.',
      confidence: 0.85,
    });

    return {
      pluginName: this.name,
      slot: this.slot,
      confidence: isArabic || CONTENT_KEYWORDS.test(context.query) ? 0.85 : 0.65,
      reasoningChain,
      output,
      data: {
        detectedLocale: locale,
        developers: matchedDevelopers.map((d) => d.name),
        locations: matchedLocations.map((l) => l.name),
      },
      tokensUsed,
    };
  }

  async healthCheck(): Promise<PluginHealthStatus> {
    return {
      healthy: true,
      lastCheck: new Date().toISOString(),
      message: `Bilingual engine ready, ${DEVELOPERS.length} developer profiles, ${LOCATIONS.length} location narratives`,
    };
  }
}
