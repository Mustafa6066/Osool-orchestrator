import { Queue, Worker, type Job } from 'bullmq';
import { env } from '../lib/env.js';
import { generateSEOPage, type SEOPageInput } from '../agents/seo-agent.js';
import { computeLeadScoreForSession } from '../agents/intent-agent.js';
import { sendNurtureEmail } from './email-jobs.js';

function parseRedisUrl(url: string) {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parseInt(parsed.port || '6379', 10),
    password: parsed.password || undefined,
    maxRetriesPerRequest: null as unknown as number,
  };
}

const redisOpts = parseRedisUrl(env.REDIS_URL);

// SEO page generation queue
export const seoQueue = new Queue('seo-generation', { connection: redisOpts });
// Lead scoring queue
export const scoringQueue = new Queue('lead-scoring', { connection: redisOpts });
// Email nurture queue
export const emailQueue = new Queue('email-nurture', { connection: redisOpts });

export function createSEOWorker() {
  return new Worker(
    'seo-generation',
    async (job: Job<SEOPageInput>) => {
      const result = await generateSEOPage(job.data);
      return result;
    },
    {
      connection: redisOpts,
      concurrency: 3,
      limiter: { max: 10, duration: 60_000 },
    },
  );
}

export function createScoringWorker() {
  return new Worker(
    'lead-scoring',
    async (job: Job<{ sessionId: string }>) => {
      const score = await computeLeadScoreForSession(job.data.sessionId);
      if (score >= 60) {
        await emailQueue.add('nurture', { sessionId: job.data.sessionId, score });
      }
      return { score };
    },
    { connection: redisOpts, concurrency: 5 },
  );
}

export function createEmailWorker() {
  return new Worker(
    'email-nurture',
    async (job: Job<{ sessionId: string; score: number }>) => {
      await sendNurtureEmail(job.data.sessionId, job.data.score);
    },
    {
      connection: redisOpts,
      concurrency: 2,
      limiter: { max: 50, duration: 60_000 },
    },
  );
}
