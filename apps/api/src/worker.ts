import { createSEOWorker, createScoringWorker, createEmailWorker } from './jobs/queues.js';

console.log('Starting Osool workers...');

const seoWorker = createSEOWorker();
const scoringWorker = createScoringWorker();
const emailWorker = createEmailWorker();

seoWorker.on('completed', (job) => {
  console.log(`[SEO] Completed: ${job.id} - ${job.returnvalue?.path ?? 'unknown'}`);
});

seoWorker.on('failed', (job, err) => {
  console.error(`[SEO] Failed: ${job?.id}`, err.message);
});

scoringWorker.on('completed', (job) => {
  console.log(`[Scoring] Session ${job.data.sessionId} → score ${job.returnvalue?.score}`);
});

emailWorker.on('completed', (job) => {
  console.log(`[Email] Sent nurture for session ${job.data.sessionId}`);
});

emailWorker.on('failed', (job, err) => {
  console.error(`[Email] Failed: ${job?.id}`, err.message);
});

process.on('SIGTERM', async () => {
  console.log('Shutting down workers...');
  await Promise.all([seoWorker.close(), scoringWorker.close(), emailWorker.close()]);
  process.exit(0);
});

console.log('✅ Workers running: seo-generation, lead-scoring, email-nurture');
