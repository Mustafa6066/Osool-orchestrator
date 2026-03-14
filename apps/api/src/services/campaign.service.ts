/**
 * Campaign Service — campaign and retargeting audience helpers
 */
import { db } from '@osool/db';
import { campaigns, campaignMetrics, retargetingAudiences } from '@osool/db/schema';
import { eq, desc, sql, and, gte } from 'drizzle-orm';

export async function getActiveCampaigns() {
  return db.select().from(campaigns).where(eq(campaigns.status, 'active'));
}

export async function getAllCampaignsWithMetrics() {
  const rows = await db
    .select({
      id: campaigns.id,
      name: campaigns.name,
      type: campaigns.objective,
      platform: campaigns.platform,
      status: campaigns.status,
      budget: campaigns.budgetTotal,
      createdAt: campaigns.createdAt,
      // Latest metrics aggregated
      spent: sql<number>`sum(${campaignMetrics.spend})::numeric`,
      impressions: sql<number>`sum(${campaignMetrics.impressions})::int`,
      clicks: sql<number>`sum(${campaignMetrics.clicks})::int`,
      conversions: sql<number>`sum(${campaignMetrics.conversions})::int`,
    })
    .from(campaigns)
    .leftJoin(campaignMetrics, eq(campaigns.id, campaignMetrics.campaignId))
    .groupBy(
      campaigns.id,
      campaigns.name,
      campaigns.objective,
      campaigns.platform,
      campaigns.status,
      campaigns.budgetTotal,
      campaigns.createdAt,
    )
    .orderBy(desc(campaigns.createdAt));
  return rows;
}

export async function setCampaignActive(id: string, active: boolean) {
  await db.update(campaigns).set({ status: active ? 'active' : 'paused' }).where(eq(campaigns.id, id));
}

export async function getActiveAudiences(platform?: 'meta' | 'google') {
  const where = platform
    ? and(eq(retargetingAudiences.active, true), eq(retargetingAudiences.platform, platform))
    : eq(retargetingAudiences.active, true);
  return db.select().from(retargetingAudiences).where(where);
}

export async function getCampaignPerformanceSummary(days = 30) {
  const since = new Date(Date.now() - days * 86400_000);
  return db
    .select({
      date: campaignMetrics.date,
      totalSpend: sql<number>`sum(${campaignMetrics.spend})::numeric`,
      totalImpressions: sql<number>`sum(${campaignMetrics.impressions})::int`,
      totalClicks: sql<number>`sum(${campaignMetrics.clicks})::int`,
      totalConversions: sql<number>`sum(${campaignMetrics.conversions})::int`,
    })
    .from(campaignMetrics)
    .where(gte(campaignMetrics.date, since))
    .groupBy(campaignMetrics.date)
    .orderBy(campaignMetrics.date);
}
