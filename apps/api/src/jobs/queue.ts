/**
 * BullMQ queue factory functions.
 *
 * All queues share the same Redis connection (ioredis options from config).
 * Each queue is returned as a singleton via a closure.
 *
 * Queues:
 *  intent-processing    — parse and store intent signals from chat messages
 *  lead-scoring         — score a session's engagement and intent
 *  audience-sync        — sync retargeting audiences to Meta / Google
 *  seo-content-gen      — generate AI content for SEO pages
 *  email-send           — send a single transactional or sequence email
 *  email-trigger        — evaluate whether to start an email sequence
 *  feedback-loop        — run a single feedback loop analysis step
 *  market-pulse         — hourly market data aggregation (Nexus agent)
 *  notification-push    — match trending data against user prefs, create alerts
 */

import { Queue } from 'bullmq';
import { getRedisOpts } from '../lib/redis.js';

// Default options applied to all queues
const defaultQueueOpts = {
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential' as const, delay: 2000 },
    removeOnComplete: { count: 500 },
    removeOnFail: { count: 1000 },
  },
};

// ── Singletons ─────────────────────────────────────────────────────────────────

let intentQueue: Queue | null = null;
let leadScoringQueue: Queue | null = null;
let audienceSyncQueue: Queue | null = null;
let seoContentGenQueue: Queue | null = null;
let emailSendQueue: Queue | null = null;
let emailTriggerQueue: Queue | null = null;
let feedbackLoopQueue: Queue | null = null;
let marketPulseQueue: Queue | null = null;
let notificationPushQueue: Queue | null = null;
let scraperEventQueue: Queue | null = null;
let experimentScoringQueue: Queue | null = null;
let contentQualityGateQueue: Queue | null = null;
let seoIntelligenceQueue: Queue | null = null;
let croAuditQueue: Queue | null = null;
let contentOptimizationQueue: Queue | null = null;
let scraperRefreshQueue: Queue | null = null;

// ── Factory functions ─────────────────────────────────────────────────────────

export function getIntentQueue(): Queue<IntentJobData> {
  if (!intentQueue) {
    intentQueue = new Queue<IntentJobData>('intent-processing', {
      connection: getRedisOpts(),
      ...defaultQueueOpts,
    });
  }
  return intentQueue as Queue<IntentJobData>;
}

export function getLeadScoringQueue(): Queue<LeadScoringJobData> {
  if (!leadScoringQueue) {
    leadScoringQueue = new Queue<LeadScoringJobData>('lead-scoring', {
      connection: getRedisOpts(),
      ...defaultQueueOpts,
    });
  }
  return leadScoringQueue as Queue<LeadScoringJobData>;
}

export function getAudienceSyncQueue(): Queue<AudienceSyncJobData> {
  if (!audienceSyncQueue) {
    audienceSyncQueue = new Queue<AudienceSyncJobData>('audience-sync', {
      connection: getRedisOpts(),
      ...defaultQueueOpts,
    });
  }
  return audienceSyncQueue as Queue<AudienceSyncJobData>;
}

export function getSEOContentGenQueue(): Queue<SEOContentGenJobData> {
  if (!seoContentGenQueue) {
    seoContentGenQueue = new Queue<SEOContentGenJobData>('seo-content-gen', {
      connection: getRedisOpts(),
      ...defaultQueueOpts,
    });
  }
  return seoContentGenQueue as Queue<SEOContentGenJobData>;
}

export function getEmailSendQueue(): Queue<EmailSendJobData> {
  if (!emailSendQueue) {
    emailSendQueue = new Queue<EmailSendJobData>('email-send', {
      connection: getRedisOpts(),
      ...defaultQueueOpts,
    });
  }
  return emailSendQueue as Queue<EmailSendJobData>;
}

export function getEmailTriggerQueue(): Queue<EmailTriggerJobData> {
  if (!emailTriggerQueue) {
    emailTriggerQueue = new Queue<EmailTriggerJobData>('email-trigger', {
      connection: getRedisOpts(),
      ...defaultQueueOpts,
    });
  }
  return emailTriggerQueue as Queue<EmailTriggerJobData>;
}

