/**
 * Chat Sync Service
 * -----------------
 * Ensures conversational context is shared between the Osool Platform
 * (FastAPI/Python) and the Orchestrator (Fastify/TypeScript).
 *
 * When a webhook arrives with a chat message, this service:
 *  1. Stores the message in the orchestrator DB for intent processing
 *  2. Updates the lead score and user preferences
 *  3. On session end, generates a conversation summary
 *
 * The Platform can call GET /data/chat-context/:sessionId to get
 * the orchestrator's enriched context (intents, lead score, suggestions)
 * so the AI advisor "remembers" the user across both systems.
 */

import { db } from '@osool/db';
import { chatSessions, chatMessages, intentSignals, users } from '@osool/db/schema';
import { eq, desc, and, count } from 'drizzle-orm';
import { getRedis } from '../lib/redis.js';

export interface ChatSyncInput {
  sessionId: string;
  userId?: string;
  anonymousId: string;
  message: {
    role: 'user' | 'assistant';
    content: string;
    timestamp: string;
  };
  pageContext?: {
    url: string;
    pageType: string;
    locale: string;
  };
}

export interface SessionSummary {
  sessionId: string;
  leadScore: number;
  intentTypes: string[];
  preferredDevelopers: string[];
  preferredAreas: string[];
  messageCount: number;
  summary: string;
}

/**
 * Sync a chat message from the Platform into the Orchestrator DB.
 * This is called by the webhook handler for chat_message events.
 */
export async function syncChatMessage(input: ChatSyncInput): Promise<void> {
  const { sessionId, userId, anonymousId, message } = input;

  // Upsert session
  const existingSession = await db
    .select()
    .from(chatSessions)
    .where(eq(chatSessions.id, sessionId))
    .limit(1);

  if (existingSession.length === 0) {
    await db.insert(chatSessions).values({
      id: sessionId,
      userId: userId ?? null,
      visitorId: anonymousId,
      language: input.pageContext?.locale === 'ar' ? 'ar' : 'en',
      messageCount: 1,
      startedAt: new Date(message.timestamp),
      lastMessageAt: new Date(message.timestamp),
    });
  } else {
    await db
      .update(chatSessions)
      .set({
        messageCount: (existingSession[0].messageCount ?? 0) + 1,
        lastMessageAt: new Date(message.timestamp),
        ...(userId ? { userId } : {}),
      })
      .where(eq(chatSessions.id, sessionId));
  }

  // Store the message
  await db.insert(chatMessages).values({
    sessionId,
    role: message.role,
    content: message.content,
    createdAt: new Date(message.timestamp),
  });

  // Cache last active session for quick lookup
  if (userId) {
    const redis = getRedis();
    await redis.set(
      `user:last-session:${userId}`,
      sessionId,
      'EX',
      86400, // 24h
    );
  }
}

/**
 * Build a cross-session context summary for a user.
 * This enables the Platform AI to "remember" the user across all interactions.
 */
export async function buildUserChatContext(userId: string): Promise<{
  totalSessions: number;
  totalMessages: number;
  leadScore: number;
  recentIntents: { type: string; entities: Record<string, unknown>; confidence: number }[];
  preferredDevelopers: string[];
  preferredAreas: string[];
  conversationSummaries: string[];
}> {
  // Get all sessions for this user
  const sessions = await db
    .select()
    .from(chatSessions)
    .where(eq(chatSessions.userId, userId))
    .orderBy(desc(chatSessions.startedAt))
    .limit(10);

  const sessionIds = sessions.map((s: { id: string }) => s.id);
  let totalMessages = 0;
  let maxLeadScore = 0;

  for (const session of sessions) {
    totalMessages += session.messageCount ?? 0;
    maxLeadScore = Math.max(maxLeadScore, session.leadScore ?? 0);
  }

  // Get recent intent signals
  const signals = await db
    .select()
    .from(intentSignals)
    .where(eq(intentSignals.userId, userId))
    .orderBy(desc(intentSignals.createdAt))
    .limit(30);

  const devSet = new Set<string>();
  const areaSet = new Set<string>();
  const recentIntents: { type: string; entities: Record<string, unknown>; confidence: number }[] = [];

  for (const signal of signals) {
    const entities = (signal.entities as Record<string, unknown>) ?? {};
    if (Array.isArray(entities.developers)) {
      for (const d of entities.developers as string[]) devSet.add(d);
    }
    if (Array.isArray(entities.locations)) {
      for (const l of entities.locations as string[]) areaSet.add(l);
    }
    recentIntents.push({
      type: signal.intentType,
      entities,
      confidence: (signal.confidence ?? 50) / 100,
    });
  }

  // Gather session summaries
  const summaries = sessions
    .filter((s: { summary?: string | null }) => s.summary)
    .map((s: { summary?: string | null }) => s.summary as string)
    .slice(0, 5);

  return {
    totalSessions: sessions.length,
    totalMessages,
    leadScore: maxLeadScore,
    recentIntents: recentIntents.slice(0, 10),
    preferredDevelopers: [...devSet].slice(0, 10),
    preferredAreas: [...areaSet].slice(0, 10),
    conversationSummaries: summaries,
  };
}
