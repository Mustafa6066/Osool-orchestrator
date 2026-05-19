/**
 * Batch Accumulator — collects SEO / non-realtime LLM requests and flushes
 * them as a single Anthropic Batch API call every N minutes.
 *
 * Usage:
 *   const acc = BatchAccumulator.getInstance();
 *   acc.add({ customId: 'seo-123', params: { ... } });
 *   // Auto-flushes every 10 min, or call acc.flush() manually.
 */

import type { LLMClient } from './client.js';
import type { LLMCallOptions } from './types.js';

export interface BatchRequest {
  customId: string;
  params: LLMCallOptions;
  resolve: (batchId: string) => void;
  reject: (err: unknown) => void;
}

export class BatchAccumulator {
  private static _instance: BatchAccumulator | null = null;

  private queue: BatchRequest[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private client: LLMClient | null = null;

  /** Flush interval in milliseconds (default: 10 min) */
  readonly flushIntervalMs: number;

  constructor(opts?: { flushIntervalMs?: number }) {
    this.flushIntervalMs = opts?.flushIntervalMs ?? 10 * 60 * 1000;
  }

  static getInstance(): BatchAccumulator {
    if (!BatchAccumulator._instance) {
      BatchAccumulator._instance = new BatchAccumulator();
    }
    return BatchAccumulator._instance;
  }

  setClient(client: LLMClient): void {
    this.client = client;
  }

  /**
   * Add a request to the batch queue.
   * Returns a promise that resolves with the batch ID once the flush fires.
   */
  add(customId: string, params: LLMCallOptions): Promise<string> {
    return new Promise((resolve, reject) => {
      this.queue.push({ customId, params, resolve, reject });
      this.ensureTimer();
    });
  }

  /**
   * Flush all accumulated requests immediately as a single Batch API call.
   */
  async flush(): Promise<void> {
    if (this.queue.length === 0) return;
    if (!this.client) {
      for (const req of this.queue) req.reject(new Error('BatchAccumulator: LLM client not set'));
      this.queue = [];
      return;
    }

    const batch = [...this.queue];
    this.queue = [];
    this.stopTimer();

    try {
      const { id: batchId } = await this.client.batches.create(
        batch.map((b) => ({ custom_id: b.customId, params: b.params })),
      );
      for (const req of batch) req.resolve(batchId);
    } catch (err) {
      for (const req of batch) req.reject(err);
    }
  }

  private ensureTimer(): void {
    if (!this.flushTimer) {
      this.flushTimer = setInterval(() => void this.flush(), this.flushIntervalMs);
    }
  }

  private stopTimer(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }

  /** Flush and stop the timer — call on graceful shutdown. */
  async shutdown(): Promise<void> {
    this.stopTimer();
    await this.flush();
  }
}
