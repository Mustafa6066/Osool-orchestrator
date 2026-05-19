import { randomInt } from 'node:crypto';

const RETRYABLE_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);

export interface FetchRetryOptions {
  serviceName: string;
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  timeoutMs?: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function computeBackoff(attempt: number, baseDelayMs: number, maxDelayMs: number): number {
  const expDelay = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
  const jitter = randomInt(0, Math.max(1, Math.floor(expDelay * 0.3)));
  return expDelay + jitter;
}

export async function fetchWithRetry(
  input: string | URL,
  init: RequestInit,
  options: FetchRetryOptions,
): Promise<Response> {
  const maxAttempts = options.maxAttempts ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 300;
  const maxDelayMs = options.maxDelayMs ?? 4000;
  const timeoutMs = options.timeoutMs ?? 10_000;

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(input, {
        ...init,
        signal: init.signal ?? AbortSignal.timeout(timeoutMs),
      });

      if (!RETRYABLE_STATUS_CODES.has(response.status) || attempt >= maxAttempts) {
        return response;
      }

      const waitMs = computeBackoff(attempt, baseDelayMs, maxDelayMs);
      console.warn(
        `[HttpResilience] ${options.serviceName} retrying after status ${response.status} (attempt ${attempt}/${maxAttempts}, wait ${waitMs}ms)`,
      );
      await sleep(waitMs);
      continue;
    } catch (error) {
      lastError = error;
      if (attempt >= maxAttempts) break;
      const waitMs = computeBackoff(attempt, baseDelayMs, maxDelayMs);
      console.warn(
        `[HttpResilience] ${options.serviceName} retrying after network error (attempt ${attempt}/${maxAttempts}, wait ${waitMs}ms)`,
      );
      await sleep(waitMs);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`[HttpResilience] ${options.serviceName} failed after retries`);
}
