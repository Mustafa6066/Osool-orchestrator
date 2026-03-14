/**
 * Feedback Loop Service — event storage and history queries
 */
import { db } from '@osool/db';
import { feedbackLoopEvents } from '@osool/db/schema';
import { desc, sql, gte, eq } from 'drizzle-orm';

export type LoopType =
  | 'keyword_seo_sync'
  | 'audience_performance_sync'
  | 'email_sequence_optimize'
  | 'lead_scoring_recalibrate'
  | 'content_gap_analysis';

export async function recordFeedbackLoopEvent(data: {
  loopType: LoopType;
  source: string;
  eventType: string;
  actionsTriggered: string[];
  summary: string;
  meta?: Record<string, unknown>;
}): Promise<void> {
  const insertData: Record<string, unknown> = {
    source: data.source,
    eventType: data.eventType,
    loopType: data.loopType,
    actionsTriggered: data.actionsTriggered,
    summary: data.summary,
    runAt: new Date(),
    data: data.meta ?? {},
  };
  await db.insert(feedbackLoopEvents).values(insertData as any);
}

export async function getFeedbackLoopHistory(opts: { page?: number; limit?: number } = {}) {
  const { page = 1, limit = 25 } = opts;
  const offset = (page - 1) * limit;
  const [rows, countRow] = await Promise.all([
    db
      .select()
      .from(feedbackLoopEvents)
      .orderBy(desc(feedbackLoopEvents.createdAt))
      .offset(offset)
      .limit(limit),
    db.select({ count: sql<number>`count(*)::int` }).from(feedbackLoopEvents),
  ]);
  return { events: rows, total: countRow[0]?.count ?? 0, page, limit };
}

export async function getRecentFeedbackSummaries(hours = 24): Promise<string[]> {
  const since = new Date(Date.now() - hours * 3600_000);
  const rows = await db
    .select({ summary: (feedbackLoopEvents as any).summary })
    .from(feedbackLoopEvents)
    .where(gte(feedbackLoopEvents.createdAt, since))
    .orderBy(desc(feedbackLoopEvents.createdAt))
    .limit(20);
  return rows.map((r) => r.summary as string).filter(Boolean);
}
