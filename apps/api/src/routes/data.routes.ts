/**
 * Data routes — serve enriched data to the existing Osool frontend.
 * All responses are cached in Redis for performance.
 *
 * Auth: X-API-Key header (server-to-server calls from the frontend)
 */

import type { FastifyPluginAsync } from 'fastify';
import { getConfig } from '../config.js';
import { safeCompare, extractBearerToken, verifyPlatformToken } from '../lib/auth.js';
import { getRedis } from '../lib/redis.js';
import { db } from '@osool/db';
import {
  developers,
  properties,
  seoContent,
  intentSignals,
  chatSessions,
  chatMessages,
  funnelEvents,
  users,
  notifications,
} from '@osool/db/schema';
import { eq, desc, and, gte, count, sql } from 'drizzle-orm';
import { DEVELOPERS } from '@osool/shared/constants';
import { DEFAULT_LOCATION_ROI, LOCATIONS } from '@osool/shared/constants';
import type { ComparisonDataResponse, ROITrackerResponse, ChatContextResponse, TrendingResponse } from '@osool/shared';

// ── Auth ──────────────────────────────────────────────────────────────────────

function checkApiKey(header: string | undefined, configuredKey: string | undefined): boolean {
  if (!configuredKey) return true; // No key configured → allow in dev
  if (!header) return false;
  return safeCompare(header, configuredKey);
}

// ── Cache helpers ─────────────────────────────────────────────────────────────

async function cacheGet<T>(key: string): Promise<T | null> {
  const redis = getRedis();
  const raw = await redis.get(key);
  if (!raw) return null;
  return JSON.parse(raw) as T;
}

async function cacheSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  const redis = getRedis();
  await redis.set(`data:${key}`, JSON.stringify(value), 'EX', ttlSeconds);
}

// ── Plugin ────────────────────────────────────────────────────────────────────

