/**
 * System health check endpoint.
 * GET /health
 */

import type { FastifyPluginAsync } from 'fastify';
import { getRedis } from '../lib/redis.js';
import { db } from '@osool/db';
import { sql } from 'drizzle-orm';

export const healthRoutes: FastifyPluginAsync = async (app) => {
  // Root handler — returns API info
  app.get('/', async (_req, reply) => {
    return reply.status(200).send({
      name: 'Osool Orchestrator API',
      version: '1.0.0',
      docs: '/docs',
      health: '/health',
    });
  });

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
};
