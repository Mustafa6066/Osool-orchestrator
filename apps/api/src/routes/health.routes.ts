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
      const report: Record<string, unknown> = {
        timestamp: new Date().toISOString(),
        services: {},
        agents: {},
        queues: {},
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
        'content-optimization', 'scraper-refresh',
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
