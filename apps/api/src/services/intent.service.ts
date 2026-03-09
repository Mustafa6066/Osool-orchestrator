/**
 * Intent Service — CRUD helpers for intent signals and session data
 */
import { db } from '@osool/db';
import { intentSignals, chatSessions } from '@osool/db/schema';
import { eq, desc, and, gte, sql } from 'drizzle-orm';

export async function getIntentsBySession(sessionId: string) {
  return db
    .select()
    .from(intentSignals)
    .where(eq(intentSignals.sessionId, sessionId))
    .orderBy(desc(intentSignals.createdAt));
}

export async function getIntentsByType(intentType: string, limit = 100) {
  return db
    .select()
    .from(intentSignals)
    .where(eq(intentSignals.intentType, intentType))
    .orderBy(desc(intentSignals.createdAt))
    .limit(limit);
}

export async function getIntentSignalCount(since?: Date): Promise<number> {
  const where = since ? gte(intentSignals.createdAt, since) : undefined;
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(intentSignals)
    .where(where);
  return row?.count ?? 0;
}

export async function getTopIntentTypes(days = 7): Promise<{ intentType: string; count: number }[]> {
  const rows = await db
    .select({
      intentType: intentSignals.intentType,
      count: sql<number>`count(*)::int`,
    })
    .from(intentSignals)
    .where(gte(intentSignals.createdAt, new Date(Date.now() - days * 86400_000)))
    .groupBy(intentSignals.intentType)
    .orderBy(desc(sql`count(*)`))
    .limit(10);
  return rows as { intentType: string; count: number }[];
}

export async function getSessionLastActivity(sessionId: string): Promise<Date | null> {
  const [row] = await db
    .select({ lastMessageAt: chatSessions.lastMessageAt })
    .from(chatSessions)
    .where(eq(chatSessions.id, sessionId));
  return row?.lastMessageAt ?? null;
}

export async function countSessionsByStage(): Promise<{ stage: string; count: number }[]> {
  const rows = await db
    .select({
      segment: chatSessions.icpSegment,
      count: sql<number>`count(*)::int`,
    })
    .from(chatSessions)
    .groupBy(chatSessions.icpSegment);
  return rows.map((r) => ({ stage: r.segment ?? 'unknown', count: r.count }));
}
