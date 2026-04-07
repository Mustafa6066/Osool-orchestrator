/**
 * seo-intelligence.job.ts
 *
 * Runs weekly SEO intelligence analysis: content fingerprinting,
 * keyword opportunities, competitor gaps, and decay alerts.
 * Stores results in Redis for 7 days.
 */

import { getRedis } from '../../lib/redis.js';
import { generateIntelligenceReport } from '../../services/seo-intelligence.service.js';
import type { SEOIntelligenceJobData } from '../queue.js';

const REDIS_KEY = 'seo:intelligence:latest';
const TTL_7_DAYS = 60 * 60 * 24 * 7;

export async function runSEOIntelligence(
  data: SEOIntelligenceJobData,
): Promise<{ keywordCount: number; decayCount: number; gapCount: number }> {
  const report = await generateIntelligenceReport();

  // Store in Redis
  const redis = getRedis();
  await redis.set(REDIS_KEY, JSON.stringify(report), 'EX', TTL_7_DAYS);

  return {
    keywordCount: report.keywordOpportunities.length,
    decayCount: report.decayAlerts.length,
    gapCount: report.competitorGaps.length,
  };
}
