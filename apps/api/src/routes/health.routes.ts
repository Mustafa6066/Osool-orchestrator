/**
 * System health check endpoint.
 * GET /health
 */

import type { FastifyPluginAsync } from 'fastify';
import { getRedis } from '../lib/redis.js';
import { db } from '@osool/db';
import { sql } from 'drizzle-orm';

export const healthRoutes: FastifyPluginAsync = async (app) => {
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
      const code = status === 'ok' ? 200 : 503;

      return reply.status(code).send({
        status,
        timestamp: new Date().toISOString(),
        db: dbStatus,
        redis: redisStatus,
      });
    },
  );
};
