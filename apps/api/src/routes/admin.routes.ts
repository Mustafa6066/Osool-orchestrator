/**
 * Admin Dashboard API routes — all JWT protected.
 *
 * POST /admin/auth/login    — get JWT tokens
 * POST /admin/auth/refresh  — refresh access token
 * GET  /admin/dashboard     — system overview
 * GET  /admin/agents        — agent statuses
 * GET  /admin/funnel        — funnel metrics
 * GET  /admin/keywords      — keyword intelligence
 * GET  /admin/campaigns     — campaign list
 * POST /admin/campaigns/:id/toggle  — pause/resume
 * GET  /admin/feedback-loops        — loop history
 * GET  /admin/intents               — intent explorer
 * GET  /admin/intents/heatmap       — heatmap data
 * GET  /admin/leads                 — lead profiles
 * GET  /admin/waitlist              — waitlist entries
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  extractBearerToken,
} from '../lib/auth.js';
import { getConfig } from '../config.js';
import { getRedis, isRedisConfigured } from '../lib/redis.js';
import { db } from '@osool/db';
import {
  intentSignals,
  funnelEvents,
  campaigns,
  campaignMetrics,
  emailSends,
  waitlist,
  feedbackLoopEvents,
  users,
  chatSessions,
  seoContent,
  retargetingAudiences,
  keywords,
  experiments,
  croAudits,
} from '@osool/db/schema';
import {
  eq,
  desc,
  asc,
  gte,
  lte,
  and,
  count,
  sql,
  ilike,
  between,
} from 'drizzle-orm';
import type { DashboardResponse } from '@osool/shared';

// ── JWT Guard ─────────────────────────────────────────────────────────────────

async function requireAdmin(req: { headers: Record<string, string | string[] | undefined> }, reply: { status: (n: number) => { send: (v: unknown) => void } }) {
  const token = extractBearerToken(req.headers['authorization'] as string | undefined);
  if (!token) {
    reply.status(401).send({ error: 'Missing authorization token' });
    return false;
  }
  const payload = verifyAccessToken(token);
  if (!payload) {
    reply.status(401).send({ error: 'Invalid or expired token' });
    return false;
  }
  return true;
}

// ── Plugin ────────────────────────────────────────────────────────────────────

export const adminRoutes: FastifyPluginAsync = async (app) => {
  // ── Auth ──────────────────────────────────────────────────────────────────

  app.post<{ Body: { email: string; password: string } }>(
    '/auth/login',
    { config: { rateLimit: { max: 10, timeWindow: '15 minutes' } } },
    async (req, reply) => {
      const { email, password } = req.body ?? {};

      if (!email || !password) {
        return reply.status(400).send({ error: 'Email and password required' });
      }

      const cfg = getConfig();

      // Primary: proxy to Osool backend and verify admin role
      try {
        const osoolRes = await fetch(`${cfg.OSOOL_API_URL}/api/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ username: email, password }),
        });

        if (osoolRes.ok) {
          const data = await osoolRes.json() as { access_token?: string };
          if (data.access_token) {
            // Decode JWT payload to check role (token just issued by Osool backend — trusted)
            const payloadB64 = data.access_token.split('.')[1];
            const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString()) as { role?: string };
            if (payload.role !== 'admin') {
              return reply.status(403).send({ error: 'Admin access required' });
            }
            return reply.send({
              accessToken: signAccessToken(email),
              refreshToken: signRefreshToken(email),
              expiresIn: 1800,
            });
          }
        } else if (osoolRes.status === 401) {
          return reply.status(401).send({ error: 'Invalid credentials' });
        }
      } catch {
        // Osool backend unreachable — fall through to local fallback
      }

      // Fallback: local ADMIN_EMAIL + ADMIN_PASSWORD_HASH env vars
      const expectedEmail = cfg.ADMIN_EMAIL;
      const expectedHash = cfg.ADMIN_PASSWORD_HASH;

      if (!expectedEmail || !expectedHash) {
        if (cfg.NODE_ENV !== 'development') {
          return reply.status(503).send({ error: 'Auth not configured' });
        }
        if (email !== 'admin@osool.ai' || password !== 'admin123') {
          return reply.status(401).send({ error: 'Invalid credentials' });
        }
      } else {
        if (email !== expectedEmail) {
          return reply.status(401).send({ error: 'Invalid credentials' });
        }
        const valid = await bcrypt.compare(password, expectedHash);
        if (!valid) {
          return reply.status(401).send({ error: 'Invalid credentials' });
        }
      }

      return reply.send({
        accessToken: signAccessToken(email),
        refreshToken: signRefreshToken(email),
        expiresIn: 1800,
      });
    },
  );

  app.post<{ Body: { refreshToken: string } }>(
    '/auth/refresh',
    { config: { rateLimit: { max: 30, timeWindow: '15 minutes' } } },
    async (req, reply) => {
      const { refreshToken } = req.body ?? {};
      if (!refreshToken) return reply.status(400).send({ error: 'refreshToken required' });

      const payload = verifyRefreshToken(refreshToken);
      if (!payload) return reply.status(401).send({ error: 'Invalid refresh token' });

      // Check if refresh token has been revoked (e.g. after logout)
      if (isRedisConfigured()) {
        const redis = getRedis();
        if (redis) {
          const revoked = await redis.get(`admin:revoked:${refreshToken.slice(-16)}`);
          if (revoked) return reply.status(401).send({ error: 'Token has been revoked' });
        }
      }

      // Refresh token rotation: issue new refresh token, revoke old one
      const newRefreshToken = signRefreshToken(payload.sub);

      // Revoke old refresh token (store last 16 chars as key, TTL = 7 days)
      if (isRedisConfigured()) {
        const redis = getRedis();
        if (redis) {
          await redis.set(`admin:revoked:${refreshToken.slice(-16)}`, '1', 'EX', 7 * 24 * 3600);
        }
      }

      return reply.send({
        accessToken: signAccessToken(payload.sub),
        refreshToken: newRefreshToken,
        expiresIn: 1800,
      });
    },
  );

  // ── Dashboard ─────────────────────────────────────────────────────────────

  app.get('/dashboard', async (req, reply) => {
    if (!(await requireAdmin(req as never, reply as never))) return;

    const redisAvailable = isRedisConfigured();
    const redis = redisAvailable ? getRedis() : null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [
      totalUsersRow,
      totalSessionsRow,
      totalIntentsRow,
      totalSEORow,
      waitlistRow,
      todayUsersRow,
      todaySessionsRow,
      todayIntentsRow,
      todayEmailsRow,
      todayWaitlistRow,
      discoverRow,
      engageRow,
      qualifyRow,
      convertRow,
      retainRow,
      queueDepthStr,
    ] = await Promise.all([
      db.select({ c: count() }).from(users),
      db.select({ c: count() }).from(chatSessions),
      db.select({ c: count() }).from(intentSignals),
      db.select({ c: count() }).from(seoContent).where(eq(seoContent.status, 'published')),
      db.select({ c: count() }).from(waitlist),
      db.select({ c: count() }).from(users).where(gte(users.createdAt, today)),
      db.select({ c: count() }).from(chatSessions).where(gte(chatSessions.startedAt, today)),
      db.select({ c: count() }).from(intentSignals).where(gte(intentSignals.createdAt, today)),
      db.select({ c: count() }).from(emailSends).where(and(gte(emailSends.createdAt, today), eq(emailSends.status, 'sent'))),
      db.select({ c: count() }).from(waitlist).where(gte(waitlist.createdAt, today)),
      db.select({ c: count() }).from(funnelEvents).where(eq(funnelEvents.stage, 'discover')),
      db.select({ c: count() }).from(funnelEvents).where(eq(funnelEvents.stage, 'engage')),
      db.select({ c: count() }).from(funnelEvents).where(eq(funnelEvents.stage, 'qualify')),
      db.select({ c: count() }).from(funnelEvents).where(eq(funnelEvents.stage, 'convert')),
      db.select({ c: count() }).from(funnelEvents).where(eq(funnelEvents.stage, 'retain')),
      redis ? redis.get('system:queue_depth') : Promise.resolve(null),
    ]);

    // Agent last run times — stored in hash by BaseAgent.setStatus()
    const agentKeys = ['nexus', 'seo', 'marketing', 'integration'];
    const agentLastRun: Record<string, string> = {};
    await Promise.all(
      agentKeys.map(async (agent) => {
        const hash = redis ? await redis.hgetall(`agent:${agent}:status`) : null;
        agentLastRun[agent] = hash?.lastRun ?? 'never';
      }),
    );

    // Trending
    const trendingRaw = redis ? await redis.get('nexus:trending') : null;
    const trending = trendingRaw
      ? (JSON.parse(trendingRaw) as { trendingDevelopers?: { name: string; mentionCount: number }[]; trendingLocations?: { name: string; mentionCount: number }[] })
      : { trendingDevelopers: [], trendingLocations: [] };

    // DB status check
    let dbStatus: 'healthy' | 'degraded' | 'down' = 'healthy';
    try {
      await db.execute(sql`SELECT 1`);
    } catch {
      dbStatus = 'down';
    }

    let redisStatus: 'healthy' | 'degraded' | 'down' = redis ? 'healthy' : 'degraded';
    if (redis) {
      try {
        await redis.ping();
      } catch {
        redisStatus = 'down';
      }
    }

    const response: DashboardResponse = {
      system: {
        apiUptime: process.uptime().toFixed(0) + 's',
        dbStatus,
        redisStatus,
        queueDepth: parseInt(queueDepthStr ?? '0', 10),
        lastAgentRun: agentLastRun,
      },
      metrics: {
        totalUsers: Number(totalUsersRow[0]?.c ?? 0),
        totalChatSessions: Number(totalSessionsRow[0]?.c ?? 0),
        totalIntentSignals: Number(totalIntentsRow[0]?.c ?? 0),
        totalSEOPages: Number(totalSEORow[0]?.c ?? 0),
        waitlistCount: Number(waitlistRow[0]?.c ?? 0),
        today: {
          newUsers: Number(todayUsersRow[0]?.c ?? 0),
          chatSessions: Number(todaySessionsRow[0]?.c ?? 0),
          intentSignals: Number(todayIntentsRow[0]?.c ?? 0),
          emailsSent: Number(todayEmailsRow[0]?.c ?? 0),
          waitlistJoins: Number(todayWaitlistRow[0]?.c ?? 0),
        },
      },
      funnel: {
        discover: Number(discoverRow[0]?.c ?? 0),
        engage: Number(engageRow[0]?.c ?? 0),
        qualify: Number(qualifyRow[0]?.c ?? 0),
        convert: Number(convertRow[0]?.c ?? 0),
        retain: Number(retainRow[0]?.c ?? 0),
      },
      topTrending: {
        developers: (trending.trendingDevelopers ?? []).slice(0, 5).map((d) => ({
          name: d.name,
          count: d.mentionCount,
        })),
        locations: (trending.trendingLocations ?? []).slice(0, 5).map((l) => ({
          name: l.name,
          count: l.mentionCount,
        })),
      },
    };

    return reply.send(response);
  });

  // ── Unified Dashboard (Platform + Orchestrator) ───────────────────────────

  app.get('/unified-dashboard', async (req, reply) => {
    if (!(await requireAdmin(req as never, reply as never))) return;

    // 1. Get orchestrator metrics (from the regular dashboard data)
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [
      totalUsersRow,
      totalSessionsRow,
      totalIntentsRow,
      waitlistRow,
    ] = await Promise.all([
      db.select({ c: count() }).from(users),
      db.select({ c: count() }).from(chatSessions),
      db.select({ c: count() }).from(intentSignals),
      db.select({ c: count() }).from(waitlist),
    ]);

    // 2. Fetch Platform dashboard metrics via bridge
    let platformMetrics: Record<string, unknown> = {};
    try {
      const { fetchPlatformDashboard } = await import('../services/platform-bridge.service.js');
      const data = await fetchPlatformDashboard();
      if (data) platformMetrics = data;
    } catch {
      // Bridge unavailable
    }

    // 3. Get lead distribution
    const leadTiers = {
      hot: 0,
      warm: 0,
      nurture: 0,
      cold: 0,
    };

    try {
      const sessions = await db
        .select({ leadScore: chatSessions.leadScore })
        .from(chatSessions)
        .where(sql`${chatSessions.leadScore} > 0`)
        .limit(1000);

      for (const s of sessions) {
        const score = s.leadScore ?? 0;
        if (score >= 85) leadTiers.hot++;
        else if (score >= 60) leadTiers.warm++;
        else if (score >= 30) leadTiers.nurture++;
        else leadTiers.cold++;
      }
    } catch {
      // Ignore
    }

    // 4. Get trending data
    const redis = isRedisConfigured() ? getRedis() : null;
    const trendingRaw = redis ? await redis.get('nexus:trending') : null;
    const trending = trendingRaw ? JSON.parse(trendingRaw) : {};

    return reply.send({
      orchestrator: {
        totalUsers: Number(totalUsersRow[0]?.c ?? 0),
        totalChatSessions: Number(totalSessionsRow[0]?.c ?? 0),
        totalIntentSignals: Number(totalIntentsRow[0]?.c ?? 0),
        waitlistCount: Number(waitlistRow[0]?.c ?? 0),
        leadDistribution: leadTiers,
        trending: {
          developers: (trending.trendingDevelopers ?? []).slice(0, 5),
          locations: (trending.trendingLocations ?? []).slice(0, 5),
        },
      },
      platform: {
        totalProperties: platformMetrics.total_properties ?? platformMetrics.totalProperties ?? 0,
        totalPlatformUsers: platformMetrics.total_users ?? platformMetrics.totalUsers ?? 0,
        totalTransactions: platformMetrics.total_transactions ?? platformMetrics.totalTransactions ?? 0,
        chatVolume: platformMetrics.chat_volume ?? platformMetrics.chatVolume ?? 0,
        avgResponseTime: platformMetrics.avg_response_time ?? platformMetrics.avgResponseTime ?? 0,
        topLocations: platformMetrics.top_locations ?? platformMetrics.topLocations ?? [],
        recentActivity: platformMetrics.recent_activity ?? platformMetrics.recentActivity ?? [],
      },
      lastUpdated: new Date().toISOString(),
    });
  });

  // ── Agents ────────────────────────────────────────────────────────────────

  app.get('/agents', async (req, reply) => {
    if (!(await requireAdmin(req as never, reply as never))) return;

    const redis = isRedisConfigured() ? getRedis() : null;
    const agentNames = ['nexus', 'seo', 'marketing', 'integration'];

    const agentStatuses = await Promise.all(
      agentNames.map(async (name) => {
        // agent:{name}:status is stored as a Redis hash (hset by BaseAgent), not a string
        const [statusHash, lastLogs] = redis
          ? await Promise.all([
              redis.hgetall(`agent:${name}:status`),
              redis.lrange(`agent:${name}:logs`, 0, 9),
            ])
          : [{} as Record<string, string>, [] as string[]];

        return {
          name,
          status: statusHash.status ?? 'idle',
          lastRun: statusHash.lastRun ?? null,
          nextRun: statusHash.nextRun ?? null,
          logs: lastLogs.map((l) => {
            try {
              return JSON.parse(l) as Record<string, unknown>;
            } catch {
              return { message: l };
            }
          }),
        };
      }),
    );

    return reply.send({ agents: agentStatuses });
  });

  // ── Funnel Metrics ────────────────────────────────────────────────────────

  app.get<{ Querystring: { startDate?: string; endDate?: string; segment?: string } }>(
    '/funnel',
    async (req, reply) => {
      if (!(await requireAdmin(req as never, reply as never))) return;

      const { startDate, endDate } = req.query;
      const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const end = endDate ? new Date(endDate) : new Date();

      const stages = ['discover', 'engage', 'qualify', 'convert', 'retain'];

      const stageCounts = await Promise.all(
        stages.map(async (stage) => {
          const [row] = await db
            .select({ c: count() })
            .from(funnelEvents)
            .where(and(eq(funnelEvents.stage, stage), gte(funnelEvents.createdAt, start), lte(funnelEvents.createdAt, end)));
          return { stage, count: Number(row?.c ?? 0) };
        }),
      );

      // Daily breakdown for trend chart
      const dailyRows = await db
        .select({
          date: sql<string>`DATE(created_at)`.as('date'),
          stage: funnelEvents.stage,
          cnt: count(),
        })
        .from(funnelEvents)
        .where(and(gte(funnelEvents.createdAt, start), lte(funnelEvents.createdAt, end)))
        .groupBy(sql`DATE(created_at)`, funnelEvents.stage)
        .orderBy(asc(sql`DATE(created_at)`));

      return reply.send({ stages: stageCounts, dailyBreakdown: dailyRows });
    },
  );

  // ── Keywords ──────────────────────────────────────────────────────────────

  app.get<{ Querystring: { page?: number; limit?: number; search?: string } }>(
    '/keywords',
    async (req, reply) => {
      if (!(await requireAdmin(req as never, reply as never))) return;

      const page = Number(req.query.page ?? 1);
      const limit = Math.min(Number(req.query.limit ?? 50), 200);
      const offset = (page - 1) * limit;

      const conditions = req.query.search
        ? [ilike(keywords.keyword, `%${req.query.search}%`)]
        : [];

      const [rows, totalRow] = await Promise.all([
        db
          .select()
          .from(keywords)
          .where(conditions.length ? and(...conditions) : undefined)
          .orderBy(desc(keywords.searchVolume))
          .limit(limit)
          .offset(offset),
        db.select({ c: count() }).from(keywords).where(conditions.length ? and(...conditions) : undefined),
      ]);

      return reply.send({ keywords: rows, total: Number(totalRow[0]?.c ?? 0), page, limit });
    },
  );

  // ── Campaigns ─────────────────────────────────────────────────────────────

  app.get('/campaigns', async (req, reply) => {
    if (!(await requireAdmin(req as never, reply as never))) return;

    const rows = await db
      .select()
      .from(campaigns)
      .orderBy(desc(campaigns.createdAt))
      .limit(100);

    return reply.send({ campaigns: rows });
  });

  app.post<{ Params: { id: string }; Body: { active: boolean } }>(
    '/campaigns/:id/toggle',
    async (req, reply) => {
      if (!(await requireAdmin(req as never, reply as never))) return;

      const { id } = req.params;
      const { active } = req.body ?? {};

      await db
        .update(campaigns)
        .set({
          status: active ? 'active' : 'paused',
          updatedAt: new Date(),
        })
        .where(eq(campaigns.id, id));

      return reply.send({ success: true, id, active });
    },
  );

  // ── Feedback Loops ────────────────────────────────────────────────────────

  app.get<{ Querystring: { page?: number; limit?: number; type?: string } }>(
    '/feedback-loops',
    async (req, reply) => {
      if (!(await requireAdmin(req as never, reply as never))) return;

      const page = Number(req.query.page ?? 1);
      const limit = Math.min(Number(req.query.limit ?? 50), 200);
      const offset = (page - 1) * limit;

      const rows = await db
        .select()
        .from(feedbackLoopEvents)
        .orderBy(desc(feedbackLoopEvents.createdAt))
        .limit(limit)
        .offset(offset);

      const [totalRow] = await db.select({ c: count() }).from(feedbackLoopEvents);

      return reply.send({ events: rows, total: Number(totalRow?.c ?? 0), page, limit });
    },
  );

  // ── Intents ───────────────────────────────────────────────────────────────

  app.get<{
    Querystring: {
      page?: number;
      limit?: number;
      intentType?: string;
      startDate?: string;
      endDate?: string;
    };
  }>('/intents', async (req, reply) => {
    if (!(await requireAdmin(req as never, reply as never))) return;

    const page = Number(req.query.page ?? 1);
    const limit = Math.min(Number(req.query.limit ?? 50), 200);
    const offset = (page - 1) * limit;
    const start = req.query.startDate ? new Date(req.query.startDate) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const end = req.query.endDate ? new Date(req.query.endDate) : new Date();

    const conditions = [gte(intentSignals.createdAt, start), lte(intentSignals.createdAt, end)];
    if (req.query.intentType) {
      conditions.push(eq(intentSignals.intentType, req.query.intentType));
    }

    const [rows, totalRow] = await Promise.all([
      db
        .select()
        .from(intentSignals)
        .where(and(...conditions))
        .orderBy(desc(intentSignals.createdAt))
        .limit(limit)
        .offset(offset),
      db.select({ c: count() }).from(intentSignals).where(and(...conditions)),
    ]);

    return reply.send({ intents: rows, total: Number(totalRow[0]?.c ?? 0), page, limit });
  });

  // ── Intent Heatmap ────────────────────────────────────────────────────────

  app.get<{ Querystring: { days?: number } }>('/intents/heatmap', async (req, reply) => {
    if (!(await requireAdmin(req as never, reply as never))) return;

    const days = Math.min(Number(req.query.days ?? 30), 90);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const signals = await db
      .select({ entities: intentSignals.entities, intentType: intentSignals.intentType })
      .from(intentSignals)
      .where(gte(intentSignals.createdAt, since))
      .limit(5000);

    // Build developer × location matrix
    const matrix: Record<string, Record<string, number>> = {};

    for (const signal of signals) {
      const entities = signal.entities as Record<string, unknown>;
      const devs = Array.isArray(entities.developers) ? (entities.developers as string[]) : [];
      const locs = Array.isArray(entities.locations) ? (entities.locations as string[]) : [];

      for (const dev of devs) {
        matrix[dev] ??= {};
        if (locs.length === 0) {
          matrix[dev]['_none'] = (matrix[dev]['_none'] ?? 0) + 1;
        }
        for (const loc of locs) {
          matrix[dev][loc] = (matrix[dev][loc] ?? 0) + 1;
        }
      }
    }

    return reply.send({ matrix, days, since: since.toISOString() });
  });

  // ── Leads ─────────────────────────────────────────────────────────────────

  app.get<{ Querystring: { page?: number; limit?: number; minScore?: number } }>(
    '/leads',
    async (req, reply) => {
      if (!(await requireAdmin(req as never, reply as never))) return;

      const page = Number(req.query.page ?? 1);
      const limit = Math.min(Number(req.query.limit ?? 50), 200);
      const offset = (page - 1) * limit;

      const rows = await db
        .select()
        .from(users)
        .orderBy(desc(users.createdAt))
        .limit(limit)
        .offset(offset);

      const [totalRow] = await db.select({ c: count() }).from(users);

      return reply.send({ leads: rows, total: Number(totalRow?.c ?? 0), page, limit });
    },
  );

  // ── Waitlist ──────────────────────────────────────────────────────────────

  app.get<{ Querystring: { page?: number; limit?: number } }>('/waitlist', async (req, reply) => {
    if (!(await requireAdmin(req as never, reply as never))) return;

    const page = Number(req.query.page ?? 1);
    const limit = Math.min(Number(req.query.limit ?? 50), 200);
    const offset = (page - 1) * limit;

    const [rows, totalRow] = await Promise.all([
      db.select().from(waitlist).orderBy(desc(waitlist.createdAt)).limit(limit).offset(offset),
      db.select({ c: count() }).from(waitlist),
    ]);

    return reply.send({ waitlist: rows, total: Number(totalRow[0]?.c ?? 0), page, limit });
  });

  // ── SEO Content ───────────────────────────────────────────────────────────

  app.get<{ Querystring: { page?: number; limit?: number } }>('/chat-sessions', async (req, reply) => {
    if (!(await requireAdmin(req as never, reply as never))) return;

    const page = Number(req.query.page ?? 1);
    const limit = Math.min(Number(req.query.limit ?? 50), 200);
    const offset = (page - 1) * limit;

    const [rows, totalRow] = await Promise.all([
      db.select().from(chatSessions).orderBy(desc(chatSessions.startedAt)).limit(limit).offset(offset),
      db.select({ c: count() }).from(chatSessions),
    ]);

    return reply.send({ sessions: rows, total: Number(totalRow[0]?.c ?? 0), page, limit });
  });

  app.get<{ Querystring: { page?: number; limit?: number; status?: string } }>(
    '/seo-content',
    async (req, reply) => {
      if (!(await requireAdmin(req as never, reply as never))) return;

      const page = Number(req.query.page ?? 1);
      const limit = Math.min(Number(req.query.limit ?? 50), 200);
      const offset = (page - 1) * limit;

      const conditions = req.query.status ? [eq(seoContent.status, req.query.status)] : [];

      const [rows, totalRow] = await Promise.all([
        db
          .select()
          .from(seoContent)
          .where(conditions.length ? and(...conditions) : undefined)
          .orderBy(desc(seoContent.createdAt))
          .limit(limit)
          .offset(offset),
        db
          .select({ c: count() })
          .from(seoContent)
          .where(conditions.length ? and(...conditions) : undefined),
      ]);

      return reply.send({ content: rows, total: Number(totalRow[0]?.c ?? 0), page, limit });
    },
  );

  // ── Email Sequences ───────────────────────────────────────────────────────

  app.get('/email-sequences', async (req, reply) => {
    if (!(await requireAdmin(req as never, reply as never))) return;

    const { emailSequences } = await import('@osool/db/schema');
    const rows = await db.select().from(emailSequences).orderBy(desc(emailSequences.createdAt));

    const stats = await Promise.all(
      rows.map(async (seq) => {
        const [sentRow, openedRow] = await Promise.all([
          db.select({ c: count() }).from(emailSends).where(eq(emailSends.sequenceId, seq.id)),
          db.select({ c: count() }).from(emailSends).where(and(eq(emailSends.sequenceId, seq.id), eq(emailSends.status, 'sent'))),
        ]);
        return { ...seq, totalSent: Number(sentRow[0]?.c ?? 0), delivered: Number(openedRow[0]?.c ?? 0) };
      }),
    );

    return reply.send({ sequences: stats });
  });

  // ── Experiments ───────────────────────────────────────────────────────────

  // List experiments with optional status filter
  app.get<{ Querystring: { status?: string; agent?: string } }>(
    '/experiments',
    async (req, reply) => {
      if (!(await requireAdmin(req as never, reply as never))) return;

      const conditions = [];
      if (req.query.status) conditions.push(eq(experiments.status, req.query.status));
      if (req.query.agent) conditions.push(eq(experiments.agent, req.query.agent));

      const rows = await db
        .select()
        .from(experiments)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(experiments.createdAt));

      return reply.send({ experiments: rows });
    },
  );

  // Create a new experiment
  app.post<{
    Body: {
      agent: string;
      hypothesis: string;
      variable: string;
      variants: { name: string; config: Record<string, unknown> }[];
      primaryMetric: string;
      cycleHours?: number;
      minSamples?: number;
      baselineVariant?: string;
    };
  }>('/experiments', async (req, reply) => {
    if (!(await requireAdmin(req as never, reply as never))) return;

    const { agent, hypothesis, variable, variants, primaryMetric, cycleHours, minSamples, baselineVariant } = req.body;

    if (!agent || !hypothesis || !variable || !variants?.length || !primaryMetric) {
      return reply.status(400).send({ error: 'Missing required fields: agent, hypothesis, variable, variants, primaryMetric' });
    }

    const [created] = await db.insert(experiments).values({
      agent,
      hypothesis,
      variable,
      variants,
      primaryMetric,
      cycleHours: cycleHours ?? 24,
      minSamples: minSamples ?? 30,
      baselineVariant: baselineVariant ?? variants[0].name,
      status: 'running',
    }).returning();

    return reply.status(201).send({ experiment: created });
  });

  // Log a data point for an experiment
  app.post<{
    Params: { id: string };
    Body: { variant: string; metric: string; value: number };
  }>('/experiments/:id/log', async (req, reply) => {
    if (!(await requireAdmin(req as never, reply as never))) return;

    const { id } = req.params;
    const { variant, metric, value } = req.body;

    if (!variant || !metric || value === undefined) {
      return reply.status(400).send({ error: 'Missing required fields: variant, metric, value' });
    }

    const [exp] = await db.select().from(experiments).where(eq(experiments.id, id));
    if (!exp) return reply.status(404).send({ error: 'Experiment not found' });

    const dataPoints = (exp.dataPoints ?? []) as { variant: string; metric: string; value: number; ts: string }[];
    dataPoints.push({ variant, metric, value, ts: new Date().toISOString() });

    await db.update(experiments).set({ dataPoints, updatedAt: new Date() }).where(eq(experiments.id, id));

    return reply.send({ logged: true, totalPoints: dataPoints.length });
  });

  // Trigger manual scoring
  app.post<{ Params: { id: string } }>('/experiments/:id/score', async (req, reply) => {
    if (!(await requireAdmin(req as never, reply as never))) return;

    const { getExperimentScoringQueue } = await import('../jobs/queue.js');
    const queue = getExperimentScoringQueue();
    await queue.add('manual-score', { experimentId: req.params.id, triggeredBy: 'admin' });

    return reply.send({ status: 'scoring_enqueued' });
  });

  // Get playbook for an agent
  app.get<{ Params: { agent: string } }>('/experiments/playbook/:agent', async (req, reply) => {
    if (!(await requireAdmin(req as never, reply as never))) return;

    const rows = await db
      .select()
      .from(experiments)
      .where(and(eq(experiments.agent, req.params.agent), eq(experiments.status, 'keep')))
      .orderBy(desc(experiments.updatedAt));

    const playbook = rows
      .filter((r) => r.playbook)
      .map((r) => ({ id: r.id, variable: r.variable, ...r.playbook as Record<string, unknown> }));

    return reply.send({ playbook });
  });

  // ── CRO Audits ────────────────────────────────────────────────────────────

  // Trigger a CRO audit
  app.post<{ Body: { url: string; pageType: string } }>('/cro/audit', async (req, reply) => {
    if (!(await requireAdmin(req as never, reply as never))) return;

    const { url, pageType } = req.body;
    if (!url || !pageType) {
      return reply.status(400).send({ error: 'Missing required fields: url, pageType' });
    }

    const { getCROAuditQueue } = await import('../jobs/queue.js');
    const queue = getCROAuditQueue();
    await queue.add('cro-audit', { url, pageType });

    return reply.send({ status: 'audit_enqueued', url });
  });

  // List past audits
  app.get('/cro/audits', async (req, reply) => {
    if (!(await requireAdmin(req as never, reply as never))) return;

    const rows = await db
      .select()
      .from(croAudits)
      .orderBy(desc(croAudits.createdAt))
      .limit(50);

    return reply.send({ audits: rows });
  });

  // Get detailed audit
  app.get<{ Params: { id: string } }>('/cro/audits/:id', async (req, reply) => {
    if (!(await requireAdmin(req as never, reply as never))) return;

    const [audit] = await db.select().from(croAudits).where(eq(croAudits.id, req.params.id));
    if (!audit) return reply.status(404).send({ error: 'Audit not found' });

    return reply.send({ audit });
  });

  // ── SEO Intelligence ──────────────────────────────────────────────────────

  app.get('/seo-intelligence', async (req, reply) => {
    if (!(await requireAdmin(req as never, reply as never))) return;

    const redis = getRedis();
    const cached = await redis.get('seo:intelligence:latest');

    if (cached) {
      return reply.send(JSON.parse(cached));
    }

    return reply.send({ message: 'No intelligence report available yet. Run the weekly SEO intelligence job.' });
  });

  // Trigger SEO intelligence run
  app.post('/seo-intelligence/run', async (req, reply) => {
    if (!(await requireAdmin(req as never, reply as never))) return;

    const { getSEOIntelligenceQueue } = await import('../jobs/queue.js');
    const queue = getSEOIntelligenceQueue();
    await queue.add('seo-intelligence-manual', { scope: 'full', triggeredBy: 'admin' });

    return reply.send({ status: 'intelligence_run_enqueued' });
  });

  // ── ICP Learning ──────────────────────────────────────────────────────────

  app.get('/icp-learning', async (req, reply) => {
    if (!(await requireAdmin(req as never, reply as never))) return;

    const { generateICPReport } = await import('../services/icp-learning.service.js');
    const report = await generateICPReport();

    return reply.send(report);
  });

  // ── Content Optimization ──────────────────────────────────────────────────

  // Trigger optimization for a content piece
  app.post<{ Params: { contentId: string }; Body: { elements?: string[] } }>(
    '/optimization/:contentId',
    async (req, reply) => {
      if (!(await requireAdmin(req as never, reply as never))) return;

      const { getContentOptimizationQueue } = await import('../jobs/queue.js');
      const queue = getContentOptimizationQueue();
      await queue.add('optimize', {
        seoContentId: req.params.contentId,
        elements: req.body?.elements,
      });

      return reply.send({ status: 'optimization_enqueued', contentId: req.params.contentId });
    },
  );

  // ── Quality Gate ──────────────────────────────────────────────────────────

  // Trigger quality gate for content
  app.post<{ Params: { contentId: string } }>(
    '/quality-gate/:contentId',
    async (req, reply) => {
      if (!(await requireAdmin(req as never, reply as never))) return;

      const [content] = await db.select().from(seoContent).where(eq(seoContent.id, req.params.contentId));
      if (!content) return reply.status(404).send({ error: 'Content not found' });

      const { getContentQualityGateQueue } = await import('../jobs/queue.js');
      const queue = getContentQualityGateQueue();
      await queue.add('quality-gate', {
        seoContentId: content.id,
        contentType: content.pageType,
        locale: content.locale,
      });

      return reply.send({ status: 'quality_gate_enqueued', contentId: content.id });
    },
  );
};

// Add bcryptjs to API dependencies
// Note: bcryptjs must be added to package.json; it's a pure-JS bcrypt implementation
