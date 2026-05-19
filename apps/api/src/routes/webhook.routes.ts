/**
 * Webhook routes — receive events from the existing Osool frontend.
 *
 * All endpoints:
 *  1. Validate payload with Zod
 *  2. Authenticate via X-Webhook-Secret header
 *  3. Store raw event in the database
 *  4. Enqueue for async processing via BullMQ
 *  5. Return 202 Accepted immediately (non-blocking)
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import { getConfig } from '../config.js';
import { safeCompare, verifyWebhookSignature } from '../lib/auth.js';
import { getRedis } from '../lib/redis.js';
import { getIntentQueue, getAudienceSyncQueue, getScraperEventQueue } from '../jobs/queue.js';
import { db } from '@osool/db';
import { intentSignals, funnelEvents, chatSessions, waitlist as waitlistTable, users } from '@osool/db/schema';

const WEBHOOK_MAX_SKEW_SECONDS = 5 * 60;
const WEBHOOK_NONCE_TTL_SECONDS = 10 * 60;

// ── Zod Schemas ───────────────────────────────────────────────────────────────

const pageContextSchema = z.object({
  url: z.string(),
  pageType: z.enum(['landing', 'comparison', 'roi', 'project', 'guide', 'chat', 'other']),
  locale: z.enum(['en', 'ar']),
});

const utmParamsSchema = z
  .object({
    source: z.string().optional(),
    medium: z.string().optional(),
    campaign: z.string().optional(),
    content: z.string().optional(),
    term: z.string().optional(),
  })
  .optional();

// Platform sends numeric user IDs; accept both string and number, coerce to string
const userIdSchema = z.union([z.string(), z.number()]).transform(String).optional();

const chatMessageSchema = z.object({
  eventType: z.literal('chat_message'),
  sessionId: z.string().min(1),
  userId: userIdSchema,
  anonymousId: z.string().min(1),
  message: z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string().min(1).max(10000),
    timestamp: z.string(),
  }),
  pageContext: pageContextSchema,
  utmParams: utmParamsSchema,
});

const chatSessionEndSchema = z.object({
  eventType: z.literal('chat_session_end'),
  sessionId: z.string().min(1),
  userId: userIdSchema,
  anonymousId: z.string().min(1),
  messageCount: z.number().int().min(0),
  durationSeconds: z.number().min(0),
  lastPageUrl: z.string(),
});

const pageViewSchema = z.object({
  eventType: z.literal('page_view'),
  userId: userIdSchema,
  anonymousId: z.string().min(1),
  url: z.string(),
  pageType: z.enum(['landing', 'comparison', 'roi', 'project', 'guide', 'chat', 'other']),
  referrer: z.string().optional(),
  utmParams: z.record(z.string()).optional(),
  timestamp: z.string(),
});

const signupSchema = z.object({
  eventType: z.enum(['signup', 'waitlist_join']),
  userId: z.string().min(1),
  email: z.string().email(),
  name: z.string().optional(),
  source: z.string(),
  anonymousId: z.string().min(1),
});

const adClickSchema = z.object({
  eventType: z.literal('ad_click'),
  anonymousId: z.string().min(1),
  utmParams: z.record(z.string()),
  landingUrl: z.string(),
  timestamp: z.string(),
});

const userMemorySchema = z.object({
  eventType: z.literal('user_memory_update'),
  userId: z.string().min(1),
  budgetMin: z.number().optional(),
  budgetMax: z.number().optional(),
  preferredAreas: z.array(z.string()).optional(),
  preferredDevelopers: z.array(z.string()).optional(),
  preferencesText: z.string().optional(),
});

// ── Auth middleware ───────────────────────────────────────────────────────────

function checkWebhookSecret(
  secret: string | undefined,
  configuredSecret: string | undefined,
): boolean {
  // In production, WEBHOOK_SECRET is enforced by config validation.
  // In dev, if no secret is configured, allow all requests.
  if (!configuredSecret || configuredSecret.trim() === '') return true;
  if (!secret) return false;
  return safeCompare(secret, configuredSecret);
}

/**
 * Verify webhook request authenticity.
 * Supports both HMAC body signature (preferred) and shared secret header (legacy).
 */