export const dataRoutes: FastifyPluginAsync = async (app) => {
  const rateLimitConfig = { max: 200, timeWindow: '1 minute' };

  // Auth hook for all data routes — accepts X-API-Key or Platform Bearer JWT
  app.addHook('preHandler', async (req, reply) => {
    const cfg = getConfig();
    // Option 1: X-API-Key header (server-to-server)
    if (checkApiKey(req.headers['x-api-key'] as string, cfg.API_KEY)) return;
    // Option 2: Platform Bearer JWT (SSO-lite — user-facing)
    const bearer = extractBearerToken(req.headers['authorization'] as string | undefined);
    if (bearer && verifyPlatformToken(bearer)) return;
    return reply.status(401).send({ error: 'Unauthorized' });
  });

  /** GET /data/comparison/:devA/:devB */
  app.get<{ Params: { devA: string; devB: string } }>(
    '/comparison/:devA/:devB',
    { config: { rateLimit: rateLimitConfig } },
    async (req, reply) => {
      const { devA, devB } = req.params;
      const cacheKey = `comparison:${devA}:${devB}`;
      const cached = await cacheGet<ComparisonDataResponse>(`data:${cacheKey}`);
      if (cached) return reply.send(cached);

      // Get developers from DB first, fall back to constants
      const [dbDevA, dbDevB] = await Promise.all([
        db.select().from(developers).where(eq(developers.slug, devA)).limit(1),
        db.select().from(developers).where(eq(developers.slug, devB)).limit(1),
      ]);

      const constDevA = DEVELOPERS.find((d) => d.slug === devA || d.id === devA);
      const constDevB = DEVELOPERS.find((d) => d.slug === devB || d.id === devB);

      const devAData = dbDevA[0] ?? constDevA;
      const devBData = dbDevB[0] ?? constDevB;

      if (!devAData || !devBData) {
        return reply.status(404).send({ error: 'One or both developers not found' });
      }

      // Safely access properties that may differ between DB and const types
      const getNum = (dev: Record<string, unknown>, key: string): number =>
        typeof dev[key] === 'number' ? (dev[key] as number) : 0;

      const response: ComparisonDataResponse = {
        developerA: {
          id: String(devAData.id ?? ''),
          name: String(devAData.name ?? ''),
          nameAr: String((devAData as Record<string, unknown>).nameAr ?? devAData.name ?? ''),
          slug: String((devAData as Record<string, unknown>).slug ?? ''),
          tier: (devAData as Record<string, unknown>).tier as 'premium' | 'mid_market' | 'budget' ?? 'premium',
          founded: getNum(devAData as Record<string, unknown>, 'founded') || undefined,
          projectCount: getNum(devAData as Record<string, unknown>, 'projectCount') || getNum(devAData as Record<string, unknown>, 'project_count'),
          avgDeliveryRatePercent: getNum(devAData as Record<string, unknown>, 'avgDeliveryRatePercent') || getNum(devAData as Record<string, unknown>, 'avg_delivery_rate_percent'),
          avgPricePerSqm: getNum(devAData as Record<string, unknown>, 'avgPricePerSqm') || getNum(devAData as Record<string, unknown>, 'avg_price_per_sqm'),
          regions: Array.isArray((devAData as Record<string, unknown>).regions) ? (devAData as Record<string, unknown>).regions as string[] : [],
        },
        developerB: {
          id: String(devBData.id ?? ''),
          name: String(devBData.name ?? ''),
          nameAr: String((devBData as Record<string, unknown>).nameAr ?? devBData.name ?? ''),
          slug: String((devBData as Record<string, unknown>).slug ?? ''),
          tier: (devBData as Record<string, unknown>).tier as 'premium' | 'mid_market' | 'budget' ?? 'premium',
          founded: getNum(devBData as Record<string, unknown>, 'founded') || undefined,
          projectCount: getNum(devBData as Record<string, unknown>, 'projectCount') || getNum(devBData as Record<string, unknown>, 'project_count'),
          avgDeliveryRatePercent: getNum(devBData as Record<string, unknown>, 'avgDeliveryRatePercent') || getNum(devBData as Record<string, unknown>, 'avg_delivery_rate_percent'),
          avgPricePerSqm: getNum(devBData as Record<string, unknown>, 'avgPricePerSqm') || getNum(devBData as Record<string, unknown>, 'avg_price_per_sqm'),
          regions: Array.isArray((devBData as Record<string, unknown>).regions) ? (devBData as Record<string, unknown>).regions as string[] : [],
        },
        comparison: {
          deliveryScore: {
            a: getNum(devAData as Record<string, unknown>, 'avgDeliveryRatePercent') || getNum(devAData as Record<string, unknown>, 'avg_delivery_rate_percent'),
            b: getNum(devBData as Record<string, unknown>, 'avgDeliveryRatePercent') || getNum(devBData as Record<string, unknown>, 'avg_delivery_rate_percent'),
          },
          avgPricePerMeter: {
            a: getNum(devAData as Record<string, unknown>, 'avgPricePerSqm') || getNum(devAData as Record<string, unknown>, 'avg_price_per_sqm'),
            b: getNum(devBData as Record<string, unknown>, 'avgPricePerSqm') || getNum(devBData as Record<string, unknown>, 'avg_price_per_sqm'),
            currency: 'EGP',
          },
          paymentFlexibility: { a: 75, b: 70 }, // TODO: derive from properties data
          resaleRetention: { a: 82, b: 78 },
          communityScore: { a: 88, b: 85 },
        },
        lastUpdated: new Date().toISOString(),
      };

      // Try to fetch AI-generated copy from seo_content
      const copy = await db
        .select()
        .from(seoContent)
        .where(
          and(
            eq(seoContent.pageType, 'comparison'),
            eq(seoContent.slug, `${devA}-vs-${devB}`),
            eq(seoContent.locale, 'en'),
            eq(seoContent.status, 'published'),
          ),
        )
        .orderBy(desc(seoContent.version))
        .limit(1);

      if (copy[0]) {
        response.generatedCopy = {
          summaryEn: copy[0].body ?? '',
          summaryAr: '',
          seoTitle: copy[0].title,
          seoDescription: copy[0].description ?? '',
        };
      }

      await cacheSet(cacheKey, response, 6 * 3600); // 6h TTL
      return reply.send(response);
    },
  );

  /** GET /data/roi/:location */
  app.get<{ Params: { location: string } }>(
    '/roi/:location',
    { config: { rateLimit: rateLimitConfig } },
    async (req, reply) => {
      const { location } = req.params;
      const cacheKey = `roi:${location}`;
      const cached = await cacheGet<ROITrackerResponse>(`data:${cacheKey}`);
      if (cached) return reply.send(cached);

      const locationMeta = LOCATIONS.find((l) => l.slug === location);
      const roiData = DEFAULT_LOCATION_ROI[location];

      if (!locationMeta) {
        return reply.status(404).send({ error: 'Location not found' });
      }

      const roi = roiData ?? {
        avgPricePerSqm: 40000,
        priceChange1y: 20,
        priceChange3y: 60,
        priceChange5y: 150,
        rentalYieldPercent: 6,
        liquidityScore: 60,
        demandIndex: 70,
      };

      // Generate mock price history (last 12 months)
      const priceHistory = Array.from({ length: 12 }, (_, i) => {
        const date = new Date();
        date.setMonth(date.getMonth() - (11 - i));
        const growth = roi.priceChange1y / 100;
        const basePrice = roi.avgPricePerSqm / (1 + growth);
        return {
          date: date.toISOString().slice(0, 7),
          value: Math.round(basePrice + (basePrice * growth * i) / 11),
        };
      });

      // Get top projects in this location
      const topProjectsRows = await db
        .select()
        .from(properties)
        .where(eq(properties.location, location))
        .limit(5);

      const response: ROITrackerResponse = {
        location: {
          location: locationMeta.name,
          locationAr: locationMeta.nameAr,
          slug: locationMeta.slug,
          region: locationMeta.region,
          avgPricePerSqm: roi.avgPricePerSqm,
          rentalYieldPercent: roi.rentalYieldPercent,
          liquidityScore: roi.liquidityScore,
        },
        pricePerMeterHistory: priceHistory,
        predictedGrowth: {
          '1yr': roi.priceChange1y,
          '3yr': roi.priceChange3y,
          '5yr': roi.priceChange5y,
        },
        rentalYield: roi.rentalYieldPercent,
        liquidityScore: roi.liquidityScore,
        topProjects: topProjectsRows.map((p) => ({
          id: p.id,
          slug: p.slug,
          name: p.projectName,
          nameAr: p.projectNameAr ?? p.projectName,
          developerId: p.developerId,
          location: p.location,
          minPrice: parseFloat(String(p.priceMin ?? '0')),
          maxPrice: parseFloat(String(p.priceMax ?? '0')),
          avgPricePerSqm: roi.avgPricePerSqm,
          currency: 'EGP' as const,
          deliveryStatus: 'off_plan',
        })),
        lastUpdated: new Date().toISOString(),
      };

      const copy = await db
        .select()
        .from(seoContent)
        .where(
          and(
            eq(seoContent.pageType, 'roi'),
            eq(seoContent.slug, location),
            eq(seoContent.status, 'published'),
          ),
        )
        .orderBy(desc(seoContent.version))
        .limit(1);

      if (copy[0]) {
        response.generatedCopy = {
          analysisEn: copy[0].body,
          analysisAr: '',
          seoTitle: copy[0].title,
          seoDescription: copy[0].description ?? '',
        };
      }

      await cacheSet(cacheKey, response, 6 * 3600);
      return reply.send(response);
    },
  );

  /** GET /data/project/:slug */
  app.get<{ Params: { slug: string } }>(
    '/project/:slug',
    { config: { rateLimit: rateLimitConfig } },
    async (req, reply) => {
      const { slug } = req.params;
      const cacheKey = `project:${slug}`;
      const cached = await cacheGet(`data:${cacheKey}`);
      if (cached) return reply.send(cached);

      const [project] = await db
        .select()
        .from(properties)
        .where(eq(properties.slug, slug))
        .limit(1);

      if (!project) {
        return reply.status(404).send({ error: 'Project not found' });
      }

      const [developer] = await db
        .select()
        .from(developers)
        .where(eq(developers.id, project.developerId))
        .limit(1);

      const copy = await db
        .select()
        .from(seoContent)
        .where(
          and(
            eq(seoContent.pageType, 'project'),
            eq(seoContent.slug, slug),
            eq(seoContent.status, 'published'),
          ),
        )
        .orderBy(desc(seoContent.version))
        .limit(1);

      const response = {
        project,
        developer,
        priceHistory: [],
        nearbyProjects: [],
        generatedCopy: copy[0]
          ? {
              descriptionEn: copy[0].body,
              descriptionAr: '',
              seoTitle: copy[0].title,
              seoDescription: copy[0].description ?? '',
            }
          : undefined,
        lastUpdated: new Date().toISOString(),
      };

      await cacheSet(cacheKey, response, 6 * 3600);
      return reply.send(response);
    },
  );

  /** GET /data/chat-context/:sessionId */
  app.get<{ Params: { sessionId: string } }>(
    '/chat-context/:sessionId',
    { config: { rateLimit: rateLimitConfig } },
    async (req, reply) => {
      const { sessionId } = req.params;
      const cacheKey = `chat-context:${sessionId}`;
      const cached = await cacheGet<ChatContextResponse>(`data:${cacheKey}`);
      if (cached) return reply.send(cached);

      // Get intent signals for this session
      const signals = await db
        .select()
        .from(intentSignals)
        .where(eq(intentSignals.sessionId, sessionId))
        .orderBy(desc(intentSignals.createdAt))
        .limit(20);

      const preferredDevelopers: string[] = [];
      const preferredAreas: string[] = [];
      let totalScore = 0;

      for (const signal of signals) {
        const entities = signal.entities as Record<string, unknown>;
        if (Array.isArray(entities.developers)) {
          preferredDevelopers.push(...(entities.developers as string[]));
        }
        if (Array.isArray(entities.locations)) {
          preferredAreas.push(...(entities.locations as string[]));
        }
        totalScore = Math.max(totalScore, signal.confidence ?? 0);
      }

      const response: ChatContextResponse = {
        leadScore: totalScore,
        segment: (signals[0]?.segment ?? 'first_time_buyer') as 'expat_investor' | 'domestic_hnw' | 'first_time_buyer' | 'institutional',
        previousIntents: signals.map((s) => ({
          id: s.id,
          sessionId: s.sessionId ?? '',
          timestamp: s.createdAt,
          intentType: s.intentType as 'comparison' | 'roi_inquiry' | 'price_check' | 'developer_review' | 'area_research' | 'payment_plan' | 'general',
          entities: s.entities as { developers?: string[]; locations?: string[]; projects?: string[]; priceRange?: { min: number; max: number; currency: 'EGP' | 'USD' } },
          rawQuery: s.rawQuery ?? '',
          confidence: (s.confidence ?? 50) / 100,
          segment: (s.segment ?? 'first_time_buyer') as 'expat_investor' | 'domestic_hnw' | 'first_time_buyer' | 'institutional',
          source: 'chat' as const,
        })),
        suggestedTopics: buildSuggestedTopics(preferredDevelopers, preferredAreas),
        personalizationHints: {
          preferredAreas: [...new Set(preferredAreas)].slice(0, 5),
          preferredDevelopers: [...new Set(preferredDevelopers)].slice(0, 5),
          interactionCount: signals.length,
        },
      };

      await cacheSet(cacheKey, response, 5 * 60); // 5 min TTL (highly dynamic)
      return reply.send(response);
    },
  );

  /** GET /data/trending */
  app.get(
    '/trending',
    { config: { rateLimit: rateLimitConfig } },
    async (_req, reply) => {
      const cacheKey = 'trending:7d';
      const cached = await cacheGet<TrendingResponse>(`data:${cacheKey}`);
      if (cached) return reply.send(cached);

      // Check Redis cache first (Nexus Agent updates this hourly)
      const redis = getRedis();
      const trendingRaw = await redis.get('nexus:trending');
      if (trendingRaw) {
        return reply.send(JSON.parse(trendingRaw));
      }

      // Fallback: compute from DB
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      const recentSignals = await db
        .select()
        .from(intentSignals)
        .where(gte(intentSignals.createdAt, sevenDaysAgo))
        .limit(1000);

      const devCounts: Record<string, number> = {};
      const locCounts: Record<string, number> = {};
      const queryCounts: Record<string, number> = {};

      for (const signal of recentSignals) {
        const entities = signal.entities as Record<string, unknown>;
        if (Array.isArray(entities.developers)) {
          for (const d of entities.developers as string[]) {
            devCounts[d] = (devCounts[d] ?? 0) + 1;
          }
        }
        if (Array.isArray(entities.locations)) {
          for (const l of entities.locations as string[]) {
            locCounts[l] = (locCounts[l] ?? 0) + 1;
          }
        }
        if (signal.intentType) {
          queryCounts[signal.intentType] = (queryCounts[signal.intentType] ?? 0) + 1;
        }
      }

      const response: TrendingResponse = {
        trendingDevelopers: Object.entries(devCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([name, mentionCount]) => ({ name, mentionCount, trend: 'up' as const })),
        trendingLocations: Object.entries(locCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([name, mentionCount]) => ({ name, mentionCount, trend: 'stable' as const })),
        trendingQueries: Object.entries(queryCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([query, count]) => ({ query, count })),
        period: '7d',
      };

      await cacheSet(cacheKey, response, 3600); // 1h TTL
      return reply.send(response);
    },
  );

  /** GET /data/seo-content/:pageType/:slug */
  app.get<{
    Params: { pageType: string; slug: string };
    Querystring: { locale?: string };
  }>(
    '/seo-content/:pageType/:slug',
    { config: { rateLimit: rateLimitConfig } },
    async (req, reply) => {
      const { pageType, slug } = req.params;
      const locale = req.query.locale ?? 'en';
      const cacheKey = `seo-content:${pageType}:${slug}:${locale}`;
      const cached = await cacheGet(`data:${cacheKey}`);
      if (cached) return reply.send(cached);

      const [row] = await db
        .select()
        .from(seoContent)
        .where(
          and(
            eq(seoContent.pageType, pageType),
            eq(seoContent.slug, slug),
            eq(seoContent.locale, locale),
            eq(seoContent.status, 'published'),
          ),
        )
        .orderBy(desc(seoContent.version))
        .limit(1);

      if (!row) {
        return reply.status(404).send({ error: 'Content not found' });
      }

      const response = {
        pageType: row.pageType,
        slug: row.slug,
        locale: row.locale,
        title: row.title,
        description: row.description,
        body: row.body,
        schemaMarkup: row.schemaMarkup,
        generatedAt: row.createdAt.toISOString(),
        version: row.version,
      };

      await cacheSet(cacheKey, response, 6 * 3600);
      return reply.send(response);
    },
  );

  /** GET /data/user-context/:userId — cross-session context for a Platform user */
  app.get<{ Params: { userId: string } }>(
    '/user-context/:userId',
    { config: { rateLimit: rateLimitConfig } },
    async (req, reply) => {
      const { userId } = req.params;
      const cacheKey = `user-context:${userId}`;
      const cached = await cacheGet(`data:${cacheKey}`);
      if (cached) return reply.send(cached);

      // Find orchestrator user by platformUserId
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.platformUserId, userId))
        .limit(1);

      // Gather all intent signals for this user (via funnel events → sessions)
      const recentSignals = await db
        .select()
        .from(intentSignals)
        .where(
          sql`${intentSignals.sessionId} IN (
            SELECT ${funnelEvents.sessionId} FROM ${funnelEvents}
            WHERE ${funnelEvents.userId} = ${userId}
            AND ${funnelEvents.sessionId} IS NOT NULL
          )`
        )
        .orderBy(desc(intentSignals.createdAt))
        .limit(50);

      // Aggregate preferences
      const devSet = new Set<string>();
      const areaSet = new Set<string>();
      const intentTypes = new Set<string>();
      let maxScore = 0;

      for (const signal of recentSignals) {
        const entities = signal.entities as Record<string, unknown>;
        if (Array.isArray(entities.developers)) {
          for (const d of entities.developers as string[]) devSet.add(d);
        }
        if (Array.isArray(entities.locations)) {
          for (const l of entities.locations as string[]) areaSet.add(l);
        }
        if (signal.intentType) intentTypes.add(signal.intentType);
        maxScore = Math.max(maxScore, signal.confidence ?? 0);
      }

      // Get the most recent lead score from chat sessions
      let leadScore = maxScore;
      try {
        const sessions = await db
          .select({ id: chatSessions.id, leadScore: chatSessions.leadScore })
          .from(chatSessions)
          .where(eq(chatSessions.userId, userId))
          .orderBy(desc(chatSessions.startedAt))
          .limit(1);
        if (sessions[0]?.leadScore) {
          leadScore = sessions[0].leadScore;
        }
      } catch { /* DB failure — use computed score */ }

      // Determine lead tier
      const tier = leadScore >= 85 ? 'hot' : leadScore >= 60 ? 'warm' : leadScore >= 30 ? 'nurture' : 'cold';

      const response = {
        userId,
        orchestratorUserId: user?.id ?? null,
        email: user?.email ?? null,
        icpSegment: user?.icpSegment ?? (recentSignals[0]?.segment ?? 'first_time_buyer'),
        leadScore,
        tier,
        preferredDevelopers: [...devSet].slice(0, 10),
        preferredAreas: [...areaSet].slice(0, 10),
        intentTypes: [...intentTypes],
        signalCount: recentSignals.length,
        suggestedTopics: buildSuggestedTopics([...devSet], [...areaSet]),
      };

      await cacheSet(cacheKey, response, 5 * 60); // 5 min TTL
      return reply.send(response);
    },
  );

  /** GET /data/notifications/:userId — fetch unread notifications for a Platform user */
  app.get<{ Params: { userId: string }; Querystring: { limit?: string } }>(
    '/notifications/:userId',
    async (request, reply) => {
      const { userId } = request.params;
      const limit = Math.min(parseInt(request.query.limit ?? '20', 10) || 20, 50);

      // Find orchestrator user by platformUserId
      const userRows = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.platformUserId, userId))
        .limit(1);

      if (userRows.length === 0) {
        return reply.send({ notifications: [], unreadCount: 0 });
      }

      const orchestratorUserId = userRows[0].id;

      const rows = await db
        .select()
        .from(notifications)
        .where(eq(notifications.userId, orchestratorUserId))
        .orderBy(desc(notifications.createdAt))
        .limit(limit);

      const unreadCount = rows.filter((n) => !n.read).length;

      return reply.send({
        notifications: rows.map((n) => ({
          id: n.id,
          type: n.type,
          title: n.title,
          titleAr: n.titleAr,
          body: n.body,
          bodyAr: n.bodyAr,
          data: n.data,
          read: n.read,
          priority: n.priority,
          createdAt: n.createdAt,
        })),
        unreadCount,
      });
    },
  );

  /** PATCH /data/notifications/:notifId/read — mark a notification as read */
  app.patch<{ Params: { notifId: string } }>(
    '/notifications/:notifId/read',
    async (request, reply) => {
      const { notifId } = request.params;
      await db
        .update(notifications)
        .set({ read: true })
        .where(eq(notifications.id, notifId));
      return reply.send({ success: true });
    },
  );

  /**
   * GET /data/live-properties/:location — Live property listings from Platform
   *
   * Returns real-time property data for a given location by querying
   * the Platform bridge. Used to embed live listings in SEO area guides.
   */
  app.get<{ Params: { location: string }; Querystring: { limit?: string; developer?: string } }>(
    '/live-properties/:location',
    { config: { rateLimit: rateLimitConfig } },
    async (req, reply) => {
      const { location } = req.params;
      const limit = Math.min(parseInt(req.query.limit ?? '10', 10) || 10, 50);
      const developer = req.query.developer;
      const cacheKey = `live-props:${location}:${developer ?? 'all'}:${limit}`;
      const cached = await cacheGet(`data:${cacheKey}`);
      if (cached) return reply.send(cached);

      // Try orchestrator's own properties DB first
      const localProps = await db
        .select()
        .from(properties)
        .where(eq(properties.location, location))
        .limit(limit);

      // Enrich with Platform data via bridge
      let platformProps: Array<Record<string, unknown>> = [];
      try {
        const { fetchLiveProperties } = await import('../services/platform-bridge.service.js');
        const fetched = await fetchLiveProperties({ location, developer, limit });
        platformProps = fetched as unknown as Array<Record<string, unknown>>;
      } catch {
        // Bridge unavailable — use local data only
      }

      const response = {
        location,
        localProperties: localProps.map((p) => ({
          id: p.id,
          name: p.projectName,
          nameAr: p.projectNameAr,
          developer: p.developerId,
          priceMin: p.priceMin,
          priceMax: p.priceMax,
          bedrooms: p.bedrooms,
          deliveryDate: p.deliveryDate,
          slug: p.slug,
        })),
        platformProperties: platformProps,
        totalLocal: localProps.length,
        totalPlatform: platformProps.length,
        lastUpdated: new Date().toISOString(),
      };

      await cacheSet(cacheKey, response, 1800); // 30 min TTL
      return reply.send(response);
    },
  );

  /**
   * GET /data/enriched-seo/:pageType/:slug — SEO content with live data overlay
   *
   * Returns the generated SEO content PLUS real-time property data
   * so area guides and developer profiles show live "Top ROI" listings.
   */
  app.get<{
    Params: { pageType: string; slug: string };
    Querystring: { locale?: string };
  }>(
    '/enriched-seo/:pageType/:slug',
    { config: { rateLimit: rateLimitConfig } },
    async (req, reply) => {
      const { pageType, slug } = req.params;
      const locale = req.query.locale ?? 'en';
      const cacheKey = `enriched-seo:${pageType}:${slug}:${locale}`;
      const cached = await cacheGet(`data:${cacheKey}`);
      if (cached) return reply.send(cached);

      // 1. Get SEO content
      const [seoRow] = await db
        .select()
        .from(seoContent)
        .where(
          and(
            eq(seoContent.pageType, pageType),
            eq(seoContent.slug, slug),
            eq(seoContent.locale, locale),
            eq(seoContent.status, 'published'),
          ),
        )
        .orderBy(desc(seoContent.version))
        .limit(1);

      if (!seoRow) {
        return reply.status(404).send({ error: 'SEO content not found' });
      }

      // 2. Fetch live data overlay based on page type
      let liveData: Record<string, unknown> = {};
      try {
        const bridge = await import('../services/platform-bridge.service.js');

        if (pageType === 'location_guide' || pageType === 'roi') {
          // Fetch live properties + ROI for this area
          const [props, areaROI] = await Promise.all([
            bridge.fetchTopROIProperties(slug, 5),
            bridge.fetchPlatformAreaROI(slug),
          ]);
          liveData = {
            topROIProperties: props,
            areaMetrics: areaROI,
          };
        } else if (pageType === 'developer_profile') {
          const devData = await bridge.fetchPlatformDeveloper(slug);
          liveData = { developerProfile: devData };
        } else if (pageType === 'comparison') {
          // For comparisons like "emaar-vs-sodic"
          const [devA, devB] = slug.split('-vs-');
          if (devA && devB) {
            const [dataA, dataB] = await Promise.all([
              bridge.fetchPlatformDeveloper(devA),
              bridge.fetchPlatformDeveloper(devB),
            ]);
            liveData = { developerA: dataA, developerB: dataB };
          }
        }
      } catch {
        // Bridge unavailable — serve SEO content without live overlay
      }

      const response = {
        seo: {
          pageType: seoRow.pageType,
          slug: seoRow.slug,
          locale: seoRow.locale,
          title: seoRow.title,
          description: seoRow.description,
          body: seoRow.body,
          schemaMarkup: seoRow.schemaMarkup,
          version: seoRow.version,
          generatedAt: seoRow.createdAt.toISOString(),
        },
        liveData,
        lastUpdated: new Date().toISOString(),
      };

      await cacheSet(cacheKey, response, 1800); // 30 min TTL
      return reply.send(response);
    },
  );
};

// ── Helper functions ──────────────────────────────────────────────────────────

function buildSuggestedTopics(developers: string[], locations: string[]): string[] {
  const topics: string[] = [];

  if (developers.length >= 2) {
    topics.push(`Compare ${developers[0]} vs ${developers[1]}`);
  }
  if (locations.length > 0) {
    topics.push(`ROI analysis for ${locations[0]}`);
  }
  if (developers.length > 0) {
    topics.push(`${developers[0]} payment plan options`);
  }
  topics.push('Best areas for investment 2025', 'New Capital vs North Coast ROI');

  return topics.slice(0, 5);
}
