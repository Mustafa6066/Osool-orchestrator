/**
 * Audience Sync Workflow
 *
 * Triggered: after lead scoring, scheduled campaign refresh, or marketing agent run
 * Orchestrates: Meta audience sync → Google audience sync → performance feedback loop
 */
import { getAudienceSyncQueue, getFeedbackLoopQueue } from '../jobs/queue.js';

export interface AudienceSyncInput {
  segment?: 'high_value' | 'qualified' | 'engaged' | 'all';
  platforms?: Array<'meta' | 'google'>;
  campaignId?: string;
  /** If true, run audience performance feedback loop after sync */
  runFeedback?: boolean;
}

export async function runAudienceSyncWorkflow(input: AudienceSyncInput): Promise<void> {
  const audienceSyncQueue = getAudienceSyncQueue();
  const segment = input.segment ?? 'all';
  const platforms = input.platforms ?? ['meta', 'google'];
  const campaignId = input.campaignId ?? 'default';

  // Sync all specified platforms concurrently
  await Promise.all(
    platforms.map((platform) =>
      audienceSyncQueue.add(
        'sync-audience',
        { segment, platform, campaignId },
        {
          jobId: `audience:${platform}:${segment}:${Date.now()}`,
          priority: 3,
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: { count: 100 },
          removeOnFail: { count: 50 },
        },
      ),
    ),
  );

  if (!input.runFeedback) return;

  // After sync, evaluate performance changes
  const feedbackQueue = getFeedbackLoopQueue();
  await feedbackQueue.add(
    'run-feedback-loop',
    { loopType: 'audience_performance_sync' as const },
    {
      delay: 15_000, // Give the sync jobs time to complete
      removeOnComplete: { count: 50 },
      removeOnFail: { count: 20 },
    },
  );
}
