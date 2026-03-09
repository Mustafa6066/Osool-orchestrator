/**
 * Feedback Loop Workflow
 *
 * Triggered: on schedule (every 6h from workers.ts) or by agent actions
 * Orchestrates: all 5 feedback loop types in priority order
 */
import { getFeedbackLoopQueue } from '../jobs/queue.js';
import type { FeedbackLoopJobData } from '../jobs/queue.js';

const LOOP_TYPES: FeedbackLoopJobData['loopType'][] = [
  'keyword_seo_sync',
  'audience_performance_sync',
  'email_sequence_optimize',
  'lead_scoring_recalibrate',
  'content_gap_analysis',
];

export interface FeedbackLoopWorkflowInput {
  /** Run specific types only, or all if not specified */
  loopTypes?: FeedbackLoopJobData['loopType'][];
  /** Stagger jobs by this many ms (default 30s) to avoid DB lock contention */
  staggerMs?: number;
}

export async function runFeedbackLoopWorkflow(input: FeedbackLoopWorkflowInput = {}): Promise<void> {
  const { loopTypes = LOOP_TYPES, staggerMs = 30_000 } = input;
  const feedbackQueue = getFeedbackLoopQueue();

  // Enqueue each loop type with increasing delays so they don't all hammer the DB at once
  await Promise.all(
    loopTypes.map((loopType, idx) =>
      feedbackQueue.add(
        'run-feedback-loop',
        { loopType },
        {
          jobId: `feedback:${loopType}:${new Date().toISOString().slice(0, 13)}`,
          delay: idx * staggerMs,
          priority: 5,
          attempts: 2,
          backoff: { type: 'fixed', delay: 60_000 },
          removeOnComplete: { count: 100 },
          removeOnFail: { count: 50 },
        },
      ),
    ),
  );
}
