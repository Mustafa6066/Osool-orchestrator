/**
 * Email Sequence Workflow
 *
 * Triggered: when a lead crosses a scoring threshold or completes a funnel event
 * Orchestrates: trigger evaluation → email send → sequence progression tracking
 */
import { getEmailTriggerQueue, getEmailSendQueue } from '../jobs/queue.js';
import type { EmailSendJobData } from '../jobs/queue.js';

export interface EmailSequenceInput {
  sessionId: string;
  /**
   * If leadEmail and tier are known at trigger time, we can fast-path directly
   * to email send without re-evaluation.
   */
  fastPath?: {
    leadEmail: string;
    tier: 'hot' | 'warm' | 'nurture' | 'welcome';
    sequenceId: string;
    stepIndex: number;
    templateType: 'roi_report' | 'thought_leadership' | 'premium_invite';
  };
}

export async function runEmailSequenceWorkflow(input: EmailSequenceInput): Promise<void> {
  if (input.fastPath) {
    // Fast-path: we already know what to send
    const emailSendQueue = getEmailSendQueue();
    const { leadEmail, tier, sequenceId, stepIndex, templateType } = input.fastPath;

    const jobData: EmailSendJobData = {
      to: leadEmail,
      tier,
      sequenceId,
      stepIndex,
      templateType,
      sessionId: input.sessionId,
    };

    await emailSendQueue.add('send-email', jobData, {
      jobId: `email:${sequenceId}:step${stepIndex}:${input.sessionId}`,
      priority: 1,
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: { count: 500 },
      removeOnFail: { count: 100 },
    });
    return;
  }

  // Standard path: run trigger evaluation first
  const emailTriggerQueue = getEmailTriggerQueue();
  await emailTriggerQueue.add(
    'check-email-triggers',
    { sessionId: input.sessionId },
    {
      jobId: `email-trigger:${input.sessionId}:${Date.now()}`,
      priority: 2,
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: { count: 200 },
      removeOnFail: { count: 50 },
    },
  );
}