function getHeaderValue(headers: Record<string, string | string[] | undefined>, key: string): string | undefined {
  const value = headers[key];
  if (Array.isArray(value)) return value[0];
  return value;
}

function parseWebhookTimestamp(raw: string | undefined): number | null {
  if (!raw) return null;

  const numeric = Number(raw);
  if (Number.isFinite(numeric)) {
    // Accept both seconds and milliseconds epochs.
    return numeric > 1e12 ? numeric : numeric * 1000;
  }

  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

async function verifyWebhookRequest(
  req: {
    headers: Record<string, string | string[] | undefined>;
    body: unknown;
    log?: { warn?: (payload: unknown, message?: string) => void };
  },
): Promise<boolean> {
  const cfg = getConfig();
  const secretHeader = getHeaderValue(req.headers, 'x-webhook-secret');
  const signatureHeader = getHeaderValue(req.headers, 'x-webhook-signature');
  const timestampHeader = getHeaderValue(req.headers, 'x-webhook-timestamp');
  const nonceHeader = getHeaderValue(req.headers, 'x-webhook-nonce');
  const body = JSON.stringify(req.body);

  const authorized = verifyWebhookSignature(
    body,
    signatureHeader,
    secretHeader,
    cfg.WEBHOOK_SECRET,
  );

  if (!authorized) {
    return false;
  }

  // Legacy secret-header integrations continue to work without timestamp/nonce.
  // Replay protection is enforced when signature headers are provided.
  if (!signatureHeader) {
    return true;
  }

  const tsMs = parseWebhookTimestamp(timestampHeader);
  if (!tsMs) {
    return false;
  }

  const nowMs = Date.now();
  const skewMs = Math.abs(nowMs - tsMs);
  if (skewMs > WEBHOOK_MAX_SKEW_SECONDS * 1000) {
    return false;
  }

  const nonce = nonceHeader || createHash('sha256').update(`${signatureHeader}|${timestampHeader}|${body}`).digest('hex');
  const dedupeKey = `webhook:nonce:${nonce}`;

  try {
    const redis = getRedis();
    const setResult = await redis.set(dedupeKey, '1', 'EX', WEBHOOK_NONCE_TTL_SECONDS, 'NX');
    if (setResult !== 'OK') {
      return false;
    }
  } catch (err) {
    req.log?.warn?.({ err }, 'Webhook replay protection unavailable — allowing request');
  }

  return true;
}

function makeJobId(prefix: string, stableParts: Array<string | number | undefined>): string {
  const raw = stableParts.map((part) => String(part ?? '')).join('|');
  const digest = createHash('sha256').update(raw).digest('hex').slice(0, 20);
  return `${prefix}:${digest}`;
}

// ── Plugin ────────────────────────────────────────────────────────────────────

export const webhookRoutes: FastifyPluginAsync = async (app) => {
  // Rate limit: 1000 req/min per IP
  const rateLimitConfig = { max: 1000, timeWindow: '1 minute' };

  /** POST /webhooks/chat-message */
  app.post(
    '/chat-message',
    { config: { rateLimit: rateLimitConfig } },
    async (req, reply) => {
      if (!(await verifyWebhookRequest(req))) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }

      const parsed = chatMessageSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: 'Invalid payload', details: parsed.error.flatten() });
      }

      const payload = parsed.data;

      // Only process user messages for intent extraction (not assistant responses)
      if (payload.message.role === 'user') {
        const queue = getIntentQueue();
        await queue.add(
          'process-intent',
          {
            sessionId: payload.sessionId,
            userId: payload.userId,
            anonymousId: payload.anonymousId,
            role: payload.message.role,
            message: payload.message.content,
            pageContext: payload.pageContext,
            timestamp: payload.message.timestamp,
          },
          {
            attempts: 3,
            backoff: { type: 'exponential', delay: 2000 },
            jobId: makeJobId('intent', [payload.sessionId, payload.message.timestamp, payload.message.content]),
          },
        );

        // Store funnel event
        await db.insert(funnelEvents).values({
          userId: payload.userId ?? null,
          visitorId: payload.anonymousId,
          sessionId: payload.sessionId,
          event: 'chat_message',
          stage: 'engage',
          properties: {
            role: payload.message.role,
            pageType: payload.pageContext.pageType,
            locale: payload.pageContext.locale,
          } as Record<string, unknown>,
          source: payload.utmParams?.source,
          medium: payload.utmParams?.medium,
          campaign: payload.utmParams?.campaign,
        }).onConflictDoNothing();
      }

      return reply.status(202).send({ accepted: true });
    },
  );

  /** POST /webhooks/chat-session-end */
  app.post(
    '/chat-session-end',
    { config: { rateLimit: rateLimitConfig } },
    async (req, reply) => {
      if (!(await verifyWebhookRequest(req))) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }

      const parsed = chatSessionEndSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: 'Invalid payload', details: parsed.error.flatten() });
      }

      const payload = parsed.data;

      // Store session summary
      await db.update(chatSessions)
        .set({
          messageCount: payload.messageCount,
          endedAt: new Date(),
          lastMessageAt: new Date(),
        })
        .where(eq(chatSessions.id, payload.sessionId));

      // Enqueue lead scoring job
      const { getLeadScoringQueue } = await import('../jobs/queue.js');
      const queue = getLeadScoringQueue();
      await queue.add(
        'score-lead',
        { sessionId: payload.sessionId, anonymousId: payload.anonymousId, userId: payload.userId },
        {
          attempts: 3,
          backoff: { type: 'exponential', delay: 1000 },
          jobId: makeJobId('lead-score', [payload.sessionId, payload.durationSeconds, payload.messageCount]),
        },
      );

      return reply.status(202).send({ accepted: true });
    },
  );

  /** POST /webhooks/page-view */
  app.post(
    '/page-view',
    { config: { rateLimit: rateLimitConfig } },
    async (req, reply) => {
      if (!(await verifyWebhookRequest(req))) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }

      const parsed = pageViewSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: 'Invalid payload', details: parsed.error.flatten() });
      }

      const payload = parsed.data;

      // Fire-and-forget funnel event storage
      db.insert(funnelEvents).values({
        userId: payload.userId ?? null,
        visitorId: payload.anonymousId,
        event: 'page_view',
        stage: 'discover',
        properties: {
          url: payload.url,
          pageType: payload.pageType,
          referrer: payload.referrer,
        } as Record<string, unknown>,
        source: payload.utmParams?.source,
        medium: payload.utmParams?.medium,
        campaign: payload.utmParams?.campaign,
      }).catch((err) => req.log.error({ err }, 'Failed to store page view'));

      return reply.status(202).send({ accepted: true });
    },
  );

  /** POST /webhooks/signup */
  app.post(
    '/signup',
    { config: { rateLimit: { max: 200, timeWindow: '1 minute' } } },
    async (req, reply) => {
      if (!(await verifyWebhookRequest(req))) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }

      const parsed = signupSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: 'Invalid payload', details: parsed.error.flatten() });
      }

      const payload = parsed.data;

      // Store funnel event
      await db.insert(funnelEvents).values({
        visitorId: payload.anonymousId,
        event: payload.eventType,
        stage: 'convert',
        properties: { email: payload.email, name: payload.name, source: payload.source } as Record<string, unknown>,
        source: payload.source,
      }).onConflictDoNothing();

      // Upsert orchestrator user linked to Platform userId
      await db.insert(users).values({
        platformUserId: payload.userId,
        email: payload.email,
        name: payload.name,
        role: 'visitor',
      }).onConflictDoNothing();

      if (payload.eventType === 'waitlist_join') {
        await db.insert(waitlistTable).values({
          email: payload.email,
          name: payload.name,
          source: payload.source,
        }).onConflictDoNothing();
      }

      // Sync audience (high-intent users flagged immediately)
      // Cache the lead profile in Redis so the audience sync job can hash the email
      try {
        const { getRedis } = await import('../lib/redis.js');
        const redis = getRedis();
        if (redis) {
          await redis.set(
            `lead:profile:${payload.anonymousId}`,
            JSON.stringify({ email: payload.email, name: payload.name }),
            'EX',
            86400 * 7,
          );
        }
      } catch (err) {
        req.log.error({ err }, 'Failed to cache lead profile in Redis — audience sync may lack email');
      }

      const syncQueue = getAudienceSyncQueue();
      await syncQueue.add(
        'sync-converter',
        {
          anonymousId: payload.anonymousId,
          segment: 'first_time_buyer',
          channels: ['meta', 'google'] as ('meta' | 'google')[],
          trigger: 'signup' as const,
          platform: 'meta',
        },
        {
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
          jobId: makeJobId('audience-sync', [payload.anonymousId, payload.eventType, payload.email]),
        },
      );

      return reply.status(202).send({ accepted: true });
    },
  );

  /** POST /webhooks/ad-click */
  app.post(
    '/ad-click',
    { config: { rateLimit: rateLimitConfig } },
    async (req, reply) => {
      if (!(await verifyWebhookRequest(req))) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }

      const parsed = adClickSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: 'Invalid payload', details: parsed.error.flatten() });
      }

      const payload = parsed.data;

      await db.insert(funnelEvents).values({
        visitorId: payload.anonymousId,
        event: 'ad_click',
        stage: 'discover',
        properties: {
          landingUrl: payload.landingUrl,
          utmParams: payload.utmParams,
        } as Record<string, unknown>,
        source: payload.utmParams['utm_source'],
        medium: payload.utmParams['utm_medium'],
        campaign: payload.utmParams['utm_campaign'],
      }).onConflictDoNothing();

      return reply.status(202).send({ accepted: true });
    },
  );

  /** POST /webhooks/user-memory — sync user preferences from Platform */
  app.post(
    '/user-memory',
    { config: { rateLimit: rateLimitConfig } },
    async (req, reply) => {
      if (!(await verifyWebhookRequest(req))) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }

      const parsed = userMemorySchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: 'Invalid payload', details: parsed.error.flatten() });
      }

      const payload = parsed.data;

      // Update orchestrator user metadata with preferences
      const metadata: Record<string, unknown> = {};
      if (payload.budgetMin != null) metadata.budgetMin = payload.budgetMin;
      if (payload.budgetMax != null) metadata.budgetMax = payload.budgetMax;
      if (payload.preferredAreas) metadata.preferredAreas = payload.preferredAreas;
      if (payload.preferredDevelopers) metadata.preferredDevelopers = payload.preferredDevelopers;
      if (payload.preferencesText) metadata.preferencesText = payload.preferencesText;

      await db.update(users)
        .set({
          metadata,
          icpSegment: payload.budgetMax && payload.budgetMax > 10_000_000 ? 'domestic_hnw' : undefined,
          updatedAt: new Date(),
        })
        .where(eq(users.platformUserId, payload.userId));

      // Invalidate user context cache
      try {
        const redis = getRedis();
        await redis.del(`data:user-context:${payload.userId}`);
      } catch { /* non-critical */ }

      return reply.status(202).send({ accepted: true });
    },
  );

  // ── 7. Scraper Event (Platform → Orchestrator closed-loop trigger) ────────
  const scraperEventSchema = z.object({
    eventType: z.enum(['property_scrape_complete', 'economic_update', 'geopolitical_shift']),
    runId: z.string().optional(),
    totalProperties: z.number().optional(),
    significantChanges: z.number().optional(),
    indicators: z.record(z.number()).optional(),
    sentimentShift: z.number().optional(),
  });

  app.post<{ Body: z.infer<typeof scraperEventSchema> }>(
    '/webhooks/scraper-event',
    async (req, reply) => {
      if (!verifyWebhookRequest(req)) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }

      const parsed = scraperEventSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: 'Invalid payload', details: parsed.error.flatten() });
      }

      const queue = getScraperEventQueue();
      await queue.add('scraper-event', parsed.data, {
        priority: 2,
        jobId: makeJobId('scraper-event', [parsed.data.eventType, parsed.data.runId, parsed.data.significantChanges]),
      });

      return reply.status(202).send({ accepted: true, eventType: parsed.data.eventType });
    },
  );
};


