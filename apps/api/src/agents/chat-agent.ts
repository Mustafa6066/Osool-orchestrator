import Anthropic from '@anthropic-ai/sdk';
import { env } from '../lib/env.js';
import { db } from '@osool/db';
import { chatSessions, chatMessages } from '@osool/db/schema';
import { eq } from 'drizzle-orm';
import { DEVELOPERS, LOCATIONS, ICP_SEGMENTS } from '@osool/shared';

const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

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
}

export async function chat(input: ChatInput): Promise<ChatOutput> {
  const startTime = Date.now();

  // Fetch conversation history
  const history = await db
    .select({ role: chatMessages.role, content: chatMessages.content })
    .from(chatMessages)
    .where(eq(chatMessages.sessionId, input.sessionId))
    .orderBy(chatMessages.createdAt);

  const messages: Anthropic.Messages.MessageParam[] = history.map((m) => ({
    role: m.role as 'user' | 'assistant',
    content: m.content,
  }));

  messages.push({ role: 'user', content: input.message });

  // Store user message
  await db.insert(chatMessages).values({
    sessionId: input.sessionId,
    role: 'user',
    content: input.message,
  });

  // Call Claude
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages,
  });

  const reply = response.content
    .filter((block): block is Anthropic.Messages.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('');

  const tokensUsed = (response.usage.input_tokens ?? 0) + (response.usage.output_tokens ?? 0);
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
    tokensUsed,
    latencyMs,
  };
}
