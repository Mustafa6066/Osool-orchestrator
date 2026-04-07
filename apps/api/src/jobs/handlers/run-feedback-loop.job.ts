/**
 * run-feedback-loop.job.ts
 *
 * Executes one of 5 feedback loop types that close the intelligence gap
 * between real-world performance and system configuration:
 *
 *   keyword_seo_sync          — surface rising keywords → queue SEO content
 *   audience_performance_sync — cull underperforming audiences
 *   email_sequence_optimize   — identify low-performing steps → flag for rewrite
 *   lead_scoring_recalibrate  — compare score tiers to actual conversion rate
 *   content_gap_analysis      — list high-volume intents with no SEO page
 */

import { db } from '@osool/db';
import {
  keywords,
  seoContent,
  emailSends,
  emailSequences,
  intentSignals,
  feedbackLoopEvents,
  campaigns,
  campaignMetrics,
} from '@osool/db/schema';
import { eq, and, desc, asc, count, gte, sql, notInArray, lt } from 'drizzle-orm';
import { getRedis } from '../../lib/redis.js';
import { getSEOContentGenQueue, getFeedbackLoopQueue, type FeedbackLoopJobData } from '../queue.js';

export async function runFeedbackLoop(data: FeedbackLoopJobData): Promise<{ type: string; actionsTriggered: number }> {
  const { loopType } = data;
  let actionsTriggered = 0;

  switch (loopType) {
    case 'keyword_seo_sync':
      actionsTriggered = await keywordSEOSync();
      break;
    case 'audience_performance_sync':
      actionsTriggered = await audiencePerformanceSync();
      break;
    case 'email_sequence_optimize':
      actionsTriggered = await emailSequenceOptimize();
      break;
    case 'lead_scoring_recalibrate':
      actionsTriggered = await leadScoringRecalibrate();
      break;
    case 'content_gap_analysis':
      actionsTriggered = await contentGapAnalysis();
      break;
    case 'icp_learning_update':
      actionsTriggered = await icpLearningUpdate();
      break;
  }

  // Record feedback loop event
  await db.insert(feedbackLoopEvents).values({
    source: 'orchestrator',
    eventType: 'loop_run',
    loopType,
    actionsTriggered,
    runAt: new Date(),
    summary: { type: loopType, triggered: actionsTriggered },
  });

  return { type: loopType, actionsTriggered };
}

// ── Loop implementations ──────────────────────────────────────────────────────

/** Surface trending keywords that don't have published SEO content yet. */
async function keywordSEOSync(): Promise<number> {
  const redis = getRedis();
  const trendingRaw = await redis.get('nexus:trending');
  if (!trendingRaw) return 0;

  const trending = JSON.parse(trendingRaw) as {
    trendingDevelopers?: { id: string; name: string }[];
    trendingLocations?: { id: string; name: string; slug: string }[];
  };

  const seoGenQ = getSEOContentGenQueue();
  let queued = 0;

  // Queue developer profile pages for trending devs not already published
  for (const dev of trending.trendingDevelopers ?? []) {
    for (const locale of ['en', 'ar'] as const) {
      const slug = dev.id;
      const [existing] = await db
        .select({ id: seoContent.id })
        .from(seoContent)
        .where(and(eq(seoContent.pageType, 'developer_profile'), eq(seoContent.slug, slug), eq(seoContent.locale, locale), eq(seoContent.status, 'published')));

      if (!existing) {
        await seoGenQ.add(`dev-profile-${slug}-${locale}`, {
          pageType: 'developer_profile',
          slug,
          locale,
          entityId: dev.id,
        });
        queued++;
      }
    }
  }

  return queued;
}

