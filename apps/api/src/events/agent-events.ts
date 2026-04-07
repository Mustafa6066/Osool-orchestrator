/**
 * Agent Event Bus — event-driven triggers for autonomous agents.
 *
 * Replaces pure fixed-interval scheduling with a hybrid model:
 *  - Scheduled agents still run on their cadence (Nexus 60m, Marketing 6h, etc.)
 *  - Critical events trigger immediate agent actions (hot leads, market shifts, scrapes)
 *
 * Inspired by Composio Agent-Orchestrator's reaction system:
 *  AO: ci-failed → auto-fix, changes-requested → re-run
 *  Osool: hot-lead → instant-scoring, scraper-complete → cache-refresh, market-shift → revalue
 */

import { EventEmitter } from 'node:events';

// ── Event type definitions ──────────────────────────────────────────────────────

export interface HotLeadEvent {
  sessionId: string;
  userId?: string;
  anonymousId?: string;
  score: number;
  segment?: string;
  /** What triggered hot lead detection (e.g., 'intent-signal', 'page-view-burst') */
  trigger: string;
  timestamp: string;
}

export interface ScraperCompleteEvent {
  runId: string;
  source: 'nawy' | 'aqarmap' | 'bayut' | 'manual';
  totalProperties: number;
  newProperties: number;
  updatedProperties: number;
  failedPages: number;
  durationMs: number;
  timestamp: string;
}

export interface MarketShiftEvent {
  shiftType: 'price_spike' | 'price_drop' | 'supply_surge' | 'demand_surge' | 'policy_change';
  area?: string;
  magnitude: number; // percentage change
  indicators: Record<string, number>;
  source: string;
  timestamp: string;
}

export interface AgentErrorEvent {
  agentName: string;
  error: string;
  stack?: string;
  recoverable: boolean;
  timestamp: string;
}

export interface ContentQualityEvent {
  seoContentId: string;
  contentType: string;
  qualityScore: number;
  issues: string[];
  action: 'approve' | 'revise' | 'reject';
  timestamp: string;
}

/** Union of all events the agent bus can emit. */
export type AgentEventMap = {
  'hot-lead': HotLeadEvent;
  'scraper-complete': ScraperCompleteEvent;
  'market-shift': MarketShiftEvent;
  'agent-error': AgentErrorEvent;
  'content-quality': ContentQualityEvent;
};

export type AgentEventName = keyof AgentEventMap;

// ── Typed Event Bus ─────────────────────────────────────────────────────────────

class AgentEventBus {
  private emitter = new EventEmitter();
  private listenerCounts = new Map<string, number>();

  constructor() {
    // Increase max listeners since multiple agents react to same events
    this.emitter.setMaxListeners(50);
  }

  /** Emit a typed event. */
  emit<K extends AgentEventName>(event: K, data: AgentEventMap[K]): void {
    this.emitter.emit(event, data);
    this.emitter.emit('*', { event, data }); // wildcard for logging
  }

  /** Register a typed listener. */
  on<K extends AgentEventName>(event: K, handler: (data: AgentEventMap[K]) => void | Promise<void>): void {
    this.emitter.on(event, handler);
    this.listenerCounts.set(event, (this.listenerCounts.get(event) ?? 0) + 1);
  }

  /** Register a one-time typed listener. */
  once<K extends AgentEventName>(event: K, handler: (data: AgentEventMap[K]) => void | Promise<void>): void {
    this.emitter.once(event, handler);
  }

  /** Remove a specific listener. */
  off<K extends AgentEventName>(event: K, handler: (data: AgentEventMap[K]) => void | Promise<void>): void {
    this.emitter.off(event, handler);
    const count = this.listenerCounts.get(event) ?? 1;
    this.listenerCounts.set(event, Math.max(0, count - 1));
  }

  /** Listen to all events (for logging/monitoring). */
  onAny(handler: (envelope: { event: string; data: unknown }) => void): void {
    this.emitter.on('*', handler);
  }

  /** Get listener count per event for health monitoring. */
  getListenerStats(): Record<string, number> {
    return Object.fromEntries(this.listenerCounts);
  }

  /** Remove all listeners — used during shutdown. */
  removeAll(): void {
    this.emitter.removeAllListeners();
    this.listenerCounts.clear();
  }
}

// ── Singleton ───────────────────────────────────────────────────────────────────

let bus: AgentEventBus | null = null;

export function getAgentEventBus(): AgentEventBus {
  if (!bus) {
    bus = new AgentEventBus();
  }
  return bus;
}

// ── Wire event reactions ────────────────────────────────────────────────────────

/**
 * Register all event→agent reactions.
 * Called once during server startup, after workers are running.
 */
