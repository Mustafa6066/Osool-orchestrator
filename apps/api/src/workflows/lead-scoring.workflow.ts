/**
 * Lead Scoring Workflow
 *
 * Triggered: on session end, signup, or scheduled recalibration
 * Orchestrates: composite scoring → tier assignment → audience sync → email trigger
 */
import { getLeadScoringQueue, getAudienceSyncQueue, getEmailTriggerQueue } from '../jobs/queue.js';

export interface LeadScoringInput {
  sessionId: string;
  /** If true, also sync to ad platforms and re-evaluate email triggers */
  fullPipeline?: boolean;
  /** Platform to sync audience on ('meta' | 'google' | 'both') */
  adPlatform?: 'meta' | 'google' | 'both';
}

export async function runLeadScoringWorkflow(input: LeadScoringInput): Promise<void> {
  const scoringQueue = getLeadScoringQueue();

  // Step 1: Score the lead
  await scoringQueue.add(
    'score-lead',
    { sessionId: input.sessionId },
    {
      jobId: `score:${input.sessionId}:${Date.now()}`,
      priority: 2,
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
      removeOnComplete: { count: 200 },
      removeOnFail: { count: 50 },
    },
  );

  if (!input.fullPipeline) return;

  const platforms: Array<'meta' | 'google'> =
    input.adPlatform === 'both' ? ['meta', 'google'] : [input.adPlatform ?? 'meta'];

  const audienceSyncQueue = getAudienceSyncQueue();
  const emailTriggerQueue = getEmailTriggerQueue();

  // Step 2: Sync to ad platforms (after a brief delay for scoring to complete)
  await Promise.all(
    platforms.map((platform) =>
      audienceSyncQueue.add(
        'sync-audience',
        {
          segment: 'all',
          platform,
          campaignId: 'auto',
        },
        {
          delay: 4000,
          attempts: 3,
          removeOnComplete: { count: 100 },
          removeOnFail: { count: 50 },
        },
      ),
    ),
  );

  // Step 3: Re-evaluate email triggers
  await emailTriggerQueue.add(
    'check-email-triggers',
    { sessionId: input.sessionId },
    {
      delay: 6000,
      jobId: `email-trigger:${input.sessionId}:${Date.now()}`,
      attempts: 3,
      removeOnComplete: { count: 200 },
      removeOnFail: { count: 50 },
    },
  );
}