/** Pause campaigns with CTR below threshold. */
async function audiencePerformanceSync(): Promise<number> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  // Find campaigns with very low CTR
  const lowPerformers = await db
    .select({ id: campaigns.id, name: campaigns.name })
    .from(campaigns)
    .innerJoin(campaignMetrics, eq(campaignMetrics.campaignId, campaigns.id))
    .where(and(eq(campaigns.status, 'active'), gte(campaignMetrics.date, thirtyDaysAgo), lt(campaignMetrics.ctr, '0.3')))
    .groupBy(campaigns.id, campaigns.name)
    .limit(10);

  if (lowPerformers.length === 0) return 0;

  // Flag for review (don't auto-pause — require human confirmation)
  const redis = getRedis();
  await redis.set('admin:low_performer_campaigns', JSON.stringify(lowPerformers.map((c) => c.id)), 'EX', 86400);

  return lowPerformers.length;
}

/** Identify email steps with below-average delivery and flag for rewrite. */
async function emailSequenceOptimize(): Promise<number> {
  const sequences = await db.select().from(emailSequences).limit(20);
  let flagged = 0;

  for (const seq of sequences) {
    const [row] = await db
      .select({
        total: count(),
        failed: sql<number>`SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END)`,
      })
      .from(emailSends)
      .where(eq(emailSends.sequenceId, seq.id));

    const total = Number(row?.total ?? 0);
    if (total < 10) continue;

    const failRate = Number(row?.failed ?? 0) / total;
    if (failRate > 0.2) {
      const redis = getRedis();
      await redis.lpush('admin:flagged_email_sequences', seq.id);
      flagged++;
    }
  }

  return flagged;
}

/** Compare intent confidence to conversion rate and log calibration notes. */
async function leadScoringRecalibrate(): Promise<number> {
  const redis = getRedis();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  // Count intents by type
  const byType = await db
    .select({ intentType: intentSignals.intentType, cnt: count() })
    .from(intentSignals)
    .where(gte(intentSignals.createdAt, sevenDaysAgo))
    .groupBy(intentSignals.intentType)
    .orderBy(desc(count()));

  await redis.set('analytics:intent_distribution_7d', JSON.stringify(byType), 'EX', 86400);

  return byType.length;
}

/** Find intent types with no matching SEO pages. */
async function contentGapAnalysis(): Promise<number> {
  const redis = getRedis();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  // High-frequency entity mentions without SEO pages
  const topEntities = await db
    .select({
      intentType: intentSignals.intentType,
      cnt: count(),
    })
    .from(intentSignals)
    .where(gte(intentSignals.createdAt, sevenDaysAgo))
    .groupBy(intentSignals.intentType)
    .orderBy(desc(count()))
    .limit(20);

  // Find gaps (comparison intents without published comparison pages)
  const comparisonIntents = topEntities.filter((e) => e.intentType === 'comparison');
  const gaps: string[] = [];

  if (comparisonIntents.length > 0) {
    // Surface unpublished comparison pages
    const unpublished = await db
      .select({ slug: seoContent.slug })
      .from(seoContent)
      .where(and(eq(seoContent.pageType, 'developer_comparison'), eq(seoContent.status, 'draft')));

    gaps.push(...unpublished.map((u) => u.slug));
  }

  if (gaps.length > 0) {
    await redis.set('admin:content_gaps', JSON.stringify(gaps), 'EX', 86400);
    
    // Queue generation for gaps
    const seoGenQ = getSEOContentGenQueue();
    for (const slug of gaps.slice(0, 5)) {
      // Parse slug format generated by comparisonSlug(devA, devB): "dev-a-vs-dev-b"
      const match = slug.match(/^(.*)-vs-(.*)$/);
      const devA = match?.[1]?.trim();
      const devB = match?.[2]?.trim();
      if (!devA || !devB) continue;

      for (const locale of ['en', 'ar'] as const) {
        await seoGenQ.add(`comparison-${slug}-${locale}`, {
          pageType: 'developer_comparison',
          slug,
          locale,
          entityIds: [devA, devB],
        });
      }
    }
  }

  return gaps.length;
}

/** Run ICP learning analysis and store weight recommendations. */
async function icpLearningUpdate(): Promise<number> {
  const { generateICPReport } = await import('../../services/icp-learning.service.js');
  const redis = getRedis();

  const report = await generateICPReport(30);
  await redis.set('icp:learning:latest', JSON.stringify(report), 'EX', 7 * 86400);

  return report.recommendations.length;
}
