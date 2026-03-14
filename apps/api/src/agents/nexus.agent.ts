import { BaseAgent } from './base.agent.js';
import { getMarketPulseQueue } from '../jobs/queue.js';

/**
 * Nexus Agent — orchestrates the hourly "market pulse" job.
 * Enqueues a market-pulse job and waits for prior runs via BullMQ deduplication.
 */
export class NexusAgent extends BaseAgent {
  readonly name = 'nexus';

  async run(): Promise<void> {
    await this.logToRedis('Nexus: enqueueing market-pulse job');
    const queue = getMarketPulseQueue();
    await queue.add(
      'market-pulse',
      { triggeredBy: 'nexus-agent' },
      {
        jobId: `market-pulse-${new Date().toISOString().slice(0, 13).replace(/:/g, '-')}`, // 1-per-hour deduplication
        removeOnComplete: { count: 24 },
        removeOnFail: { count: 12 },
      },
    );
    await this.logToRedis('Nexus: market-pulse job enqueued');
  }
}

export const nexusAgent = new NexusAgent();
