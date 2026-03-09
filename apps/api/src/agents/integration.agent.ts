import { BaseAgent } from './base.agent.js';
import { getLeadScoringQueue, getEmailTriggerQueue, getFeedbackLoopQueue } from '../jobs/queue.js';
import { db } from '@osool/db';
import { chatSessions } from '@osool/db/schema';
import { sql } from 'drizzle-orm';

/**
 * Integration Agent — orchestrates lead scoring, email trigger evaluation,
 * and feedback loop recalibration for all active sessions.
 *
 * Runs after each batch of new intent signals.
 */
export class IntegrationAgent extends BaseAgent {
  readonly name = 'integration';

  async run(payload?: { sessionIds?: string[] }): Promise<void> {
    const sessionIds = payload?.sessionIds ?? (await this.getRecentSessionIds());

    await this.logToRedis(`Integration: processing ${sessionIds.length} sessions`);

    // Score all sessions
    const scoringQueue = getLeadScoringQueue();
    await Promise.all(
      sessionIds.map((sid) =>
        scoringQueue.add(
          'score-lead',
          { sessionId: sid },
          {
            jobId: `score:${sid}:${Date.now()}`,
            removeOnComplete: { count: 100 },
            removeOnFail: { count: 50 },
          },
        ),
      ),
    );
    await this.logToRedis(`Integration: ${sessionIds.length} scoring jobs queued`);

    // Evaluate email triggers for each session
    const emailTriggerQueue = getEmailTriggerQueue();
    await Promise.all(
      sessionIds.map((sid) =>
        emailTriggerQueue.add(
          'check-email-triggers',
          { sessionId: sid },
          {
            jobId: `email-trigger:${sid}:${Date.now()}`,
            removeOnComplete: { count: 100 },
            removeOnFail: { count: 50 },
          },
        ),
      ),
    );
    await this.logToRedis(`Integration: ${sessionIds.length} email trigger jobs queued`);

    // Kick off lead scoring recalibration feedback loop
    const feedbackQueue = getFeedbackLoopQueue();
    await feedbackQueue.add(
      'run-feedback-loop',
      { loopType: 'lead_scoring_recalibrate' as const },
      { removeOnComplete: { count: 50 }, removeOnFail: { count: 20 } },
    );
    await this.logToRedis('Integration: lead_scoring_recalibrate feedback loop queued');
  }

  private async getRecentSessionIds(): Promise<string[]> {
    // Sessions updated in the last 2 hours that have not been scored yet
    const rows = await db
      .select({ id: chatSessions.id })
      .from(chatSessions)
      .where(sql`${chatSessions.lastMessageAt} > now() - interval '2 hours'`)
      .limit(100);

    return rows.map((r) => r.id);
  }
}

export const integrationAgent = new IntegrationAgent();
