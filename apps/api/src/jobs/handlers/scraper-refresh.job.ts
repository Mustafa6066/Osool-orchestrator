/**
 * scraper-refresh.job.ts
 *
 * Handles scraper refresh requests — triggers the Nawy Spider
 * (or future scrapers) via an HTTP call to the Platform backend.
 *
 * Connects the orchestrator's event system to the Platform's scraper.
 * When chat queries mention unknown properties or scheduled refresh fires,
 * this job kicks off a targeted or full scrape.
 */

import type { ScraperRefreshJobData } from '../queue.js';
import { getRedis } from '../../lib/redis.js';

export async function processScraperRefresh(data: ScraperRefreshJobData): Promise<{
  status: string;
  source: string;
  mode: string;
}> {
  const redis = getRedis();

  // Deduplication: prevent multiple concurrent scrapes of the same source
  const lockKey = `scraper:lock:${data.source}:${data.mode}`;
  const locked = await redis.set(lockKey, '1', 'EX', 600, 'NX'); // 10-min lock
  if (!locked) {
    return { status: 'skipped_locked', source: data.source, mode: data.mode };
  }

  try {
    // Record the refresh request
    await redis.lpush(
      'scraper:refresh:log',
      JSON.stringify({
        ts: new Date().toISOString(),
        source: data.source,
        mode: data.mode,
        targetArea: data.targetArea,
        triggeredBy: data.triggeredBy,
      }),
    );
    await redis.ltrim('scraper:refresh:log', 0, 99);

    // In production: call the Platform scraper API or trigger the spider directly
    // For now, queue the request and let the Platform's scraper poller pick it up
    await redis.lpush(
      'scraper:pending',
      JSON.stringify({
        source: data.source,
        mode: data.mode,
        targetArea: data.targetArea,
        targetCompoundSlug: data.targetCompoundSlug,
        requestedAt: new Date().toISOString(),
        priority: data.priority ?? 'normal',
      }),
    );

    return { status: 'queued', source: data.source, mode: data.mode };
  } finally {
    // Release lock if fast completion
    await redis.del(lockKey);
  }
}
