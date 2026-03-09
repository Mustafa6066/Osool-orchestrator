/**
 * score-lead.job.ts
 *
 * Computes a composite lead score for a session based on:
 *   - Number of intent signals (breadth)
 *   - Intent types (quality: roi_inquiry > comparison > general)
 *   - Confidence levels (reliability)
 *   - Page views and funnel stage
 *   - Signup or waitlist join (major boost)
 *
 * Stores the score in Redis and the DB, then triggers email sequence
 * if score crosses the 60/80/95 thresholds.
 */

import { db } from '@osool/db';
import { intentSignals, funnelEvents, users } from '@osool/db/schema';
import { eq, count, desc } from 'drizzle-orm';
import { getRedis } from '../../lib/redis.js';
import { getEmailTriggerQueue, type LeadScoringJobData } from '../queue.js';

const INTENT_SCORES: Record<string, number> = {
  comparison: 20,
  roi_inquiry: 25,
  price_check: 15,
  developer_review: 18,
  area_research: 15,
  payment_plan: 22,
  general: 5,
};

const SEGMENT_MULTIPLIERS: Record<string, number> = {
  expat_investor: 1.4,
  domestic_hnw: 1.2,
  institutional: 1.3,
  first_time_buyer: 1.0,
};

export async function scoreLeadSession(data: LeadScoringJobData): Promise<{ score: number; tier: string }> {
  const redis = getRedis();

  // Load most recent intent signals for this session (last 50)
  const signals = await db
    .select()
    .from(intentSignals)
    .where(eq(intentSignals.sessionId, data.sessionId))
    .orderBy(desc(intentSignals.createdAt))
    .limit(50);

  if (signals.length === 0) {
    return { score: 0, tier: 'cold' };
  }

  // Base score from intent quality
  let baseScore = 0;
  let avgConfidence = 0;
  let dominantSegment = 'first_time_buyer';

  const segmentCounts: Record<string, number> = {};
  for (const signal of signals) {
    baseScore += INTENT_SCORES[signal.intentType] ?? 5;
    avgConfidence += (signal.confidence ?? 50) / 100; // confidence is 0-100 integer → normalize to 0-1
    const seg = signal.segment ?? 'first_time_buyer';
    segmentCounts[seg] = (segmentCounts[seg] ?? 0) + 1;
  }

  avgConfidence /= signals.length;
  dominantSegment = Object.entries(segmentCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'first_time_buyer';

  // Unique intent types bonus
  const uniqueIntents = new Set(signals.map((s) => s.intentType));
  const diversityBonus = Math.min(uniqueIntents.size * 5, 20);

  // Recency: signals in last 24h count double
  const recentCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recentBonus = signals.filter((s) => new Date(s.createdAt) > recentCutoff).length * 2;

  // Trigger-based bonus
  const triggerBonus = data.trigger === 'signup' ? 30 : data.trigger === 'ad_click' ? 15 : 0;

  // Signup/user account boost
  let signupBoost = 0;
  if (data.userId) {
    const [userRow] = await db.select({ c: count() }).from(users).where(eq(users.id, data.userId));
    if (Number(userRow?.c ?? 0) > 0) signupBoost = 20;
  }

  // Funnel events
  const [funnelRow] = await db
    .select({ c: count() })
    .from(funnelEvents)
    .where(eq(funnelEvents.sessionId, data.sessionId));
  const funnelBonus = Math.min(Number(funnelRow?.c ?? 0) * 3, 15);

  // Compute raw score
  const multiplier = SEGMENT_MULTIPLIERS[dominantSegment] ?? 1.0;
  const rawScore =
    (baseScore + diversityBonus + recentBonus + triggerBonus + signupBoost + funnelBonus) *
    avgConfidence *
    multiplier;

  const score = Math.max(0, Math.min(100, Math.round(rawScore)));

  // Tier classification
  const tier = score >= 85 ? 'hot' : score >= 60 ? 'warm' : score >= 30 ? 'nurture' : 'cold';

  // Store in Redis
  await redis.set(`lead:score:${data.anonymousId}`, JSON.stringify({ score, tier, segment: dominantSegment, updatedAt: new Date().toISOString() }), 'EX', 86400 * 7);

  // Trigger email sequence if threshold crossed
  if (score >= 30) {
    const triggerQ = getEmailTriggerQueue();
    await triggerQ.add('score-threshold', {
      sessionId: data.sessionId,
      userId: data.userId,
      anonymousId: data.anonymousId,
      trigger: 'lead_score_threshold' as const,
      score,
      segment: dominantSegment,
    });
  }

  return { score, tier };
}
