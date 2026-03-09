/**
 * sync-audience.job.ts
 *
 * Syncs a lead's profile to Meta and/or Google retargeting audiences
 * based on their ICP segment. Creates or updates the audience list,
 * then adds the user's hashed identifiers.
 */

import { db } from '@osool/db';
import { retargetingAudiences } from '@osool/db/schema';
import { eq, and } from 'drizzle-orm';
import { getRedis } from '../../lib/redis.js';
import * as MetaAdsClient from '../../lib/integrations/meta-ads.client.js';
import * as GoogleAdsClient from '../../lib/integrations/google-ads.client.js';
import { type AudienceSyncJobData } from '../queue.js';
import { getConfig } from '../../config.js';
import crypto from 'node:crypto';

function hashEmail(email: string): string {
  return crypto.createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
}

const AUDIENCE_NAMES: Record<string, string> = {
  expat_investor: 'Osool — Expat Investors',
  domestic_hnw: 'Osool — High Net Worth',
  first_time_buyer: 'Osool — First Time Buyers',
  institutional: 'Osool — Institutional',
};

export async function syncAudience(data: AudienceSyncJobData): Promise<{ synced: string[] }> {
  const redis = getRedis();
  const cfg = getConfig();
  const synced: string[] = [];

  // Get lead email from Redis (stored during signup)
  const leadStr = await redis.get(`lead:profile:${data.anonymousId}`);
  if (!leadStr) {
    // No email available — skip sync, not an error
    return { synced: [] };
  }

  const lead = JSON.parse(leadStr) as { email?: string; name?: string };
  if (!lead.email) return { synced: [] };

  const hashedEmail = hashEmail(lead.email);
  const segment = data.segment ?? 'general';
  const audienceName = AUDIENCE_NAMES[segment] ?? 'Osool — General';

  // Sync to Meta
  if ((data.channels ?? []).includes('meta') && cfg.META_ACCESS_TOKEN && cfg.META_AD_ACCOUNT_ID) {
    const meta = MetaAdsClient;

    // Check if audience already exists in DB
    const [existing] = await db
      .select()
      .from(retargetingAudiences)
      .where(and(eq(retargetingAudiences.segment, segment), eq(retargetingAudiences.platform, 'meta')));

    let audienceId: string;
    if (existing) {
      audienceId = existing.platformAudienceId ?? existing.externalId ?? '';
    } else {
      const created = await meta.createCustomAudience(audienceName, `Osool orchestrator segment: ${segment}`);
      audienceId = created.id;

      await db.insert(retargetingAudiences).values({
        name: audienceName,
        audienceName,
        segment,
        platform: 'meta',
        platformAudienceId: audienceId,
        externalId: audienceId,
        memberCount: 0,
        status: 'active',
      });
    }

    await meta.syncAudience(audienceId, { audienceName, userEmails: [hashedEmail] });
    synced.push('meta');
  }

  // Sync to Google
  if ((data.channels ?? []).includes('google') && cfg.GOOGLE_ADS_REFRESH_TOKEN && cfg.GOOGLE_ADS_CUSTOMER_ID) {
    const google = GoogleAdsClient;

    const [existingGoogle] = await db
      .select()
      .from(retargetingAudiences)
      .where(and(eq(retargetingAudiences.segment, segment), eq(retargetingAudiences.platform, 'google')));

    let listId: string;
    if (existingGoogle) {
      listId = existingGoogle.platformAudienceId ?? existingGoogle.externalId ?? '';
    } else {
      const created = await google.createAudienceList(audienceName, `Osool segment: ${segment}`);
      listId = created.resourceName;

      await db.insert(retargetingAudiences).values({
        name: audienceName,
        audienceName,
        segment,
        platform: 'google',
        platformAudienceId: listId,
        externalId: listId,
        memberCount: 0,
        status: 'active',
      });
    }

    await google.uploadAudienceMembers(listId, [hashedEmail]);
    synced.push('google');
  }

  return { synced };
}
