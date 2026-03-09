/**
 * Page Content Generation Workflow
 *
 * Triggered: on keyword addition, scheduled regeneration, or admin action
 * Orchestrates: SEO content generation → keyword SEO sync feedback loop
 */
import { getSEOContentGenQueue, getFeedbackLoopQueue } from '../jobs/queue.js';
import type { SEOContentGenJobData } from '../jobs/queue.js';

export interface PageContentGenerationInput {
  pageType: SEOContentGenJobData['pageType'];
  entityId?: string;
  entityIds?: [string, string];
  locale: 'en' | 'ar';
  keywordId?: string;
  /** If true, also run keyword_seo_sync feedback loop after generation */
  runFeedback?: boolean;
}

export async function runPageContentGenerationWorkflow(
  input: PageContentGenerationInput,
): Promise<void> {
  const seoQueue = getSEOContentGenQueue();

  const jobData: SEOContentGenJobData = {
    pageType: input.pageType,
    entityId: input.entityId,
    entityIds: input.entityIds,
    locale: input.locale,
    keywordId: input.keywordId,
  };

  const slug = [input.pageType, input.entityId ?? input.entityIds?.join('-'), input.locale]
    .filter(Boolean)
    .join(':');

  // Step 1: Generate new content
  await seoQueue.add('generate-seo-content', jobData, {
    jobId: `seo:${slug}:${new Date().toISOString().slice(0, 10)}`,
    priority: 3,
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 50 },
  });

  if (!input.runFeedback) return;

  // Step 2: Run keyword_seo_sync feedback loop (after generation delay)
  const feedbackQueue = getFeedbackLoopQueue();
  await feedbackQueue.add(
    'run-feedback-loop',
    { loopType: 'keyword_seo_sync' as const },
    {
      delay: 10_000,
      removeOnComplete: { count: 50 },
      removeOnFail: { count: 20 },
    },
  );
}