export function getFeedbackLoopQueue(): Queue<FeedbackLoopJobData> {
  if (!feedbackLoopQueue) {
    feedbackLoopQueue = new Queue<FeedbackLoopJobData>('feedback-loop', {
      connection: getRedisOpts(),
      ...defaultQueueOpts,
    });
  }
  return feedbackLoopQueue as Queue<FeedbackLoopJobData>;
}

export function getMarketPulseQueue(): Queue<MarketPulseJobData> {
  if (!marketPulseQueue) {
    marketPulseQueue = new Queue<MarketPulseJobData>('market-pulse', {
      connection: getRedisOpts(),
      ...defaultQueueOpts,
    });
  }
  return marketPulseQueue as Queue<MarketPulseJobData>;
}

export function getNotificationPushQueue(): Queue<NotificationPushJobData> {
  if (!notificationPushQueue) {
    notificationPushQueue = new Queue<NotificationPushJobData>('notification-push', {
      connection: getRedisOpts(),
      ...defaultQueueOpts,
    });
  }
  return notificationPushQueue as Queue<NotificationPushJobData>;
}

export function getScraperEventQueue(): Queue<ScraperEventJobData> {
  if (!scraperEventQueue) {
    scraperEventQueue = new Queue<ScraperEventJobData>('scraper-event', {
      connection: getRedisOpts(),
      ...defaultQueueOpts,
    });
  }
  return scraperEventQueue as Queue<ScraperEventJobData>;
}

export function getExperimentScoringQueue(): Queue<ExperimentScoringJobData> {
  if (!experimentScoringQueue) {
    experimentScoringQueue = new Queue<ExperimentScoringJobData>('experiment-scoring', {
      connection: getRedisOpts(),
      ...defaultQueueOpts,
    });
  }
  return experimentScoringQueue as Queue<ExperimentScoringJobData>;
}

export function getContentQualityGateQueue(): Queue<ContentQualityGateJobData> {
  if (!contentQualityGateQueue) {
    contentQualityGateQueue = new Queue<ContentQualityGateJobData>('content-quality-gate', {
      connection: getRedisOpts(),
      ...defaultQueueOpts,
    });
  }
  return contentQualityGateQueue as Queue<ContentQualityGateJobData>;
}

export function getSEOIntelligenceQueue(): Queue<SEOIntelligenceJobData> {
  if (!seoIntelligenceQueue) {
    seoIntelligenceQueue = new Queue<SEOIntelligenceJobData>('seo-intelligence', {
      connection: getRedisOpts(),
      ...defaultQueueOpts,
    });
  }
  return seoIntelligenceQueue as Queue<SEOIntelligenceJobData>;
}

export function getCROAuditQueue(): Queue<CROAuditJobData> {
  if (!croAuditQueue) {
    croAuditQueue = new Queue<CROAuditJobData>('cro-audit', {
      connection: getRedisOpts(),
      ...defaultQueueOpts,
    });
  }
  return croAuditQueue as Queue<CROAuditJobData>;
}

export function getContentOptimizationQueue(): Queue<ContentOptimizationJobData> {
  if (!contentOptimizationQueue) {
    contentOptimizationQueue = new Queue<ContentOptimizationJobData>('content-optimization', {
      connection: getRedisOpts(),
      ...defaultQueueOpts,
    });
  }
  return contentOptimizationQueue as Queue<ContentOptimizationJobData>;
}

export function getScraperRefreshQueue(): Queue<ScraperRefreshJobData> {
  if (!scraperRefreshQueue) {
    scraperRefreshQueue = new Queue<ScraperRefreshJobData>('scraper-refresh', {
      connection: getRedisOpts(),
      ...defaultQueueOpts,
    });
  }
  return scraperRefreshQueue as Queue<ScraperRefreshJobData>;
}

// ── Close all queues ──────────────────────────────────────────────────────────

