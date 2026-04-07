/**
 * Agent Scheduler — runs autonomous agents on a fixed cadence.
 *
 * NexusAgent       — every 60 min  (market-pulse job: trend aggregation)
 * MarketingAgent   — every 6 h     (audience sync, SEO content, perf feedback)
 * IntegrationAgent — every 30 min  (lead scoring, email triggers, recalibration)
 *
 * Each agent fires immediately on startup, then on its interval.
 * Errors are caught and logged; the schedule continues regardless.
 */

import { nexusAgent } from './agents/nexus.agent.js';
import { marketingAgent } from './agents/marketing.agent.js';
import { integrationAgent } from './agents/integration.agent.js';
import { experimentAgent } from './agents/experiment.agent.js';
import { registerAgentReactions } from './events/agent-events.js';
import type { FastifyBaseLogger } from 'fastify';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

const timers: NodeJS.Timeout[] = [];

async function runAgent(name: string, fn: () => Promise<void>, log: FastifyBaseLogger) {
  try {
    log.info(`[scheduler] ▶ ${name} starting`);
    await fn();
    log.info(`[scheduler] ✓ ${name} completed`);
  } catch (err) {
    log.error({ err }, `[scheduler] ✗ ${name} failed`);
  }
}

export function startScheduler(log: FastifyBaseLogger): void {
  // ── Register event-driven agent reactions ──────────────────────────────────
  registerAgentReactions(log);

  // ── Nexus — every 60 minutes ──────────────────────────────────────────────
  const runNexus = () => runAgent('nexus', () => nexusAgent.execute(), log);
  void runNexus(); // fire immediately
  timers.push(setInterval(() => void runNexus(), 60 * MINUTE));

  // ── Integration — every 30 minutes ───────────────────────────────────────
  const runIntegration = () => runAgent('integration', () => integrationAgent.execute(), log);
  // Delay 2 min on startup so nexus runs first and populates Redis
  timers.push(setTimeout(() => {
    void runIntegration();
    timers.push(setInterval(() => void runIntegration(), 30 * MINUTE));
  }, 2 * MINUTE));

  // ── Marketing — every 6 hours ─────────────────────────────────────────────
  const runMarketing = () => runAgent('marketing', () => marketingAgent.execute(), log);
  // Delay 5 min on startup
  timers.push(setTimeout(() => {
    void runMarketing();
    timers.push(setInterval(() => void runMarketing(), 6 * HOUR));
  }, 5 * MINUTE));

  // ── Experiment — every 4 hours ──────────────────────────────────────────────
  const runExperiment = () => runAgent('experiment', () => experimentAgent.execute(), log);
  // Delay 7 min on startup
  timers.push(setTimeout(() => {
    void runExperiment();
    timers.push(setInterval(() => void runExperiment(), 4 * HOUR));
  }, 7 * MINUTE));

  log.info('[scheduler] ✅ Hybrid scheduler started (intervals + event reactions)');
}

export function stopScheduler(): void {
  // Stop event bus
  import('./events/agent-events.js').then(({ getAgentEventBus }) => {
    getAgentEventBus().removeAll();
  }).catch(() => {});

  for (const t of timers) clearTimeout(t);
  timers.length = 0;
}
