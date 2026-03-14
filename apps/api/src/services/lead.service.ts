/**
 * Lead Service — scoring queries and lead profile lookups
 */
import { db } from '@osool/db';
import { intentSignals, funnelEvents, waitlist } from '@osool/db/schema';
import { eq, desc, sql, gte, and } from 'drizzle-orm';

export type LeadTier = 'hot' | 'warm' | 'nurture' | 'cold';

export function scoreTier(score: number): LeadTier {
  if (score >= 85) return 'hot';
  if (score >= 60) return 'warm';
  if (score >= 30) return 'nurture';
  return 'cold';
}

export async function getLeadProfile(sessionId: string) {
  const [signals, events] = await Promise.all([
    db
      .select()
      .from(intentSignals)
      .where(eq(intentSignals.sessionId, sessionId))
      .orderBy(desc(intentSignals.createdAt))
      .limit(50),
    db
      .select()
      .from(funnelEvents)
      .where(eq(funnelEvents.sessionId, sessionId))
      .orderBy(desc(funnelEvents.createdAt))
      .limit(20),
  ]);

  return { sessionId, signals, events };
}

export async function getScoredLeads(page = 1, limit = 20) {
  // Aggregate session-level intent counts and compute a heuristic lead score
  const offset = (page - 1) * limit;

  const rows = await db
    .select({
      sessionId: intentSignals.sessionId,
      intentCount: sql<number>`count(*)::int`,
      avgConfidence: sql<number>`avg(${intentSignals.confidence})::int`,
      lastSeen: sql<Date>`max(${intentSignals.createdAt})`,
      segment: sql<string>`mode() within group (order by ${intentSignals.segment})`,
    })
    .from(intentSignals)
    .groupBy(intentSignals.sessionId)
    .orderBy(desc(sql`avg(${intentSignals.confidence})`))
    .offset(offset)
    .limit(limit);

  const [countRow] = await db
    .select({ count: sql<number>`count(distinct ${intentSignals.sessionId})::int` })
    .from(intentSignals);

  const leads = rows.map((row) => {
    const score = Math.min(100, Math.round((row.avgConfidence ?? 0) * 0.6 + (row.intentCount ?? 0) * 2));
    return {
      sessionId: row.sessionId,
      score,
      tier: scoreTier(score),
      segment: row.segment ?? null,
      intentCount: row.intentCount ?? 0,
      lastSeen: row.lastSeen?.toISOString() ?? new Date().toISOString(),
    };
  });

  return { leads, total: countRow?.count ?? 0, page, limit };
}

export async function getWaitlistLeads(page = 1, limit = 25) {
  const offset = (page - 1) * limit;
  const [rows, countRow] = await Promise.all([
    db
      .select()
      .from(waitlist)
      .orderBy(desc(waitlist.createdAt))
      .offset(offset)
      .limit(limit),
    db.select({ count: sql<number>`count(*)::int` }).from(waitlist),
  ]);
  return { waitlist: rows, total: countRow[0]?.count ?? 0, page, limit };
}
