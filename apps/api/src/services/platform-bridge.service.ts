/**
 * Platform Bridge Service
 * -----------------------
 * Fetches live data from the Osool Platform backend (FastAPI)
 * to enrich orchestrator features:
 *  - Live property listings for SEO page enrichment
 *  - Real-time ROI data from the analytical engine
 *  - Chat session sync for unified conversational context
 *
 * All calls are cached in Redis with appropriate TTLs.
 */

import { getConfig } from '../config.js';
import { getRedis } from '../lib/redis.js';

let platformUrl: string | null = null;

function getPlatformUrl(): string {
  if (!platformUrl) {
    platformUrl = getConfig().OSOOL_API_URL.replace(/\/$/, '');
  }
  return platformUrl;
}

// ── Cache Helpers ────────────────────────────────────────────────────────────

async function cachedFetch<T>(
  cacheKey: string,
  ttlSeconds: number,
  fetcher: () => Promise<T>,
): Promise<T | null> {
  const redis = getRedis();
  const cached = await redis.get(`bridge:${cacheKey}`);
  if (cached) return JSON.parse(cached) as T;

  try {
    const result = await fetcher();
    if (result) {
      await redis.set(`bridge:${cacheKey}`, JSON.stringify(result), 'EX', ttlSeconds);
    }
    return result;
  } catch (err) {
    console.error(`[PlatformBridge] Failed to fetch ${cacheKey}:`, err);
    return null;
  }
}

// ── Platform API Calls ───────────────────────────────────────────────────────

export interface PlatformProperty {
  id: number;
  title: string;
  location: string;
  price: number;
  size_sqm: number;
  bedrooms: number;
  finishing: string;
  payment_plan: {
    down_payment: number;
    installment_years: number;
    monthly_installment: number;
  } | null;
  delivery_date: string | null;
  developer: string;
  wolf_score?: number;
  roi_estimate?: number;
}

export interface PlatformAreaROI {
  area: string;
  avgPricePerSqm: number;
  priceGrowth1Y: number;
  priceGrowth3Y: number;
  rentalYield: number;
  liquidityScore: number;
  topProperties: PlatformProperty[];
}

/**
 * Fetch live property listings from the Platform, optionally filtered by location/developer.
 * Cached for 30 minutes.
 */
export async function fetchLiveProperties(filters?: {
  location?: string;
  developer?: string;
  minPrice?: number;
  maxPrice?: number;
  limit?: number;
}): Promise<PlatformProperty[]> {
  const params = new URLSearchParams();
  if (filters?.location) params.set('location', filters.location);
  if (filters?.developer) params.set('developer', filters.developer);
  if (filters?.minPrice) params.set('min_price', String(filters.minPrice));
  if (filters?.maxPrice) params.set('max_price', String(filters.maxPrice));
  if (filters?.limit) params.set('limit', String(filters.limit));

  const cacheKey = `live-props:${params.toString()}`;
  const result = await cachedFetch<PlatformProperty[]>(cacheKey, 1800, async () => {
    const url = `${getPlatformUrl()}/api/seo/projects?${params.toString()}`;
    const res = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : (data.properties ?? []);
  });

  return result ?? [];
}

/**
 * Fetch live area ROI analysis from the Platform's analytical engine.
 * Cached for 1 hour.
 */
export async function fetchPlatformAreaROI(areaSlug: string): Promise<PlatformAreaROI | null> {
  const cacheKey = `area-roi:${areaSlug}`;
  return cachedFetch<PlatformAreaROI>(cacheKey, 3600, async () => {
    const url = `${getPlatformUrl()}/api/seo/areas/${encodeURIComponent(areaSlug)}`;
    const res = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    return res.json();
  });
}

/**
 * Fetch developer profile with live project data from the Platform.
 * Cached for 1 hour.
 */
export async function fetchPlatformDeveloper(developerSlug: string): Promise<Record<string, unknown> | null> {
  const cacheKey = `developer:${developerSlug}`;
  return cachedFetch<Record<string, unknown>>(cacheKey, 3600, async () => {
    const url = `${getPlatformUrl()}/api/seo/developers/${encodeURIComponent(developerSlug)}`;
    const res = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    return res.json();
  });
}

/**
 * Fetch top ROI properties for a given location from the Platform.
 * Used to embed live listings in SEO area guides.
 * Cached for 30 minutes.
 */
export async function fetchTopROIProperties(location: string, limit = 5): Promise<PlatformProperty[]> {
  const cacheKey = `top-roi:${location}:${limit}`;
  const result = await cachedFetch<PlatformProperty[]>(cacheKey, 1800, async () => {
    const url = `${getPlatformUrl()}/api/seo/projects?location=${encodeURIComponent(location)}&sort=roi_desc&limit=${limit}`;
    const res = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : (data.properties ?? []);
  });
  return result ?? [];
}

/**
 * Sync chat context from the Platform backend to the Orchestrator.
 * Fetches the user's recent chat sessions and messages from the Platform DB.
 */
export async function fetchPlatformChatHistory(userId: string): Promise<{
  sessions: { id: string; messageCount: number; createdAt: string }[];
  recentMessages: { role: string; content: string; createdAt: string }[];
} | null> {
  const cacheKey = `chat-history:${userId}`;
  return cachedFetch(cacheKey, 300, async () => {
    // The Platform admin endpoint returns chat data
    const url = `${getPlatformUrl()}/api/admin/conversations?user_id=${encodeURIComponent(userId)}&limit=5`;
    const res = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    return res.json();
  });
}

/**
 * Fetch platform-wide analytics summary for the unified admin view.
 * Includes property stats, user counts, chat volumes.
 */
export async function fetchPlatformDashboard(): Promise<Record<string, unknown> | null> {
  const cacheKey = 'platform-dashboard';
  return cachedFetch<Record<string, unknown>>(cacheKey, 300, async () => {
    const url = `${getPlatformUrl()}/api/analytics/dashboard`;
    const res = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    return res.json();
  });
}
