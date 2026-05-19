/**
 * System health & diagnostics endpoints.
 *
 * GET /health       — basic liveness check (Railway healthcheck)
 * GET /health/deep  — full system diagnostics (agents, queues, circuits, costs)
 *
 * Inspired by Repowise's `repowise doctor --repair`
 */

import type { FastifyPluginAsync } from 'fastify';
import { getRedis } from '../lib/redis.js';
import { db } from '@osool/db';
import { sql } from 'drizzle-orm';
import { getAllCircuitBreakerStats } from '@osool/shared';
import { getConfig } from '../config.js';

async function checkHttpDependency(url: string, timeoutMs = 3000): Promise<{ status: 'healthy' | 'down'; detail?: string; latencyMs?: number }> {
  const started = Date.now();
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) {
      return { status: 'down', detail: `HTTP ${res.status}`, latencyMs: Date.now() - started };
    }
    return { status: 'healthy', latencyMs: Date.now() - started };
  } catch {
    return { status: 'down', detail: 'Request failed', latencyMs: Date.now() - started };
  }
}

export const healthRoutes: FastifyPluginAsync = async (app) => {
  // ── Basic liveness (Railway healthcheck) ────────────────────────────────
  app.get(
    '/health',
    {
      schema: {
        response: {
          200: {
            type: 'object',
            properties: {
              status: { type: 'string' },
              timestamp: { type: 'string' },
              db: { type: 'string' },
              redis: { type: 'string' },
            },
          },
        },
      },
    },
    async (_req, reply) => {
      let dbStatus = 'healthy';
      let redisStatus = 'healthy';

      try {
        await db.execute(sql`SELECT 1`);
      } catch {
        dbStatus = 'down';
      }

      try {
        const redis = getRedis();
        await redis.ping();
      } catch {
        redisStatus = 'down';
      }

      const status = dbStatus === 'healthy' && redisStatus === 'healthy' ? 'ok' : 'degraded';

      // Always return 200 for liveness (Railway healthcheck).
      // Body indicates actual readiness status.
      return reply.status(200).send({
        status,
        timestamp: new Date().toISOString(),
        db: dbStatus,
        redis: redisStatus,
      });
    },
  );

  // ── Strict readiness (for traffic routing) ─────────────────────────────
  app.get(
    '/ready',
    {
      schema: {
        response: {
          200: {
            type: 'object',
            properties: {
              status: { type: 'string' },
              timestamp: { type: 'string' },
              checks: { type: 'object', additionalProperties: true },
            },
          },
          503: {
            type: 'object',
            properties: {
              status: { type: 'string' },
              timestamp: { type: 'string' },
              checks: { type: 'object', additionalProperties: true },
            },
          },
        },
      },
    },
    async (_req, reply) => {
      const cfg = getConfig();
      const strictExternal = (process.env.STRICT_READINESS_EXTERNAL ?? '').toLowerCase() === 'true';

      const checks: Record<string, { status: 'healthy' | 'down' | 'degraded'; detail?: string; latencyMs?: number }> = {
        postgres: { status: 'healthy' },
        redis: { status: 'healthy' },
        osoolPlatform: { status: 'degraded', detail: 'Skipped' },
        mempalace: { status: 'degraded', detail: 'Skipped' },
      };

      try {
        await db.execute(sql`SELECT 1`);
      } catch {
        checks.postgres = { status: 'down', detail: 'Database query failed' };
      }

      try {
        const redis = getRedis();
        await redis.ping();
      } catch {
        checks.redis = { status: 'down', detail: 'Redis ping failed' };
      }

      const platformHealthUrl = `${cfg.OSOOL_API_URL.replace(/\/$/, '')}/api/health`;
      checks.osoolPlatform = await checkHttpDependency(platformHealthUrl, 4000);

      const mempalaceBase = (process.env.MEMPALACE_URL ?? 'http://mempalace:8100').replace(/\/$/, '');
      checks.mempalace = await checkHttpDependency(`${mempalaceBase}/health`, 3000);

      const requiredChecks = ['postgres', 'redis'] as const;
      const externalChecks = ['osoolPlatform', 'mempalace'] as const;
      const coreReady = requiredChecks.every((name) => checks[name].status === 'healthy');
      const externalReady = externalChecks.every((name) => checks[name].status === 'healthy');
      const ready = coreReady && (!strictExternal || externalReady);
      const statusCode = ready ? 200 : 503;

      return reply.status(statusCode).send({
        status: ready ? 'ready' : 'not_ready',
        timestamp: new Date().toISOString(),
        strictExternal,
        checks,
      });
    },
  );

  // ── Deep diagnostics ───────────────────────────────────────────────────
  app.get(
    '/health/deep',
    {
      schema: {
        response: {
          200: {
            type: 'object',
            additionalProperties: true,
          },
        },
      },
    },
    async (_req, reply) => {
      const redis = getRedis();
      const cfg = getConfig();
      const report: Record<string, unknown> = {
        timestamp: new Date().toISOString(),
        services: {},
        agents: {},
        queues: {},
        dlq: {},
        circuitBreakers: [],
        events: {},
      };

      // ── Services ──────────────────────────────────────────────────────
      const services: Record<string, { status: string; latencyMs?: number }> = {};

      // PostgreSQL
      try {
        const dbStart = Date.now();
        await db.execute(sql`SELECT 1`);
        services.postgres = { status: 'healthy', latencyMs: Date.now() - dbStart };
      } catch {
        services.postgres = { status: 'down' };
      }

      // Redis
      try {
        const redisStart = Date.now();
        await redis.ping();
        services.redis = { status: 'healthy', latencyMs: Date.now() - redisStart };
      } catch {
        services.redis = { status: 'down' };
      }

      const platformHealthUrl = `${cfg.OSOOL_API_URL.replace(/\/$/, '')}/api/health`;
      const platformStatus = await checkHttpDependency(platformHealthUrl, 4000);
      services.osoolPlatform = platformStatus;

      const mempalaceBase = (process.env.MEMPALACE_URL ?? 'http://mempalace:8100').replace(/\/$/, '');
      const mempalaceStatus = await checkHttpDependency(`${mempalaceBase}/health`, 3000);
      services.mempalace = mempalaceStatus;

      report.services = services;

      // ── Agent statuses ────────────────────────────────────────────────
      const agentNames = ['nexus', 'integration', 'marketing', 'experiment', 'chat', 'seo', 'intent'];
      const agents: Record<string, unknown> = {};

      for (const name of agentNames) {
        try {
          const statusKey = `agent:${name}:status`;
          const statusData = await redis.hgetall(statusKey);
          agents[name] = statusData.status
            ? { status: statusData.status, updatedAt: statusData.updatedAt, lastRun: statusData.lastRun }
            : { status: 'unknown' };
        } catch {
          agents[name] = { status: 'unknown' };
        }
      }

      report.agents = agents;

      // ── Queue depths ──────────────────────────────────────────────────
      const queueNames = [
        'intent-processing', 'lead-scoring', 'audience-sync', 'seo-content-gen',
        'email-send', 'email-trigger', 'feedback-loop', 'market-pulse',
        'notification-push', 'scraper-event', 'experiment-scoring',
        'content-quality-gate', 'seo-intelligence', 'cro-audit',
        'content-optimization', 'scraper-refresh', 'dead-letter',
      ];
      const queues: Record<string, unknown> = {};

      for (const queueName of queueNames) {
        try {
          const waiting = await redis.llen(`bull:${queueName}:wait`);
          const active = await redis.llen(`bull:${queueName}:active`);
          const delayed = await redis.zcard(`bull:${queueName}:delayed`);
          const failed = await redis.zcard(`bull:${queueName}:failed`);
          queues[queueName] = { waiting, active, delayed, failed };
        } catch {
          queues[queueName] = { status: 'unknown' };
        }
      }

      report.queues = queues;

      // ── DLQ replay metrics ───────────────────────────────────────────
      try {
        const [replayTotalRaw, replayLastTs, dlqWaiting, dlqFailed] = await Promise.all([
          redis.get('dlq:replays:total'),
          redis.get('dlq:replays:last_ts'),
          redis.llen('bull:dead-letter:wait'),
          redis.zcard('bull:dead-letter:failed'),
        ]);
        report.dlq = {
          waiting: dlqWaiting,
          failed: dlqFailed,
          replayTotal: Number(replayTotalRaw ?? '0'),
          replayLastTs: replayLastTs ?? null,
        };
      } catch {
        report.dlq = { status: 'unavailable' };
      }

      // ── Circuit breakers ──────────────────────────────────────────────
      report.circuitBreakers = getAllCircuitBreakerStats();

      // ── Event bus stats ───────────────────────────────────────────────
      try {
        const { getAgentEventBus } = await import('../events/agent-events.js');
        report.events = getAgentEventBus().getListenerStats();
      } catch {
        report.events = { status: 'unavailable' };
      }

      // ── Consensus router stats ────────────────────────────────────────
      try {
        const recentActivations = await redis.lrange('consensus:activations', 0, 4);
        const recentResults = await redis.lrange('consensus:results', 0, 4);
        report.consensus = {
          recentActivations: recentActivations.map((r) => { try { return JSON.parse(r); } catch { return r; } }),
          recentResults: recentResults.map((r) => { try { return JSON.parse(r); } catch { return r; } }),
        };
      } catch {
        report.consensus = { status: 'unavailable' };
      }

      // ── Overall status ────────────────────────────────────────────────
      const allServicesHealthy = Object.values(services).every((s) => s.status === 'healthy');
      const openCircuits = getAllCircuitBreakerStats().filter((c) => c.state === 'open');

      report.status = allServicesHealthy && openCircuits.length === 0 ? 'healthy' : 'degraded';
      if (openCircuits.length > 0) {
        report.warnings = openCircuits.map((c) => `Circuit "${c.name}" is OPEN (${c.failureCount} failures)`);
      }

      return reply.status(200).send(report);
    },
  );
};
