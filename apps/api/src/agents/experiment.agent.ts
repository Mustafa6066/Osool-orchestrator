/**
 * Experiment Agent — autonomous A/B test lifecycle manager.
 *
 * Runs every 4 hours:
 * 1. Score all running experiments with new data
 * 2. Auto-promote winners to playbook
 * 3. Auto-discard inconclusive experiments with enough data
 */

import { BaseAgent } from './base.agent.js';
import { getExperimentScoringQueue } from '../jobs/queue.js';

class ExperimentAgent extends BaseAgent {
  readonly name = 'experiment';

  async run(): Promise<void> {
    await this.logToRedis('Scheduling experiment scoring for all running experiments');

    const queue = getExperimentScoringQueue();

    // Enqueue scoring job for all running experiments
    // Use dedup key to prevent overlapping scoring runs
    const dedupKey = `exp-score-${new Date().toISOString().slice(0, 13)}`; // hourly dedup

    await queue.add(
      'score-all-experiments',
      { triggeredBy: 'experiment-agent' },
      { jobId: dedupKey },
    );

    await this.logToRedis('Experiment scoring job enqueued');
  }
}

export const experimentAgent = new ExperimentAgent();
