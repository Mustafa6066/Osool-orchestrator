/**
 * reach-scan.job.ts
 *
 * Fan-out across all Agent-Reach channels (RSS, web, Twitter, YouTube, LinkedIn).
 * For each hit, writes a ReachItem to Redis and enqueues a reach-enrich job
 * for any contact signals found.
 *
 * Triggered by the outreach agent every 4 hours.
 */

import { createReachManager } from '@osool/reach';
import { getRedis } from '../../lib/redis.js';
import { getReachEnrichQueue } from '../queue.js';
import type { ReachScanJobData } from '../queue.js';

const SCAN_TTL = 4 * 60 * 60; // 4h — align with outreach cycle

export async function runReachScan(
  data: ReachScanJobData,
): Promise<{ found: number; enqueued: number }> {
  const manager = createReachManager();
  const redis = getRedis();
  const enrichQueue = getReachEnrichQueue();

  const items = await manager.search(data.query, {
    channels: data.channels,
    limit: data.limit ?? 20,
    since: new Date(Date.now() - SCAN_TTL * 1000),
  });

  let enqueued = 0;

  for (const item of items) {
    // Cache raw item in Redis for the outreach agent to pick up
    const key = `reach:item:${item.channel}:${encodeURIComponent(item.id)}`;
    await redis.set(key, JSON.stringify(item), 'EX', SCAN_TTL);

    // If this item has a contact signal (author handle), enrich it
    if (item.author && (item.channel === 'twitter' || item.channel === 'linkedin')) {
      await enrichQueue.add(
        'reach-enrich',
        {
          contactId: `${item.channel}:${item.author}`,
          platform: item.channel,
          handle: item.author,
          sourceMetadata: item.metadata,
        },
        { deduplication: { id: `enrich-${item.channel}-${item.author}` } },
      );
      enqueued++;
    }
  }

  return { found: items.length, enqueued };
}
