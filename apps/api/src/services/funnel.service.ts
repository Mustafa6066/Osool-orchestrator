/**
 * Funnel Service — funnel event tracking and stage aggregation
 */
import { db } from '@osool/db';
import { funnelEvents, chatSessions } from '@osool/db/schema';
import { desc, gte, sql, and, eq } from 'drizzle-orm';

export type FunnelStage = 'discover' | 'engage' | 'qualify' | 'convert' | 'retain';

const STAGE_MAP: Record<string, FunnelStage> = {
  page_view: 'discover',
  chat_start: 'engage',
  intent_signal: 'engage',
  comparison_view: 'qualify',
  roi_request: 'qualify',
  email_submit: 'convert',
  waitlist_join: 'convert',
  returning_session: 'retain',
};

export function classifyStage(eventType: string): FunnelStage {
  return STAGE_MAP[eventType] ?? 'discover';
}

export async function getFunnelStageCounts(since?: Date): Promise<{ stage: string; count: number }[]> {
  const where = since ? gte(funnelEvents.createdAt, since) : undefined;
  const rows = await db
    .select({
      eventType: funnelEvents.event,
      count: sql<number>`count(*)::int`,
    })
    .from(funnelEvents)
    .where(where)
    .groupBy(funnelEvents.event);

  // Group into funnel stages
  const stageCounts: Record<FunnelStage, number> = {
    discover: 0,
    engage: 0,
    qualify: 0,
    convert: 0,
    retain: 0,
  };

  for (const row of rows) {
    const stage = classifyStage(row.eventType);
    stageCounts[stage] += row.count;
  }

  return Object.entries(stageCounts).map(([stage, count]) => ({ stage, count }));
}

export async function getDailyFunnelBreakdown(days = 30) {
  const since = new Date(Date.now() - days * 86400_000);
  return db
    .select({
      date: sql<string>`date_trunc('day', ${funnelEvents.createdAt})::date::text`,
      eventType: funnelEvents.event,
      cnt: sql<number>`count(*)::int`,
    })
    .from(funnelEvents)
    .where(gte(funnelEvents.createdAt, since))
    .groupBy(sql`1`, funnelEvents.event)
    .orderBy(sql`1`);
}

export async function trackFunnelEvent(data: {
  sessionId: string;
  eventType: string;
  data?: Record<string, unknown>;
}): Promise<void> {
  await db.insert(funnelEvents).values({
    sessionId: data.sessionId,
    event: data.eventType,
    stage: 'engage',
    properties: data.data ?? {},
  });
}

export async function getNewSessionCount(since: Date): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(chatSessions)
    .where(gte(chatSessions.startedAt, since));
  return row?.count ?? 0;
}
