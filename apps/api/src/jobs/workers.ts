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
  type NotificationPushJobData,
  type ScraperEventJobData,
  type ExperimentScoringJobData,
  type ContentQualityGateJobData,
  type SEOIntelligenceJobData,
  type CROAuditJobData,
  type ContentOptimizationJobData,
  type ScraperRefreshJobData,
  type ReachScanJobData,
  type ReachEnrichJobData,
  type OutreachSendJobData,
  type SeoBatchAccumulatorJobData,
  type EmbedBackfillJobData,
  type DeadLetterJobData,
  getDeadLetterQueue,
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

async function processNotificationPushJob(job: Job<NotificationPushJobData>) {
  const { runNotificationPush } = await import('./handlers/notification-push.job.js');
  return runNotificationPush(job.data);
}

async function processScraperEventJob(job: Job<ScraperEventJobData>) {
  const { processScraperEvent } = await import('./handlers/scraper-event.job.js');
  return processScraperEvent(job.data);
}

async function processExperimentScoringJob(job: Job<ExperimentScoringJobData>) {
  const { scoreExperimentJob } = await import('./handlers/score-experiment.job.js');
  return scoreExperimentJob(job.data);
}

async function processContentQualityGateJob(job: Job<ContentQualityGateJobData>) {
  const { runQualityGate } = await import('./handlers/quality-gate.job.js');
  return runQualityGate(job.data);
}

async function processSEOIntelligenceJob(job: Job<SEOIntelligenceJobData>) {
  const { runSEOIntelligence } = await import('./handlers/seo-intelligence.job.js');
  return runSEOIntelligence(job.data);
}

async function processCROAuditJob(job: Job<CROAuditJobData>) {
  const { runCROAudit } = await import('./handlers/cro-audit.job.js');
  return runCROAudit(job.data);
}

async function processContentOptimizationJob(job: Job<ContentOptimizationJobData>) {
  const { optimizeContent } = await import('./handlers/optimize-content.job.js');
  return optimizeContent(job.data);
}

async function processScraperRefreshJob(job: Job<ScraperRefreshJobData>) {
  const { processScraperRefresh } = await import('./handlers/scraper-refresh.job.js');
  return processScraperRefresh(job.data);
}

async function processReachScanJob(job: Job<ReachScanJobData>) {
  const { runReachScan } = await import('./handlers/reach-scan.job.js');
  return runReachScan(job.data);
}

async function processReachEnrichJob(job: Job<ReachEnrichJobData>) {
  const { runReachEnrich } = await import('./handlers/reach-enrich.job.js');
  return runReachEnrich(job.data);
}

async function processOutreachSendJob(job: Job<OutreachSendJobData>) {
  const { runOutreachSend } = await import('./handlers/outreach-send.job.js');
  return runOutreachSend(job.data);
}

async function processSeoBatchAccumulatorJob(job: Job<SeoBatchAccumulatorJobData>) {
  const { runSeoBatchAccumulator } = await import('./handlers/seo-batch-accumulator.job.js');
  return runSeoBatchAccumulator(job.data);
}

async function processEmbedBackfillJob(job: Job<EmbedBackfillJobData>) {
  const { runEmbedBackfill } = await import('./handlers/embed-backfill.job.js');
  return runEmbedBackfill(job.data);
}

// ── Worker registry ───────────────────────────────────────────────────────────

const activeWorkers: Worker[] = [];

