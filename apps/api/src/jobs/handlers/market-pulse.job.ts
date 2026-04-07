/**
 * market-pulse.job.ts
 *
 * Hourly job run by the Nexus agent.
 * Aggregates the last hour's intent signals into trending intelligence:
 *   - Top developers by mention count
 *   - Top locations by mention count
 *   - Top intent types
 *   - Emerging comparison pairs
 *
 * Results stored in Redis as 'nexus:trending' (TTL: 2h).
 */

import { db } from '@osool/db';
import { intentSignals } from '@osool/db/schema';
import { gte, count, desc, sql } from 'drizzle-orm';
import { getRedis } from '../../lib/redis.js';
import type { MarketPulseJobData } from '../queue.js';

export async function runMarketPulse(_data: MarketPulseJobData): Promise<{ aggregated: boolean }> {
  const redis = getRedis();
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

  // Load recent signals
  const signals = await db
    .select({ entities: intentSignals.entities, intentType: intentSignals.intentType })
    .from(intentSignals)
    .where(gte(intentSignals.createdAt, oneHourAgo))
    .limit(2000);

  if (signals.length === 0) {
    // Mark as ran but no data
    await redis.set('agent:nexus:last_run', new Date().toISOString(), 'EX', 7200);
    return { aggregated: false };
  }

  // Aggregate developer mentions
  const devCounts: Record<string, number> = {};
  const locCounts: Record<string, number> = {};
  const intentTypeCounts: Record<string, number> = {};
  const pairCounts: Record<string, number> = {};

  for (const signal of signals) {
    const entities = signal.entities as Record<string, unknown>;
    const devs = Array.isArray(entities.developers) ? (entities.developers as string[]) : [];
    const locs = Array.isArray(entities.locations) ? (entities.locations as string[]) : [];

    for (const dev of devs) {
      devCounts[dev] = (devCounts[dev] ?? 0) + 1;
    }
    for (const loc of locs) {
      locCounts[loc] = (locCounts[loc] ?? 0) + 1;
    }

    intentTypeCounts[signal.intentType] = (intentTypeCounts[signal.intentType] ?? 0) + 1;

    // Comparison pairs
    if (signal.intentType === 'comparison' && devs.length >= 2) {
      const sorted = [...devs].sort();
      const pairKey = `${sorted[0]}-vs-${sorted[1]}`;
      pairCounts[pairKey] = (pairCounts[pairKey] ?? 0) + 1;
    }
  }

  const trendingDevelopers = Object.entries(devCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([id, mentionCount]) => ({ id, name: id.replace(/_/g, ' '), mentionCount }));

  const trendingLocations = Object.entries(locCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([slug, mentionCount]) => ({ slug, name: slug.replace(/-/g, ' '), mentionCount }));

  const topIntents = Object.entries(intentTypeCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([type, count]) => ({ type, count }));

  const emergingPairs = Object.entries(pairCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([pair, count]) => ({ pair, count }));

  const trending = {
    trendingDevelopers,
    trendingLocations,
    topIntents,
    emergingPairs,
    totalSignals: signals.length,
    computedAt: new Date().toISOString(),
  };

  // Enrich with external trend signals (non-blocking)
  try {
    const { runTrendScout } = await import('../../services/trend-scout.service.js');
    const scout = await runTrendScout();
    (trending as Record<string, unknown>).externalTrends = scout.trends.slice(0, 10);
    (trending as Record<string, unknown>).contentAngles = scout.contentAngles.slice(0, 5);
  } catch {
    // Trend scout is optional — continue with internal data only
  }

  // Store in Redis with 2h TTL
  await redis.set('nexus:trending', JSON.stringify(trending), 'EX', 7200);
  await redis.set('agent:nexus:last_run', new Date().toISOString(), 'EX', 7200);
  await redis.set('agent:nexus:status', 'idle', 'EX', 7200);

  // Append to agent log ring buffer
  await redis.lpush('agent:nexus:logs', JSON.stringify({
    timestamp: new Date().toISOString(),
    message: `Market pulse: ${signals.length} signals, ${trendingDevelopers.length} devs, ${trendingLocations.length} locs`,
  }));
  await redis.ltrim('agent:nexus:logs', 0, 49);

  return { aggregated: true };
}
