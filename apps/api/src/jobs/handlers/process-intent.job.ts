/**
 * process-intent.job.ts
 *
 * Parses a user chat message into a structured intent signal
 * and stores it in the database. If it's a user message with
 * meaningful content, it also enqueues email trigger evaluation.
 */

import { db } from '@osool/db';
import { intentSignals, chatSessions } from '@osool/db/schema';
import { parseIntent } from '../../lib/claude.js';
import { getEmailTriggerQueue, type IntentJobData } from '../queue.js';
import { eq, sql } from 'drizzle-orm';

export async function processIntent(data: IntentJobData): Promise<{ stored: boolean; intentType: string }> {
  // Only process user messages
  if (data.role !== 'user' || !data.message.trim()) {
    return { stored: false, intentType: 'skip' };
  }

  // Parse intent via Claude (with Redis caching)
  const result = await parseIntent(data.message, data.pageContext);

  // Store intent signal
  await db.insert(intentSignals).values({
    sessionId: data.sessionId,
    userId: data.userId ?? null,
    anonymousId: data.anonymousId,
    visitorId: data.anonymousId,
    rawQuery: data.message,
    message: data.message,
    intentType: result.intentType,
    entities: result.entities,
    confidence: Math.round(result.confidence * 100), // store 0-100 integer
    segment: result.segment,
    pageContext: data.pageContext,
    source: 'chat',
    createdAt: data.timestamp ? new Date(data.timestamp) : new Date(),
  });

  // Update session message count
  await db
    .update(chatSessions)
    .set({ messageCount: sql`message_count + 1`, lastMessageAt: new Date() })
    .where(eq(chatSessions.id, data.sessionId));

  // If high-confidence intent from a lead-generating type, evaluate email trigger
  if (result.confidence >= 0.6 && ['comparison', 'roi_inquiry', 'payment_plan'].includes(result.intentType)) {
    const triggerQ = getEmailTriggerQueue();
    await triggerQ.add('check-email-triggers', {
      sessionId: data.sessionId,
      userId: data.userId,
      anonymousId: data.anonymousId,
      trigger: 'session_end' as const,
      score: undefined,
      segment: result.segment,
    });
  }

  return { stored: true, intentType: result.intentType };
}
