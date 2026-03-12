/**
 * Orchestrator API — Fastify REST server.
 *
 * Endpoints:
 *  POST /webhooks/*     — receives events from the existing Osool frontend
 *  GET  /data/*         — serves enriched data to the existing frontend
 *  GET/POST /admin/*    — admin dashboard API (JWT protected)
 *  GET  /health         — system health check
 *  GET  /docs           — Swagger UI (OpenAPI)
 */

import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';

import { getConfig, getAllowedOrigins } from './config.js';
import { getRedis, isRedisConfigured } from './lib/redis.js';
import { runMigrations } from '@osool/db';
import { webhookRoutes } from './routes/webhook.routes.js';
import { dataRoutes } from './routes/data.routes.js';
import { adminRoutes } from './routes/admin.routes.js';
import { healthRoutes } from './routes/health.routes.js';
import { startWorkers, stopWorkers } from './jobs/workers.js';
import { createSEOWorker, createScoringWorker, createEmailWorker } from './jobs/queues.js';
import { startScheduler, stopScheduler } from './scheduler.js';

const cfg = getConfig();

export const app = Fastify({
  logger: {
    level: cfg.LOG_LEVEL,
    transport:
      cfg.NODE_ENV === 'development'
        ? { target: 'pino-pretty', options: { colorize: true } }
        : undefined,
  },
  trustProxy: true,
});

async function build() {
  /* ── CORS ──────────────────────────────────────────────────────────────── */
  await app.register(cors, {
    origin: (origin, cb) => {
      if (!origin) return cb(null, true); // Server-to-server
      // Always allow Railway-hosted services and configured origins
      if (origin.endsWith('.railway.app')) return cb(null, true);
      const allowed = getAllowedOrigins();
      if (allowed.includes(origin)) return cb(null, true);
      cb(new Error(`Origin ${origin} not allowed`), false);
    },
    credentials: true,
  });

  /* ── Rate limiting ─────────────────────────────────────────────────────── */
  await app.register(rateLimit, {
    global: false,
    ...(isRedisConfigured() ? { redis: getRedis() } : {}),
    keyGenerator: (req) => req.ip,
  });

  /* ── Swagger / OpenAPI ─────────────────────────────────────────────────── */
  await app.register(swagger, {
    openapi: {
      info: {
        title: 'Osool Orchestrator API',
        description: 'Backend orchestration system for Osool CoInvestor',
        version: '1.0.0',
      },
      servers: [{ url: `http://localhost:${cfg.PORT}` }],
      components: {
        securitySchemes: {
          BearerAuth: { type: 'http', scheme: 'bearer' },
          WebhookSecret: { type: 'apiKey', in: 'header', name: 'x-webhook-secret' },
          ApiKey: { type: 'apiKey', in: 'header', name: 'x-api-key' },
        },
      },
    },
  });

  await app.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: { docExpansion: 'list', deepLinking: true },
  });

  /* ── Routes ────────────────────────────────────────────────────────────── */
  // Root handler — registered directly to avoid prefix resolution issues
  app.get('/', async (_req, reply) => {
    return reply.status(200).send({
      name: 'Osool Orchestrator API',
      version: '1.0.0',
      docs: '/docs',
      health: '/health',
    });
  });

  await app.register(healthRoutes, { prefix: '/' });
  await app.register(webhookRoutes, { prefix: '/webhooks' });
  await app.register(dataRoutes, { prefix: '/data' });
  await app.register(adminRoutes, { prefix: '/admin' });

  return app;
}

async function start() {
  await build();

  // Run DB migrations on startup
  try {
    await runMigrations();
    app.log.info('✅ Database migrations complete');
  } catch (err) {
    app.log.warn({ err }, '⚠️ Database migration failed — continuing anyway');
  }

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    app.log.info(`Received ${signal}, shutting down gracefully…`);
    stopScheduler();
    await stopWorkers();
    await app.close();
    process.exit(0);
  };

  process.on('SIGTERM', () => { void shutdown('SIGTERM'); });
  process.on('SIGINT', () => { void shutdown('SIGINT'); });

  try {
    await app.listen({ port: cfg.PORT, host: '0.0.0.0' });
    app.log.info(`🚀 Orchestrator API listening on port ${cfg.PORT}`);

    // Start BullMQ workers
    await startWorkers();
    app.log.info('✅ Background workers started');

    // Start tRPC queue workers (seo-generation, lead-scoring, email-nurture)
    createSEOWorker();
    createScoringWorker();
    createEmailWorker();
    app.log.info('✅ tRPC queue workers started');

    // Start autonomous agent scheduler
    startScheduler(app.log);
    app.log.info('✅ Autonomous agent scheduler started');
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();


