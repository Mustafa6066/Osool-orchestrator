import { BaseAgent } from './base.agent.js';
import { getLeadScoringQueue, getEmailTriggerQueue, getFeedbackLoopQueue } from '../jobs/queue.js';
import { db } from '@osool/db';
import { chatSessions, intentSignals } from '@osool/db/schema';
import { eq, desc, sql } from 'drizzle-orm';
import { getRedis } from '../lib/redis.js';

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

    // Evaluate email triggers for each session — enrich payload from Redis + DB
    const emailTriggerQueue = getEmailTriggerQueue();
    const redis = getRedis();

    await Promise.all(
      sessionIds.map(async (sid) => {
        // Fetch the cached lead score from Redis (written by score-lead job)
        const scoreStr = await redis.get(`lead:score:session:${sid}`);
        const scoreData = scoreStr
          ? (JSON.parse(scoreStr) as { score?: number; tier?: string; segment?: string; anonymousId?: string })
          : null;

        // Fetch anonymous ID and visitor ID from the most recent intent signal for this session
        const [latestSignal] = await db
          .select({ anonymousId: intentSignals.anonymousId, segment: intentSignals.segment, userId: intentSignals.userId })
          .from(intentSignals)
          .where(eq(intentSignals.sessionId, sid))
          .orderBy(desc(intentSignals.createdAt))
          .limit(1);

        return emailTriggerQueue.add(
          'check-email-triggers',
          {
            sessionId: sid,
            anonymousId: scoreData?.anonymousId ?? latestSignal?.anonymousId ?? undefined,
            userId: latestSignal?.userId ?? undefined,
            trigger: 'session_end' as const,
            score: scoreData?.score,
            segment: scoreData?.segment ?? latestSignal?.segment ?? undefined,
          },
          {
            jobId: `email-trigger:${sid}:${Date.now()}`,
            removeOnComplete: { count: 100 },
            removeOnFail: { count: 50 },
          },
        );
      }),
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