/** Start all BullMQ workers. Called once on server startup. */
export async function startWorkers(): Promise<void> {
  const conn = getRedisOpts();
  const deadLetterQueue = getDeadLetterQueue();

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

  const notificationPushWorker = new Worker<NotificationPushJobData>(
    'notification-push',
    processNotificationPushJob,
    {
      connection: conn,
      concurrency: 1,
    },
  );

  const scraperEventWorker = new Worker<ScraperEventJobData>(
    'scraper-event',
    processScraperEventJob,
    {
      connection: conn,
      concurrency: 2,
    },
  );

  const experimentScoringWorker = new Worker<ExperimentScoringJobData>(
    'experiment-scoring',
    processExperimentScoringJob,
    {
      connection: conn,
      concurrency: 3,
    },
  );

  const qualityGateWorker = new Worker<ContentQualityGateJobData>(
    'content-quality-gate',
    processContentQualityGateJob,
    {
      connection: conn,
      concurrency: 2,
      limiter: { max: 5, duration: 60_000 },
    },
  );

  const seoIntelligenceWorker = new Worker<SEOIntelligenceJobData>(
    'seo-intelligence',
    processSEOIntelligenceJob,
    {
      connection: conn,
      concurrency: 1,
    },
  );

  const croAuditWorker = new Worker<CROAuditJobData>(
    'cro-audit',
    processCROAuditJob,
    {
      connection: conn,
      concurrency: 2,
      limiter: { max: 10, duration: 60_000 },
    },
  );

  const contentOptimizationWorker = new Worker<ContentOptimizationJobData>(
    'content-optimization',
    processContentOptimizationJob,
    {
      connection: conn,
      concurrency: 1,
      limiter: { max: 3, duration: 60_000 },
    },
  );

  const scraperRefreshWorker = new Worker<ScraperRefreshJobData>(
    'scraper-refresh',
    processScraperRefreshJob,
    {
      connection: conn,
      concurrency: 1,
      limiter: { max: 2, duration: 60_000 },
    },
  );

  const reachScanWorker = new Worker<ReachScanJobData>('reach-scan', processReachScanJob, {
    connection: conn,
    concurrency: 2,
    limiter: { max: 5, duration: 60_000 },
  });

  const reachEnrichWorker = new Worker<ReachEnrichJobData>('reach-enrich', processReachEnrichJob, {
    connection: conn,
    concurrency: 5,
  });

  const outreachSendWorker = new Worker<OutreachSendJobData>(
    'outreach-send',
    processOutreachSendJob,
    {
      connection: conn,
      concurrency: 2,
      limiter: { max: 20, duration: 60_000 },
    },
  );

  const seoBatchAccumulatorWorker = new Worker<SeoBatchAccumulatorJobData>(
    'seo-batch-accumulator',
    processSeoBatchAccumulatorJob,
    {
      connection: conn,
      concurrency: 1, // only one flush at a time
    },
  );

  const embedBackfillWorker = new Worker<EmbedBackfillJobData>(
    'embed-backfill',
    processEmbedBackfillJob,
    {
      connection: conn,
      concurrency: 1,
    },
  );

  for (const worker of [
    intentWorker,
    scoringWorker,
    audienceWorker,
    seoWorker,
    emailSendWorker,
    emailTriggerWorker,
    feedbackLoopWorker,
    marketPulseWorker,
    notificationPushWorker,
    scraperEventWorker,
    experimentScoringWorker,
    qualityGateWorker,
    seoIntelligenceWorker,
    croAuditWorker,
    contentOptimizationWorker,
    scraperRefreshWorker,
    reachScanWorker,
    reachEnrichWorker,
    outreachSendWorker,
    seoBatchAccumulatorWorker,
    embedBackfillWorker,
  ]) {
    worker.on('completed', (job) => {
      console.info(`[${worker.name}] Job ${job.id} completed`);
    });

    worker.on('failed', (job, err) => {
      console.error(`[${worker.name}] Job ${job?.id} failed:`, (err as Error).message);

      if (!job) {
        return;
      }

      const dlqPayload: DeadLetterJobData = {
        sourceQueue: worker.name,
        sourceJobId: String(job.id ?? ''),
        sourceJobName: job.name,
        attemptsMade: job.attemptsMade,
        failedReason: (err as Error).message,
        payload: (job.data ?? {}) as Record<string, unknown>,
        failedAt: new Date().toISOString(),
      };

      deadLetterQueue
        .add('dead-letter-capture', dlqPayload, {
          jobId: `dlq:${worker.name}:${String(job.id ?? '')}:${job.attemptsMade}`,
          removeOnComplete: { count: 5000 },
          removeOnFail: false,
        })
        .catch((dlqErr) => {
          console.error(`[${worker.name}] Failed to push job ${job.id} to DLQ:`, dlqErr);
        });
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
  const {
    getMarketPulseQueue,
    getFeedbackLoopQueue,
    getNotificationPushQueue,
    getExperimentScoringQueue,
    getSEOIntelligenceQueue,
  } = await import('./queue.js');

  const marketPulseQ = getMarketPulseQueue();
  const feedbackLoopQ = getFeedbackLoopQueue();
  const notificationPushQ = getNotificationPushQueue();
  const experimentScoringQ = getExperimentScoringQueue();
  const seoIntelligenceQ = getSEOIntelligenceQueue();

  // Nexus agent: run market pulse every hour
  await marketPulseQ.add(
    'market-pulse-hourly',
    {},
    { repeat: { pattern: '0 * * * *' } },
  );

  // Notification push: run 5 min after market pulse
  await notificationPushQ.add(
    'notification-push-hourly',
    { triggeredBy: 'scheduled' },
    { repeat: { pattern: '5 * * * *' } },
  );

  // Feedback loops: run each type every 6 hours
  const loopTypes: FeedbackLoopJobData['loopType'][] = [
    'keyword_seo_sync',
    'audience_performance_sync',
    'email_sequence_optimize',
    'lead_scoring_recalibrate',
    'content_gap_analysis',
    'icp_learning_update',
  ];

  for (const loopType of loopTypes) {
    await feedbackLoopQ.add(
      `feedback-${loopType}`,
      { loopType },
      { repeat: { pattern: '0 */6 * * *' } },
    );
  }

  // Experiment scoring: every 4 hours
  await experimentScoringQ.add(
    'experiment-scoring-scheduled',
    { triggeredBy: 'scheduled' },
    { repeat: { pattern: '0 */4 * * *' } },
  );

  // SEO intelligence: weekly on Monday at 3 AM
  await seoIntelligenceQ.add(
    'seo-intelligence-weekly',
    { scope: 'full', triggeredBy: 'scheduled' },
    { repeat: { pattern: '0 3 * * 1' } },
  );

  // Reach scan: every 4 hours for Egyptian RE market signals
  const { getReachScanQueue, getSeoBatchAccumulatorQueue, getEmbedBackfillQueue } = await import('./queue.js');
  await getReachScanQueue().add(
    'reach-scan-scheduled',
    { query: 'egypt real estate', triggeredBy: 'scheduled' },
    { repeat: { pattern: '0 */4 * * *' } },
  );

  // SEO batch flush: every 10 minutes
  await getSeoBatchAccumulatorQueue().add(
    'seo-batch-flush',
    { reason: 'scheduled', triggeredBy: 'scheduled' },
    { repeat: { pattern: '*/10 * * * *' } },
  );

  // Embedding backfill: nightly at 2 AM
  await getEmbedBackfillQueue().add(
    'embed-backfill-nightly',
    { entity: 'all', triggeredBy: 'scheduled' },
    { repeat: { pattern: '0 2 * * *' } },
  );

  console.info('[Workers] Scheduled agent jobs registered');
}
