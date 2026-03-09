/**
 * Analytics Service — platform-wide metrics aggregation for the admin dashboard
 */
import { db } from '@osool/db';
import {
  users,
  chatSessions,
  intentSignals,
  seoPages,
  waitlist,
  emailSends,
  funnelEvents,
} from '@osool/db/schema';
import { gte, sql } from 'drizzle-orm';
import { getRedis } from '../lib/redis.js';

const TODAY_START = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

export async function getPlatformMetrics() {
  const today = TODAY_START();

  const [
    totalUsers,
    totalSessions,
    totalIntents,
    totalSEOPages,
    waitlistCount,
    newUsersToday,
    sessionsToday,
    intentsToday,
    emailsSentToday,
    waitlistJoinsToday,
  ] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` }).from(users).then((r) => r[0]?.count ?? 0),
    db.select({ count: sql<number>`count(*)::int` }).from(chatSessions).then((r) => r[0]?.count ?? 0),
    db.select({ count: sql<number>`count(*)::int` }).from(intentSignals).then((r) => r[0]?.count ?? 0),
    db.select({ count: sql<number>`count(*)::int` }).from(seoPages).then((r) => r[0]?.count ?? 0),
    db.select({ count: sql<number>`count(*)::int` }).from(waitlist).then((r) => r[0]?.count ?? 0),
    db.select({ count: sql<number>`count(*)::int` }).from(users).where(gte(users.createdAt, today)).then((r) => r[0]?.count ?? 0),
    db.select({ count: sql<number>`count(*)::int` }).from(chatSessions).where(gte(chatSessions.startedAt, today)).then((r) => r[0]?.count ?? 0),
    db.select({ count: sql<number>`count(*)::int` }).from(intentSignals).where(gte(intentSignals.createdAt, today)).then((r) => r[0]?.count ?? 0),
    db.select({ count: sql<number>`count(*)::int` }).from(emailSends).where(gte(emailSends.createdAt, today)).then((r) => r[0]?.count ?? 0),
    db.select({ count: sql<number>`count(*)::int` }).from(waitlist).where(gte(waitlist.createdAt, today)).then((r) => r[0]?.count ?? 0),
  ]);

  return {
    totalUsers,
    totalChatSessions: totalSessions,
    totalIntentSignals: totalIntents,
    totalSEOPages,
    waitlistCount,
    today: {
      newUsers: newUsersToday,
      chatSessions: sessionsToday,
      intentSignals: intentsToday,
      emailsSent: emailsSentToday,
      waitlistJoins: waitlistJoinsToday,
    },
  };
}

export async function getFunnelCounts() {
  const rows = await db
    .select({
      eventType: funnelEvents.event,
      cnt: sql<number>`count(*)::int`,
    })
    .from(funnelEvents)
    .groupBy(funnelEvents.event);

  const STAGE_MAP: Record<string, string> = {
    page_view: 'discover',
    chat_start: 'engage',
    intent_signal: 'engage',
    comparison_view: 'qualify',
    roi_request: 'qualify',
    email_submit: 'convert',
    waitlist_join: 'convert',
    returning_session: 'retain',
  };

  const stages: Record<string, number> = { discover: 0, engage: 0, qualify: 0, convert: 0, retain: 0 };
  for (const row of rows) {
    const stage = STAGE_MAP[row.eventType] ?? 'discover';
    stages[stage] = (stages[stage] ?? 0) + row.cnt;
  }
  return stages;
}

export async function getTrending(): Promise<{
  developers: { name: string; count: number }[];
  locations: { name: string; count: number }[];
}> {
  const redis = getRedis();
  const cached = await redis.get('nexus:trending');
  if (cached) {
    try {
      const parsed = JSON.parse(cached) as {
        trendingDevelopers?: { name: string; count: number }[];
        trendingLocations?: { name: string; count: number }[];
      };
      return {
        developers: parsed.trendingDevelopers ?? [],
        locations: parsed.trendingLocations ?? [],
      };
    } catch {
      // fall through to empty
    }
  }
  return { developers: [], locations: [] };
}
