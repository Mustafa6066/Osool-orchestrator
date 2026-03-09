/**
 * BullMQ workers — process all queued jobs.
 *
 * startWorkers() is called from server.ts on startup.
 * stopWorkers()  is called during graceful shutdown.
 */

import { Worker, type Job } from 'bullmq';
import { getRedisOpts } from '../lib/redis.js';
import {
  type IntentJobData,
  type LeadScoringJobData,
  type AudienceSyncJobData,
  type SEOContentGenJobData,
  type EmailSendJobData,
  type EmailTriggerJobData,
  type FeedbackLoopJobData,
  type MarketPulseJobData,
  getEmailSendQueue,
} from './queue.js';

// Lazy job-handler imports (avoid circular deps at module load time)
async function processIntentJob(job: Job<IntentJobData>) {
  const { processIntent } = await import('./handlers/process-intent.job.js');
  return processIntent(job.data);
}

async function processLeadScoringJob(job: Job<LeadScoringJobData>) {
  const { scoreLeadSession } = await import('./handlers/score-lead.job.js');
  return scoreLeadSession(job.data);
}

async function processAudienceSyncJob(job: Job<AudienceSyncJobData>) {
  const { syncAudience } = await import('./handlers/sync-audience.job.js');
  return syncAudience(job.data);
}

async function processSEOContentJob(job: Job<SEOContentGenJobData>) {
  const { generateSEOContent } = await import('./handlers/generate-seo-content.job.js');
  return generateSEOContent(job.data);
}

async function processEmailSendJob(job: Job<EmailSendJobData>) {
  const { sendEmail } = await import('./handlers/send-email.job.js');
  return sendEmail(job.data);
}

async function processEmailTriggerJob(job: Job<EmailTriggerJobData>) {
  const { checkEmailTriggers } = await import('./handlers/check-email-triggers.job.js');
  return checkEmailTriggers(job.data);
}

async function processFeedbackLoopJob(job: Job<FeedbackLoopJobData>) {
  const { runFeedbackLoop } = await import('./handlers/run-feedback-loop.job.js');
  return runFeedbackLoop(job.data);
}

async function processMarketPulseJob(job: Job<MarketPulseJobData>) {
  const { runMarketPulse } = await import('./handlers/market-pulse.job.js');
  return runMarketPulse(job.data);
}

// ── Worker registry ───────────────────────────────────────────────────────────

const activeWorkers: Worker[] = [];

/** Start all BullMQ workers. Called once on server startup. */
export async function startWorkers(): Promise<void> {
  const conn = getRedisOpts();

  const intentWorker = new Worker<IntentJobData>('intent-processing', processIntentJob, {
    connection: conn,
    concurrency: 10,
    limiter: { max: 100, duration: 60_000 },
  });

  const scoringWorker = new Worker<LeadScoringJobData>('lead-scoring', processLeadScoringJob, {
    connection: conn,
    concurrency: 5,
  });

  const audienceWorker = new Worker<AudienceSyncJobData>('audience-sync', processAudienceSyncJob, {
    connection: conn,
    concurrency: 3,
    limiter: { max: 20, duration: 60_000 },
  });

  const seoWorker = new Worker<SEOContentGenJobData>('seo-content-gen', processSEOContentJob, {
    connection: conn,
    concurrency: 3,
    limiter: { max: 10, duration: 60_000 },
  });

  const emailSendWorker = new Worker<EmailSendJobData>('email-send', processEmailSendJob, {
    connection: conn,
    concurrency: 2,
    limiter: { max: 50, duration: 60_000 },
  });

  const emailTriggerWorker = new Worker<EmailTriggerJobData>(
    'email-trigger',
    processEmailTriggerJob,
    {
      connection: conn,
      concurrency: 5,
    },
  );

  const feedbackLoopWorker = new Worker<FeedbackLoopJobData>(
    'feedback-loop',
    processFeedbackLoopJob,
    {
      connection: conn,
      concurrency: 2,
    },
  );

  const marketPulseWorker = new Worker<MarketPulseJobData>('market-pulse', processMarketPulseJob, {
    connection: conn,
    concurrency: 1,
  });

  for (const worker of [
    intentWorker,
    scoringWorker,
    audienceWorker,
    seoWorker,
    emailSendWorker,
    emailTriggerWorker,
    feedbackLoopWorker,
    marketPulseWorker,
  ]) {
    worker.on('completed', (job) => {
      console.info(`[${worker.name}] Job ${job.id} completed`);
    });

    worker.on('failed', (job, err) => {
      console.error(`[${worker.name}] Job ${job?.id} failed:`, (err as Error).message);
    });

    activeWorkers.push(worker);
  }

  // Start scheduled agent jobs (run via BullMQ repeat)
  await scheduleAgentJobs();

  console.info(`[Workers] ${activeWorkers.length} workers started`);
}

/** Gracefully close all workers. Called during SIGTERM/SIGINT. */
export async function stopWorkers(): Promise<void> {
  await Promise.all(activeWorkers.map((w) => w.close()));
  activeWorkers.length = 0;
  console.info('[Workers] All workers stopped');
}

// ── Scheduled agent jobs ──────────────────────────────────────────────────────

async function scheduleAgentJobs(): Promise<void> {
  const { getMarketPulseQueue, getFeedbackLoopQueue } = await import('./queue.js');

  const marketPulseQ = getMarketPulseQueue();
  const feedbackLoopQ = getFeedbackLoopQueue();

  // Nexus agent: run market pulse every hour
  await marketPulseQ.add(
    'market-pulse-hourly',
    {},
    { repeat: { pattern: '0 * * * *' } },
  );

  // Feedback loops: run each type every 6 hours
  const loopTypes: FeedbackLoopJobData['loopType'][] = [
    'keyword_seo_sync',
    'audience_performance_sync',
    'email_sequence_optimize',
    'lead_scoring_recalibrate',
    'content_gap_analysis',
  ];

  for (const loopType of loopTypes) {
    await feedbackLoopQ.add(
      `feedback-${loopType}`,
      { loopType },
      { repeat: { pattern: '0 */6 * * *' } },
    );
  }

  console.info('[Workers] Scheduled agent jobs registered');
}
