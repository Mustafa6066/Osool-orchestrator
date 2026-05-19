/**
 * Base Channel interface — all Agent-Reach channels implement this contract.
 */

export interface ReachItem {
  id: string;
  title: string;
  text: string;
  url: string;
  publishedAt?: Date;
  author?: string;
  channel: string;
  metadata: Record<string, unknown>;
}

export interface ReachContent {
  url: string;
  title: string;
  text: string;
  html?: string;
  publishedAt?: Date;
  metadata: Record<string, unknown>;
}

export interface HealthResult {
  healthy: boolean;
  latencyMs: number;
  error?: string;
}

export interface Channel {
  readonly name: string;

  /**
   * Check if the channel is reachable and healthy.
   */
  check(): Promise<HealthResult>;

  /**
   * Search for items matching the query.
   */
  search(
    query: string,
    opts?: { limit?: number; since?: Date },
  ): Promise<ReachItem[]>;

  /**
   * Fetch full content for a specific URL.
   */
  fetch(url: string): Promise<ReachContent>;
}