export function registerAgentReactions(log: { info: (msg: string) => void; error: (obj: unknown, msg: string) => void }): void {
  const eventBus = getAgentEventBus();

  // ── Hot Lead → Instant scoring + email trigger ──────────────────────────
  eventBus.on('hot-lead', async (data) => {
    try {
      log.info(`[events] 🔥 Hot lead detected: session=${data.sessionId} score=${data.score} trigger=${data.trigger}`);

      const { getLeadScoringQueue, getEmailTriggerQueue } = await import('../jobs/queue.js');

      // Immediate lead scoring
      const scoringQueue = getLeadScoringQueue();
      await scoringQueue.add(
        'hot-lead-score',
        {
          sessionId: data.sessionId,
          userId: data.userId,
          anonymousId: data.anonymousId,
          trigger: 'ad_click' as const, // maps to high-priority scoring path
        },
        { priority: 1, removeOnComplete: { count: 100 } },
      );

      // Immediate email trigger evaluation
      const emailQueue = getEmailTriggerQueue();
      await emailQueue.add(
        'hot-lead-email',
        {
          sessionId: data.sessionId,
          userId: data.userId,
          anonymousId: data.anonymousId,
          trigger: 'lead_score_threshold' as const,
          score: data.score,
          segment: data.segment,
        },
        { priority: 1, removeOnComplete: { count: 100 } },
      );
    } catch (err) {
      log.error({ err }, '[events] Failed to process hot-lead event');
    }
  });

  // ── Scraper Complete → Cache refresh + notifications ────────────────────
  eventBus.on('scraper-complete', async (data) => {
    try {
      log.info(`[events] 🕷 Scraper complete: source=${data.source} total=${data.totalProperties} new=${data.newProperties}`);

      const { getScraperEventQueue, getNotificationPushQueue } = await import('../jobs/queue.js');

      // Notify scraper event handler to update caches
      const scraperQueue = getScraperEventQueue();
      await scraperQueue.add(
        'scrape-done',
        {
          eventType: 'property_scrape_complete',
          runId: data.runId,
          totalProperties: data.totalProperties,
          significantChanges: data.newProperties + data.updatedProperties,
          triggeredBy: `scraper-${data.source}`,
        },
        { removeOnComplete: { count: 24 } },
      );

      // Push notifications if significant new data
      if (data.newProperties > 0 || data.updatedProperties > 5) {
        const notifQueue = getNotificationPushQueue();
        await notifQueue.add(
          'scrape-updates',
          { triggeredBy: `scraper-${data.source}` },
          { removeOnComplete: { count: 24 } },
        );
      }
    } catch (err) {
      log.error({ err }, '[events] Failed to process scraper-complete event');
    }
  });

  // ── Market Shift → Revaluation + market pulse ───────────────────────────
  eventBus.on('market-shift', async (data) => {
    try {
      log.info(`[events] 📊 Market shift: type=${data.shiftType} area=${data.area} magnitude=${data.magnitude}%`);

      const { getMarketPulseQueue, getFeedbackLoopQueue } = await import('../jobs/queue.js');

      // Trigger immediate market pulse
      const marketQueue = getMarketPulseQueue();
      await marketQueue.add(
        'market-shift-pulse',
        {
          forceRun: true,
          triggeredBy: `market-shift-${data.shiftType}`,
        },
        { priority: 1, removeOnComplete: { count: 24 } },
      );

      // Recalibrate lead scoring weights if significant shift
      if (Math.abs(data.magnitude) >= 5) {
        const feedbackQueue = getFeedbackLoopQueue();
        await feedbackQueue.add(
          'market-recalibrate',
          { loopType: 'lead_scoring_recalibrate' },
          { removeOnComplete: { count: 12 } },
        );
      }
    } catch (err) {
      log.error({ err }, '[events] Failed to process market-shift event');
    }
  });

  // ── Agent Error → Logging + circuit-breaker awareness ───────────────────
  eventBus.on('agent-error', (data) => {
    log.error(
      { agentName: data.agentName, recoverable: data.recoverable },
      `[events] ⚠ Agent error: ${data.agentName} — ${data.error}`,
    );
  });

  // ── Content Quality → Auto-revision or approval routing ────────────────
  eventBus.on('content-quality', async (data) => {
    try {
      if (data.action === 'revise') {
        log.info(`[events] ✏️ Content revision needed: ${data.seoContentId} score=${data.qualityScore}`);

        const { getContentQualityGateQueue } = await import('../jobs/queue.js');
        const qualityQueue = getContentQualityGateQueue();
        await qualityQueue.add(
          'auto-revise',
          {
            seoContentId: data.seoContentId,
            contentType: data.contentType,
            maxRounds: 2,
          },
          { removeOnComplete: { count: 50 } },
        );
      }
    } catch (err) {
      log.error({ err }, '[events] Failed to process content-quality event');
    }
  });

  // ── Wildcard — log all events for audit trail ──────────────────────────
  eventBus.onAny((envelope) => {
    log.info(`[events] Event: ${envelope.event}`);
  });

  log.info('[events] ✅ Agent event reactions registered (hot-lead, scraper-complete, market-shift, agent-error, content-quality)');
}
