import Anthropic from '@anthropic-ai/sdk';
import { getConfig } from '../config.js';
import { db } from '@osool/db';
import { chatSessions, chatMessages } from '@osool/db/schema';
import { eq } from 'drizzle-orm';
import { DEVELOPERS, LOCATIONS, ICP_SEGMENTS } from '@osool/shared';
import type { AgentContext } from '@osool/shared';
import { ConsensusRouter } from './brain/consensus-router.js';
import { classifyIntent } from './intent-agent.js';
import { trackLLMCost } from '../lib/llm-cost-tracker.js';

const anthropic = new Anthropic({ apiKey: getConfig().ANTHROPIC_API_KEY });
const consensusRouter = new ConsensusRouter();

/**
 * Fallback system prompt — used when the consensus router is bypassed
 * (no plugins activated or all plugins fail).
 */
const SYSTEM_PROMPT = `You are the Osool CoInvestor AI — an expert Egyptian real estate investment advisor.

Your role:
- Guide users through Egyptian property investment decisions
- Classify user intent (browsing, comparing, buying, investing)
- Recommend properties based on ICP segment and budget
- Compare developers objectively using delivery rates, pricing, ROI
- Provide location-specific insights (New Cairo, New Capital, North Coast, etc.)
- Capture lead information naturally (email, budget, preferences)
- Support both English and Arabic seamlessly

Available developers: ${DEVELOPERS.map((d) => d.name).join(', ')}
Available locations: ${LOCATIONS.map((l) => l.name).join(', ')}
ICP segments: ${ICP_SEGMENTS.map((s) => `${s.label} (${s.description})`).join('; ')}

Rules:
- Always be factual. Never fabricate property data.
- If unsure, say so and offer to search for specifics.
- Always mention installment plans and down payment options.
- Proactively ask about budget, preferred location, and timeline.
- When comparing developers, use delivery rate, price/sqm, and project count.
- Prices are in EGP unless user specifies otherwise.
- Be warm, professional, and concise.`;

export interface ChatInput {
  sessionId: string;
  message: string;
  userId?: string;
  visitorId?: string;
  language?: string;
}

export interface ChatOutput {
  reply: string;
  sessionId: string;
  intentType?: string;
  tokensUsed: number;
  latencyMs: number;
  /** Which specialist agents contributed (empty for fallback) */
  contributors?: Array<{ pluginName: string; slot: string; confidence: number }>;
}

export async function chat(input: ChatInput): Promise<ChatOutput> {
  const startTime = Date.now();

  // Fetch conversation history
  const history = await db
    .select({ role: chatMessages.role, content: chatMessages.content })
    .from(chatMessages)
    .where(eq(chatMessages.sessionId, input.sessionId))
    .orderBy(chatMessages.createdAt);

  // Store user message
  await db.insert(chatMessages).values({
    sessionId: input.sessionId,
    role: 'user',
    content: input.message,
  });

  // Classify intent for context enrichment
  const intent = classifyIntent(input.message);

  // Detect locale from message
  const isArabic = /[\u0600-\u06FF\u0750-\u077F]/.test(input.message);
  const locale: 'en' | 'ar' = isArabic || input.language === 'ar' ? 'ar' : 'en';

  // Build agent context for the consensus router
  const agentContext: AgentContext = {
    query: input.message,
    intent: {
      type: intent.intentType,
      confidence: intent.confidence / 100,
      entities: intent.entities,
    },
    sessionId: input.sessionId,
    userId: input.userId,
    history: history.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
    locale,
  };

  let reply: string;
  let tokensUsed: number;
  let contributors: ChatOutput['contributors'] = [];

  try {
    // Route through multi-agent consensus pipeline
    const consensus = await consensusRouter.route(agentContext);
    reply = consensus.response;
    tokensUsed = consensus.totalTokens.input + consensus.totalTokens.output;
    contributors = consensus.contributors;
  } catch {
    // Fallback to direct Claude call if consensus router fails
    const messages: Anthropic.Messages.MessageParam[] = history.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));
    messages.push({ role: 'user', content: input.message });

    const response = await anthropic.messages.create({
      model: getConfig().ANTHROPIC_MODEL,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages,
    });

    reply = response.content
      .filter((block): block is Anthropic.Messages.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('');

    tokensUsed = (response.usage.input_tokens ?? 0) + (response.usage.output_tokens ?? 0);

    await trackLLMCost({
      model: getConfig().ANTHROPIC_MODEL,
      provider: 'anthropic',
      operation: 'chat-fallback',
      agentName: 'chat-agent',
      tokensIn: response.usage.input_tokens,
      tokensOut: response.usage.output_tokens,
      durationMs: Date.now() - startTime,
      sessionId: input.sessionId,
    });
  }

  const latencyMs = Date.now() - startTime;

  // Store assistant reply
  await db.insert(chatMessages).values({
    sessionId: input.sessionId,
    role: 'assistant',
    content: reply,
    tokensUsed,
    latencyMs,
  });

  // Update session stats
  await db
    .update(chatSessions)
    .set({
      messageCount: history.length + 2,
      lastMessageAt: new Date(),
    })
    .where(eq(chatSessions.id, input.sessionId));

  return {
    reply,
    sessionId: input.sessionId,
    intentType: intent.intentType,
    tokensUsed,
    latencyMs,
    contributors,
  };
}
