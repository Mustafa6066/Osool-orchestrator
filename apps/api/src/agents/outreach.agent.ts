/**
 * Outreach Agent — autonomous multi-channel outreach orchestrator.
 *
 * Scheduled every 4 hours. Flow:
 *   1. Pull trending Egyptian RE keywords from Redis (nexus:trending)
 *   2. Fan-out reach-scan across all channels for each keyword
 *   3. Score resulting contacts via the intent agent
 *   4. Enqueue reach-enrich jobs for new contacts
 *   5. For high-scoring contacts with active campaigns, enqueue outreach-send
 */

import { BaseAgent } from './base.agent.js';
import { getRedis } from '../lib/redis.js';
import { db } from '@osool/db';
import { outreachCampaigns, contacts } from '@osool/db/schema';
import { eq, gte } from 'drizzle-orm';
import {
  getReachScanQueue,
  getOutreachSendQueue,
} from '../jobs/queue.js';

interface TrendingData {
  topDevelopers?: Array<{ name: string; count: number }>;
  topLocations?: Array<{ name: string; count: number }>;
  topIntentTypes?: Array<{ type: string; count: number }>;
}

export class OutreachAgent extends BaseAgent {
  readonly name = 'outreach';

  async run(): Promise<void> {
    const redis = getRedis();

    // Load active campaigns
    const activeCampaigns = await db
      .select()
      .from(outreachCampaigns)
      .where(eq(outreachCampaigns.active, true));

    if (activeCampaigns.length === 0) {
      await this.logToRedis('Outreach: no active campaigns, skipping');
      return;
    }

    await this.logToRedis(`Outreach: ${activeCampaigns.length} active campaigns`);

    // Load trending keywords from Redis (produced by Nexus/market-pulse job)
    const trendingRaw = await redis.get('nexus:trending');
    const trending = trendingRaw ? (JSON.parse(trendingRaw) as TrendingData) : null;

    const searchQueries = this._buildSearchQueries(trending);
    await this.logToRedis(`Outreach: scanning ${searchQueries.length} queries across channels`);

    // Fan-out reach-scan jobs
    const reachScanQueue = getReachScanQueue();
    await Promise.all(
      searchQueries.map((query, i) =>
        reachScanQueue.add(
          'reach-scan',
          { query, limit: 15, triggeredBy: 'outreach-agent' },
          { jobId: `outreach-scan-${Date.now()}-${i}` },
        ),
      ),
    );

    // Enqueue outreach-send for high-scoring contacts matched to active campaigns
    const outreachSendQueue = getOutreachSendQueue();
    let sendCount = 0;

    for (const campaign of activeCampaigns) {
      const channelMix = (campaign.channelMix as string[]) ?? ['email'];
      const targetSegment = campaign.targetSegment;

      // Find contacts matching campaign's target segment with score >= 60
      const targetContacts = await db
        .select({ id: contacts.id, score: contacts.score })
        .from(contacts)
        .where(
          targetSegment
            ? eq(contacts.icpSegment, targetSegment)
            : gte(contacts.score, 60),
        )
        .limit(50);

      for (const contact of targetContacts) {
        if ((contact.score ?? 0) < 60) continue;
        for (const channel of channelMix) {
          await outreachSendQueue.add(
            'outreach-send',
            {
              campaignId: campaign.id,
              contactId: contact.id,
              channel: channel as 'email' | 'linkedin' | 'twitter',
            },
            {
              jobId: `send-${campaign.id}-${contact.id}-${channel}`,
              deduplication: { id: `send-${campaign.id}-${contact.id}-${channel}` },
            },
          );
          sendCount++;
        }
      }
    }

    await this.logToRedis(`Outreach: ${sendCount} outreach-send jobs queued`);
  }

  private _buildSearchQueries(trending: TrendingData | null): string[] {
    const queries: string[] = [
      'egypt real estate investment 2025',
      'new cairo compound launch',
      'new capital developer',
    ];

    if (trending?.topDevelopers) {
      for (const dev of trending.topDevelopers.slice(0, 3)) {
        queries.push(`${dev.name} egypt real estate`);
      }
    }

    if (trending?.topLocations) {
      for (const loc of trending.topLocations.slice(0, 2)) {
        queries.push(`${loc.name} property investment`);
      }
    }

    return queries;
  }
}

export const outreachAgent = new OutreachAgent();
