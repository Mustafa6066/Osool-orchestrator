/**
 * ICP Learning Service — auto-improve ICP segment definitions and scoring
 * multipliers based on actual conversion data.
 *
 * Analyzes which segments actually convert, then recommends adjustments
 * to scoring weights so the lead scoring model improves over time.
 */

import { db } from '@osool/db';
import { funnelEvents, intentSignals, waitlist } from '@osool/db/schema';
import { gte, count, eq, sql, desc } from 'drizzle-orm';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SegmentPerformance {
  segment: string;
  totalLeads: number;
  conversions: number;
  conversionRate: number;
  avgEngagement: number;
}

export interface ICPRecommendation {
  segment: string;
  currentWeight: number;
  suggestedWeight: number;
  rationale: string;
  confidence: 'high' | 'medium' | 'low';
}

export interface ICPLearningReport {
  generatedAt: string;
  segmentPerformance: SegmentPerformance[];
  recommendations: ICPRecommendation[];
  topConvertingIntents: { intentType: string; count: number }[];
  topConvertingSources: { source: string; count: number }[];
}

// ── ICP Segment Weights (current defaults from shared/constants) ─────────────

const DEFAULT_WEIGHTS: Record<string, number> = {
  expat_investor: 1.4,
  domestic_hnw: 1.3,
  first_time_buyer: 1.0,
  diaspora_egyptian: 1.2,
  institutional: 1.5,
  unknown: 0.8,
};

// ── Analysis Functions ────────────────────────────────────────────────────────

/**
 * Analyze conversion rates by segment over the past N days.
 */
export async function analyzeSegmentConversions(days = 30): Promise<SegmentPerformance[]> {
  const since = new Date();
  since.setDate(since.getDate() - days);

  // Get all funnel events grouped by segment (from metadata)
  const events = await db
    .select({
      stage: funnelEvents.stage,
      segment: sql<string>`COALESCE(${funnelEvents.properties}->>'segment', 'unknown')`.as('segment'),
      cnt: count(),
    })
    .from(funnelEvents)
    .where(gte(funnelEvents.createdAt, since))
    .groupBy(funnelEvents.stage, sql`COALESCE(${funnelEvents.properties}->>'segment', 'unknown')`)
    .orderBy(desc(count()));

  // Aggregate by segment
  const segmentMap = new Map<string, { total: number; conversions: number; engagement: number }>();

  for (const event of events) {
    const seg = event.segment ?? 'unknown';
    if (!segmentMap.has(seg)) {
      segmentMap.set(seg, { total: 0, conversions: 0, engagement: 0 });
    }
    const data = segmentMap.get(seg)!;
    data.total += Number(event.cnt);

    // High-value stages count as conversions
    if (['signup', 'waitlist_join', 'reservation', 'qualified_lead'].includes(event.stage)) {
      data.conversions += Number(event.cnt);
    }
    // Engagement proxy
    if (['page_view', 'chat_start', 'property_view'].includes(event.stage)) {
      data.engagement += Number(event.cnt);
    }
  }

  return Array.from(segmentMap.entries()).map(([segment, data]) => ({
    segment,
    totalLeads: data.total,
    conversions: data.conversions,
    conversionRate: data.total > 0 ? data.conversions / data.total : 0,
    avgEngagement: data.total > 0 ? data.engagement / data.total : 0,
  }));
}

/**
 * Generate weight adjustment recommendations based on actual conversion data.
 */
export function generateRecommendations(
  performance: SegmentPerformance[],
): ICPRecommendation[] {
  if (performance.length === 0) return [];

  // Calculate average conversion rate as baseline
  const totalConversions = performance.reduce((sum, p) => sum + p.conversions, 0);
  const totalLeads = performance.reduce((sum, p) => sum + p.totalLeads, 0);
  const avgRate = totalLeads > 0 ? totalConversions / totalLeads : 0;

  const recommendations: ICPRecommendation[] = [];

  for (const seg of performance) {
    const currentWeight = DEFAULT_WEIGHTS[seg.segment] ?? 1.0;
    const rateRatio = avgRate > 0 ? seg.conversionRate / avgRate : 1;

    // Only recommend changes if there's meaningful data and a significant deviation
    if (seg.totalLeads < 10) {
      recommendations.push({
        segment: seg.segment,
        currentWeight,
        suggestedWeight: currentWeight,
        rationale: `Insufficient data (${seg.totalLeads} leads) — no change recommended`,
        confidence: 'low',
      });
      continue;
    }

    // If conversion rate is >50% higher than average, suggest weight increase
    if (rateRatio > 1.5) {
      const suggestedWeight = Math.min(currentWeight * 1.2, 2.0);
      recommendations.push({
        segment: seg.segment,
        currentWeight,
        suggestedWeight: Math.round(suggestedWeight * 10) / 10,
        rationale: `Converts at ${(rateRatio * 100).toFixed(0)}% of average — increase weight from ${currentWeight} to ${suggestedWeight.toFixed(1)}`,
        confidence: seg.totalLeads >= 50 ? 'high' : 'medium',
      });
    }
    // If conversion rate is <50% of average, suggest weight decrease
    else if (rateRatio < 0.5 && seg.totalLeads >= 20) {
      const suggestedWeight = Math.max(currentWeight * 0.8, 0.5);
      recommendations.push({
        segment: seg.segment,
        currentWeight,
        suggestedWeight: Math.round(suggestedWeight * 10) / 10,
        rationale: `Converts at only ${(rateRatio * 100).toFixed(0)}% of average — decrease weight from ${currentWeight} to ${suggestedWeight.toFixed(1)}`,
        confidence: seg.totalLeads >= 50 ? 'high' : 'medium',
      });
    } else {
      recommendations.push({
        segment: seg.segment,
        currentWeight,
        suggestedWeight: currentWeight,
        rationale: `Conversion rate is within normal range (${(seg.conversionRate * 100).toFixed(1)}%) — no change needed`,
        confidence: 'medium',
      });
    }
  }

  return recommendations;
}

/**
 * Get top converting intent types.
 */
export async function getTopConvertingIntents(days = 30): Promise<{ intentType: string; count: number }[]> {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const results = await db
    .select({
      intentType: intentSignals.intentType,
      cnt: count(),
    })
    .from(intentSignals)
    .where(gte(intentSignals.createdAt, since))
    .groupBy(intentSignals.intentType)
    .orderBy(desc(count()))
    .limit(10);

  return results.map((r) => ({ intentType: r.intentType, count: Number(r.cnt) }));
}

/**
 * Run full ICP learning analysis.
 */
export async function generateICPReport(days = 30): Promise<ICPLearningReport> {
  const [performance, topIntents] = await Promise.all([
    analyzeSegmentConversions(days),
    getTopConvertingIntents(days),
  ]);

  const recommendations = generateRecommendations(performance);

  return {
    generatedAt: new Date().toISOString(),
    segmentPerformance: performance,
    recommendations,
    topConvertingIntents: topIntents,
    topConvertingSources: [], // Populated when source tracking is available
  };
}
