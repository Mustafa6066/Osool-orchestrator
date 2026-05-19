/**
 * MemPalace Bridge Service
 * ------------------------
 * Typed HTTP client for the MemPalace sidecar (services/mempalace/).
 * Follows the same pattern as platform-bridge.service.ts:
 *   - All calls go through a Redis-cached health check
 *   - Typed request/response models
 *   - Graceful degradation when sidecar is unreachable
 *
 * Wings strategy (absorption plan):
 *   - ICP segment wings: expat_investor | domestic_hnw | first_time_buyer | institutional
 *   - User-scoped wings: user:{userId} (authenticated repeat users only)
 *   - Rooms: pricing | comparison | financing | legal | objections | lead-history
 */

import { getRedis } from '../lib/redis.js';
import { getCircuitBreaker } from '@osool/shared';
import { fetchWithRetry } from '../lib/http-resilience.js';

// ── Config ────────────────────────────────────────────────────────────────────

function getMemPalaceUrl(): string {
  return (process.env.MEMPALACE_URL ?? 'http://mempalace:8100').replace(/\/$/, '');
}

const HEALTH_CACHE_KEY = 'bridge:mempalace:health';
const HEALTH_CACHE_TTL = 30; // seconds
const mempalaceBreaker = getCircuitBreaker('mempalace-bridge-http', {
  failureThreshold: 3,
  resetTimeoutMs: 30_000,
  successThreshold: 2,
});

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RecallItem {
  drawerId: string;
  text: string;
  distance: number;
  metadata: Record<string, unknown>;
}

export interface RememberRequest {
  wing: string;
  room: string;
  text: string;
  entityType?: string;
  entityId?: string;
  icpSegment?: string;
  metadata?: Record<string, unknown>;
}

export interface RecallRequest {
  wing: string;
  room?: string;
  query: string;
  k?: number;
}

// ── Health ────────────────────────────────────────────────────────────────────

export async function isMemPalaceHealthy(): Promise<boolean> {
  const redis = getRedis();
  const cached = await redis.get(HEALTH_CACHE_KEY);
  if (cached !== null) return cached === '1';

  try {
    const res = await mempalaceBreaker.execute(() =>
      fetchWithRetry(
        `${getMemPalaceUrl()}/health`,
        { method: 'GET' },
        {
          serviceName: 'mempalace_health',
          maxAttempts: 2,
          timeoutMs: 3000,
        },
      ),
    );
    const healthy = res.ok;
    await redis.set(HEALTH_CACHE_KEY, healthy ? '1' : '0', 'EX', HEALTH_CACHE_TTL);
    return healthy;
  } catch {
    await redis.set(HEALTH_CACHE_KEY, '0', 'EX', HEALTH_CACHE_TTL);
    return false;
  }
}

// ── Core operations ───────────────────────────────────────────────────────────

/**
 * Persist a text document into MemPalace.
 * Returns the drawer ID on success, null on failure.
 */
export async function remember(req: RememberRequest): Promise<string | null> {
  if (!(await isMemPalaceHealthy())) return null;

  try {
    const res = await mempalaceBreaker.execute(() =>
      fetchWithRetry(
        `${getMemPalaceUrl()}/mcp/remember`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            wing: req.wing,
            room: req.room,
            text: req.text,
            entity_type: req.entityType,
            entity_id: req.entityId,
            icp_segment: req.icpSegment,
            metadata: req.metadata ?? {},
          }),
        },
        { serviceName: 'mempalace_remember', maxAttempts: 3, timeoutMs: 10_000 },
      ),
    );

    if (!res.ok) return null;
    const data = (await res.json()) as { drawer_id: string };
    return data.drawer_id;
  } catch {
    return null;
  }
}

/**
 * Semantically recall the top-k relevant drawers for a query.
 * Returns an empty array when MemPalace is unreachable (graceful degradation).
 */
export async function recall(req: RecallRequest): Promise<RecallItem[]> {
  if (!(await isMemPalaceHealthy())) return [];

  try {
    const res = await mempalaceBreaker.execute(() =>
      fetchWithRetry(
        `${getMemPalaceUrl()}/mcp/recall`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            wing: req.wing,
            room: req.room,
            query: req.query,
            k: req.k ?? 5,
          }),
        },
        { serviceName: 'mempalace_recall', maxAttempts: 3, timeoutMs: 10_000 },
      ),
    );

    if (!res.ok) return [];
    const items = (await res.json()) as Array<{
      drawer_id: string;
      text: string;
      distance: number;
      metadata: Record<string, unknown>;
    }>;

    return items.map((item) => ({
      drawerId: item.drawer_id,
      text: item.text,
      distance: item.distance,
      metadata: item.metadata,
    }));
  } catch {
    return [];
  }
}

/**
 * Walk (list) recent documents in a wing / room without a semantic query.
 */
export async function walk(wing: string, room?: string, limit = 20): Promise<RecallItem[]> {
  if (!(await isMemPalaceHealthy())) return [];

  try {
    const res = await mempalaceBreaker.execute(() =>
      fetchWithRetry(
        `${getMemPalaceUrl()}/mcp/walk`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ wing, room, limit }),
        },
        { serviceName: 'mempalace_walk', maxAttempts: 3, timeoutMs: 10_000 },
      ),
    );

    if (!res.ok) return [];
    const items = (await res.json()) as Array<{
      drawer_id: string;
      text: string;
      distance: number;
      metadata: Record<string, unknown>;
    }>;

    return items.map((item) => ({
      drawerId: item.drawer_id,
      text: item.text,
      distance: item.distance,
      metadata: item.metadata,
    }));
  } catch {
    return [];
  }
}

// ── Wing helpers ──────────────────────────────────────────────────────────────

/**
 * Build the wing identifier for a given ICP segment.
 * Reuses the segment value directly as the wing name.
 */
export function segmentWing(icpSegment: string): string {
  return icpSegment;
}

/**
 * Build the user-scoped wing identifier for authenticated repeat users.
 */
export function userWing(userId: string): string {
  return `user:${userId}`;
}
