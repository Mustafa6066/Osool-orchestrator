/**
 * Circuit Breaker — protects against cascading failures from external services.
 *
 * Wraps any async function with automatic failure detection and recovery.
 * States: CLOSED (normal) → OPEN (failing, fast-reject) → HALF_OPEN (probing) → CLOSED.
 *
 * Inspired by the Repowise architectural decision pattern:
 * "DECISION: All external API calls wrapped in CircuitBreaker after payment provider outages"
 *
 * Usage:
 *   const breaker = new CircuitBreaker('mlops-valuation', { failureThreshold: 3 });
 *   const result = await breaker.execute(() => fetchFromMLOps(data));
 */

export type CircuitState = 'closed' | 'open' | 'half_open';

export interface CircuitBreakerOptions {
  /** Number of consecutive failures before opening the circuit. Default: 5 */
  failureThreshold?: number;

  /** How long (ms) to stay open before probing. Default: 30_000 (30s) */
  resetTimeoutMs?: number;

  /** Number of successful probes in half-open before closing. Default: 2 */
  successThreshold?: number;

  /** Optional fallback when circuit is open. */
  fallback?: () => unknown;

  /** Called on state transitions (for logging / metrics). */
  onStateChange?: (from: CircuitState, to: CircuitState, name: string) => void;
}

export class CircuitBreaker {
  readonly name: string;
  private state: CircuitState = 'closed';
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime = 0;
  private readonly failureThreshold: number;
  private readonly resetTimeoutMs: number;
  private readonly successThreshold: number;
  private readonly fallback?: () => unknown;
  private readonly onStateChange?: (from: CircuitState, to: CircuitState, name: string) => void;

  constructor(name: string, options: CircuitBreakerOptions = {}) {
    this.name = name;
    this.failureThreshold = options.failureThreshold ?? 5;
    this.resetTimeoutMs = options.resetTimeoutMs ?? 30_000;
    this.successThreshold = options.successThreshold ?? 2;
    this.fallback = options.fallback;
    this.onStateChange = options.onStateChange;
  }

  getState(): CircuitState {
    return this.state;
  }

  getStats(): {
    name: string;
    state: CircuitState;
    failureCount: number;
    successCount: number;
    lastFailureTime: number;
  } {
    return {
      name: this.name,
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
    };
  }

  /** Manually reset the breaker to closed state. */
  reset(): void {
    this.transition('closed');
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = 0;
  }

  /**
   * Execute the wrapped function through the circuit breaker.
   * Throws CircuitOpenError if the circuit is open and no fallback is configured.
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      // Check if reset timeout has elapsed — transition to half_open
      if (Date.now() - this.lastFailureTime >= this.resetTimeoutMs) {
        this.transition('half_open');
      } else {
        // Circuit is open — use fallback or reject
        if (this.fallback) {
          return this.fallback() as T;
        }
        throw new CircuitOpenError(this.name);
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failureCount = 0;

    if (this.state === 'half_open') {
      this.successCount++;
      if (this.successCount >= this.successThreshold) {
        this.transition('closed');
        this.successCount = 0;
      }
    }
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.state === 'half_open') {
      // A single failure in half_open goes straight back to open
      this.transition('open');
      this.successCount = 0;
    } else if (this.state === 'closed' && this.failureCount >= this.failureThreshold) {
      this.transition('open');
    }
  }

  private transition(to: CircuitState): void {
    if (this.state !== to) {
      const from = this.state;
      this.state = to;
      this.onStateChange?.(from, to, this.name);
    }
  }
}

/** Error thrown when trying to execute through an open circuit. */
export class CircuitOpenError extends Error {
  readonly circuitName: string;

  constructor(name: string) {
    super(`Circuit breaker "${name}" is OPEN — request rejected`);
    this.circuitName = name;
    this.name = 'CircuitOpenError';
  }
}

// ── Singleton registry for shared circuit breakers ──────────────────────────────

const registry = new Map<string, CircuitBreaker>();

/**
 * Get or create a named circuit breaker from the global registry.
 * Re-uses the same instance across the application.
 */
export function getCircuitBreaker(name: string, options?: CircuitBreakerOptions): CircuitBreaker {
  let breaker = registry.get(name);
  if (!breaker) {
    breaker = new CircuitBreaker(name, options);
    registry.set(name, breaker);
  }
  return breaker;
}

/** Get health status of all registered circuit breakers. */
export function getAllCircuitBreakerStats() {
  return Array.from(registry.values()).map((b) => b.getStats());
}
