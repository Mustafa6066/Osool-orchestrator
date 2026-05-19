/**
 * seo-batch-accumulator.job.ts
 *
 * Flushes the BatchAccumulator to the Anthropic Batch API.
 * Runs every 10 minutes via the scheduler.
 *
 * The BatchAccumulator collects non-realtime SEO generation requests
 * and sends them in bulk to reduce per-token cost by ~50%.
 */

import { BatchAccumulator } from '@osool/llm';
import type { SeoBatchAccumulatorJobData } from '../queue.js';

export async function runSeoBatchAccumulator(
  data: SeoBatchAccumulatorJobData,
): Promise<{ flushed: boolean; batchId: string | null }> {
  const accumulator = BatchAccumulator.getInstance();
  const flushedResult = await accumulator.flush();
  const batchId = typeof flushedResult === 'string' ? flushedResult : null;

  return {
    flushed: batchId !== null,
    batchId,
  };
}