export async function closeAllQueues(): Promise<void> {
  await Promise.all(
    [
      intentQueue,
      leadScoringQueue,
      audienceSyncQueue,
      seoContentGenQueue,
      emailSendQueue,
      emailTriggerQueue,
      feedbackLoopQueue,
      marketPulseQueue,
      notificationPushQueue,
      scraperEventQueue,
      experimentScoringQueue,
      contentQualityGateQueue,
      seoIntelligenceQueue,
      croAuditQueue,
      contentOptimizationQueue,
      scraperRefreshQueue,
    ]
      .filter(Boolean)
      .map((q) => q!.close()),
  );
}

// ── Job data type definitions ─────────────────────────────────────────────────

export interface IntentJobData {
  sessionId: string;
  userId?: string;
  anonymousId?: string;
  message: string;
  role?: 'user' | 'assistant';
  timestamp?: string;
  pageContext?: Record<string, unknown>;
}

export interface LeadScoringJobData {
  sessionId: string;
  userId?: string;
  anonymousId?: string;
  trigger?: 'session_end' | 'signup' | 'page_view' | 'ad_click';
}

export interface AudienceSyncJobData {
  anonymousId?: string;
  userId?: string;
  segment?: string;
  trigger?: 'signup' | 'ad_click' | 'lead_score_update';
  channels?: ('meta' | 'google')[];
  platform?: 'meta' | 'google';
  campaignId?: string;
  email?: string;
  event?: string;
}

export interface SEOContentGenJobData {
  pageType: string;
  slug?: string;
  locale: 'en' | 'ar';
  entityId?: string;
  entityIds?: string[];
  keywordId?: string;
  forceRegenerate?: boolean;
}

export interface EmailSendJobData {
  to: string;
  toName?: string;
  subject?: string;
  html?: string;
  text?: string;
  sequenceId?: string;
  stepNumber?: number;
  stepIndex?: number;
  userId?: string;
  anonymousId?: string;
  sessionId?: string;
  tier?: string;
  templateType?: string;
}

export interface EmailTriggerJobData {
  sessionId?: string;
  userId?: string;
  anonymousId?: string;
  trigger?: 'signup' | 'session_end' | 'lead_score_threshold' | 'waitlist_join';
  score?: number;
  segment?: string;
  email?: string;
  name?: string;
}

export interface FeedbackLoopJobData {
  loopType:
    | 'keyword_seo_sync'
    | 'audience_performance_sync'
    | 'email_sequence_optimize'
    | 'lead_scoring_recalibrate'
    | 'content_gap_analysis'
    | 'icp_learning_update';
  entityId?: string;
}

export interface MarketPulseJobData {
  forceRun?: boolean;
  triggeredBy?: string;
}

export interface NotificationPushJobData {
  triggeredBy?: string;
}

export interface ScraperEventJobData {
  eventType: 'property_scrape_complete' | 'economic_update' | 'geopolitical_shift';
  runId?: string;
  totalProperties?: number;
  significantChanges?: number;
  indicators?: Record<string, number>;
  sentimentShift?: number;
  triggeredBy?: string;
}

export interface ExperimentScoringJobData {
  experimentId?: string; // specific experiment, or all running if omitted
  triggeredBy?: string;
}

export interface ContentQualityGateJobData {
  seoContentId: string;
  contentType: string;
  locale?: string;
  maxRounds?: number; // default 3
}

export interface SEOIntelligenceJobData {
  scope?: 'full' | 'decay_only' | 'gaps_only';
  triggeredBy?: string;
}

export interface CROAuditJobData {
  url: string;
  pageType: string;
}

export interface ContentOptimizationJobData {
  seoContentId: string;
  elements?: string[]; // which elements to optimize: 'headline' | 'meta' | 'h1' | 'intro' | 'cta'
  maxRounds?: number; // default 3
}

export interface ScraperRefreshJobData {
  source: 'nawy' | 'aqarmap' | 'bayut';
  mode: 'full' | 'targeted' | 'nawy_now';
  targetArea?: string;
  targetCompoundSlug?: string;
  triggeredBy?: string;
  priority?: 'normal' | 'high';
}
