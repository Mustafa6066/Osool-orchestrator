import { BaseAgent } from './base.agent.js';
import { getAudienceSyncQueue, getSEOContentGenQueue, getFeedbackLoopQueue } from '../jobs/queue.js';
import { db } from '@osool/db';
import { campaigns, keywords, retargetingAudiences } from '@osool/db/schema';
import { eq, and } from 'drizzle-orm';

/**
 * Marketing Agent — orchestrates audience synchronisation, SEO content generation,
 * and performance-based feedback loops for all active campaigns.
 */
export class MarketingAgent extends BaseAgent {
  readonly name = 'marketing';

  async run(): Promise<void> {
    await Promise.all([
      this.syncAudiences(),
      this.scheduleSEOContent(),
      this.runPerformanceFeedback(),
    ]);
  }

  private async syncAudiences(): Promise<void> {
    await this.logToRedis('Marketing: syncing retargeting audiences');
    const audienceQueue = getAudienceSyncQueue();

    const activeCampaigns = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.status, 'active'));

    const audiences = await db
      .select()
      .from(retargetingAudiences)
      .where(eq(retargetingAudiences.active, true));

    // For each active campaign, use associated retargeting audiences
    const jobs = audiences.map((audience) =>
      audienceQueue.add(
        'sync-audience',
        {
          segment: (audience as { segment?: string }).segment ?? 'all',
          platform: audience.platform as 'meta' | 'google',
          campaignId: activeCampaigns.find((c) => (c as { name: string }).name)?.id ?? 'default',
        },
        { removeOnComplete: { count: 50 }, removeOnFail: { count: 20 } },
      ),
    );

    await Promise.all(jobs);
    await this.logToRedis(`Marketing: ${audiences.length} audience sync jobs queued`);
  }

  private async scheduleSEOContent(): Promise<void> {
    await this.logToRedis('Marketing: scheduling SEO content generation');
    const seoQueue = getSEOContentGenQueue();

    const pendingKeywords = await db
      .select({ id: keywords.id, keyword: keywords.keyword, locale: keywords.language })
      .from(keywords)
      .limit(10);

    const jobs = pendingKeywords.map((kw) =>
      seoQueue.add(
        'generate-seo-content',
        {
          pageType: 'buying_guide' as const,
          locale: (kw.locale as 'en' | 'ar') ?? 'en',
          keywordId: kw.id,
        },
        {
          jobId: `seo-${kw.id}-${new Date().toISOString().slice(0, 10)}`,
          removeOnComplete: { count: 50 },
          removeOnFail: { count: 20 },
        },
      ),
    );

    await Promise.all(jobs);
    await this.logToRedis(`Marketing: ${pendingKeywords.length} SEO content jobs queued`);
  }

  private async runPerformanceFeedback(): Promise<void> {
    await this.logToRedis('Marketing: triggering audience performance feedback loop');
    const feedbackQueue = getFeedbackLoopQueue();

    await feedbackQueue.add(
      'run-feedback-loop',
      { loopType: 'audience_performance_sync' as const },
      { removeOnComplete: { count: 50 }, removeOnFail: { count: 20 } },
    );
    await this.logToRedis('Marketing: audience_performance_sync feedback loop queued');
  }
}

export const marketingAgent = new MarketingAgent();
