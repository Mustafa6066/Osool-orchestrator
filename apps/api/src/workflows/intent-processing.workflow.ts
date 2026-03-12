/**
 * Intent Processing Workflow
 *
 * Triggered: when a chat message arrives via POST /webhook/chat-message
 * Orchestrates: intent parsing → lead scoring → email trigger evaluation
 */
import { getIntentQueue, getLeadScoringQueue, getEmailTriggerQueue } from '../jobs/queue.js';
import type { IntentJobData } from '../jobs/queue.js';

export interface IntentProcessingInput {
  sessionId: string;
  message: string;
  anonymousId?: string;
  pageContext?: Record<string, unknown>;
}

export async function runIntentProcessingWorkflow(input: IntentProcessingInput): Promise<void> {
  const intentData: IntentJobData = {
    sessionId: input.sessionId,
    message: input.message,
    anonymousId: input.anonymousId,
    pageContext: input.pageContext,
  };

  // Step 1: Parse intent (async, returns job ID)
  const intentQueue = getIntentQueue();
  const intentJob = await intentQueue.add('process-intent', intentData, {
    priority: 1,
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: { count: 500 },
    removeOnFail: { count: 100 },
  });

  // Step 2 & 3 enqueued immediately; their job handlers read the latest intent state from DB
  const scoringQueue = getLeadScoringQueue();
  const emailTriggerQueue = getEmailTriggerQueue();

  await Promise.all([
    scoringQueue.add(
      'score-lead',
      { sessionId: input.sessionId },
      {
        delay: 3000, // Wait 3s for intent job to complete first
        jobId: `score-${input.sessionId}-${Date.now()}`,  
        attempts: 3,
        removeOnComplete: { count: 200 },
        removeOnFail: { count: 50 },
      },
    ),
    emailTriggerQueue.add(
      'check-email-triggers',
      { sessionId: input.sessionId },
      {
        delay: 5000, // Wait for scoring
        jobId: `email-trigger-${input.sessionId}-${Date.now()}`,  
        attempts: 3,
        removeOnComplete: { count: 200 },
        removeOnFail: { count: 50 },
      },
    ),
  ]);
}
