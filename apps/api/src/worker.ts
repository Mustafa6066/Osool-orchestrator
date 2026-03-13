/**
 * Standalone worker process — used by docker-compose `orchestrator-worker` service.
 * Uses the same worker registry as server.ts (startWorkers / stopWorkers) so all
 * 8 BullMQ queues are served from a single consistent implementation.
 *
 * Previously this file used the legacy queues.ts with different queue names
 * (seo-generation, email-nurture) which conflicted with the main queue system.
 */
import { startWorkers, stopWorkers } from './jobs/workers.js';

console.log('Starting Osool workers...');

await startWorkers();

console.log('✅ Workers running: intent-processing, lead-scoring, audience-sync, seo-content-gen, email-send, email-trigger, feedback-loop, market-pulse');

process.on('SIGTERM', async () => {
  console.log('Shutting down workers...');
  await stopWorkers();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('Interrupt received, shutting down...');
  await stopWorkers();
  process.exit(0);
});
