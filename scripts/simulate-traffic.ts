#!/usr/bin/env tsx
/**
 * Traffic Simulator — simulates 50 concurrent users over 7 days
 * Usage: npx tsx scripts/simulate-traffic.ts [--base-url http://localhost:4000]
 *
 * Sends realistic webhook payloads to the running API to populate the DB
 * with intent signals, funnel events, sessions, and ad clicks.
 */
import { randomUUID } from 'node:crypto';
import { config } from 'dotenv';
config();

// ── Config ────────────────────────────────────────────────────────────────────

const BASE_URL = process.argv.includes('--base-url')
  ? process.argv[process.argv.indexOf('--base-url') + 1]
  : 'http://localhost:4000';

const USERS = 50;
const DAYS = 7;
const SESSIONS_PER_USER = 3;

const DEVELOPERS = ['Palm Hills', 'SODIC', 'Emaar Misr', 'Mountain View', 'Tatweer Misr', 'Ora Developers'];
const LOCATIONS = ['New Cairo', 'New Admin Capital', 'North Coast', 'Sheikh Zayed', '6th October'];

const MESSAGES = [
  'What is the best developer in New Cairo?',
  'Compare Palm Hills vs SODIC',
  'What are the payment plans for Mountain View?',
  'How much does a villa in North Coast cost?',
  'Is the New Admin Capital a good investment?',
  'What is the ROI for Sheikh Zayed properties?',
  'Show me townhouses with installments',
  'Which developer has the best delivery rate?',
  'I want to buy an apartment under 5 million EGP',
  'Tell me about compound master plans near Cairo',
];

const PAGE_TYPES = ['developer_profile', 'location_guide', 'comparison', 'roi_analysis'];

// ── Helpers ───────────────────────────────────────────────────────────────────

function randomChoice<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function post(path: string, body: unknown): Promise<void> {
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      console.warn(`[${res.status}] POST ${path}: ${text.slice(0, 100)}`);
    }
  } catch (err) {
    console.error(`[ERR] POST ${path}:`, (err as Error).message);
  }
}

// ── Simulation ────────────────────────────────────────────────────────────────

interface UserSession {
  userId: string;
  sessionId: string;
  anonymousId: string;
}

async function simulateUser(userId: string, sessionIndex: number): Promise<void> {
  const sessionId = randomUUID();
  const anonymousId = randomUUID();
  const developer = randomChoice(DEVELOPERS);
  const location = randomChoice(LOCATIONS);

  // 1. Page view
  await post('/webhook/page-view', {
    anonymousId,
    sessionId,
    page: `/${randomChoice(PAGE_TYPES)}/${developer.toLowerCase().replace(' ', '-')}`,
    referrer: Math.random() > 0.5 ? 'https://google.com' : '',
    userAgent: 'Mozilla/5.0 (Simulator)',
    properties: { developer, location },
  });

  // 2. Chat messages (2-5 per session)
  const msgCount = randomInt(2, 5);
  for (let m = 0; m < msgCount; m++) {
    await sleep(100);
    await post('/webhook/chat-message', {
      sessionId,
      anonymousId,
      message: randomChoice(MESSAGES).replace('New Cairo', location).replace('Palm Hills', developer),
      pageContext: { page: PAGE_TYPES[m % PAGE_TYPES.length], developer, location },
    });
  }

  // 3. Some users sign up (30%)
  if (Math.random() < 0.3) {
    await sleep(200);
    await post('/webhook/signup', {
      anonymousId,
      sessionId,
      email: `user${userId.slice(0, 6)}@simtest.osool.ai`,
      name: `Test User ${sessionIndex}`,
      source: 'chat_cta',
      segment: randomChoice(['first_time_buyer', 'investor', 'upgrader', 'landlord']),
    });
  }

  // 4. Some users see ads and click (20%)
  if (Math.random() < 0.2) {
    await sleep(150);
    await post('/webhook/ad-click', {
      anonymousId,
      platform: Math.random() > 0.5 ? 'meta' : 'google',
      campaignId: randomUUID(),
      adSetId: randomUUID(),
      adId: randomUUID(),
      pageUrl: `https://osool.ai/${developer.toLowerCase().replace(' ', '-')}`,
      properties: { developer, location },
    });
  }

  // 5. Session end
  await sleep(50);
  await post('/webhook/chat-session-end', {
    sessionId,
    anonymousId,
    messageCount: msgCount,
    durationSeconds: randomInt(60, 600),
    exitPage: `/${randomChoice(PAGE_TYPES)}`,
  });
}

async function main(): Promise<void> {
  console.log(`\n🚀 Osool Traffic Simulator`);
  console.log(`   Target: ${BASE_URL}`);
  console.log(`   Users: ${USERS} × ${SESSIONS_PER_USER} sessions over ${DAYS} days`);
  console.log(`   Total sessions: ${USERS * SESSIONS_PER_USER}\n`);

  // Verify API is reachable
  try {
    const healthRes = await fetch(`${BASE_URL}/health`);
    if (!healthRes.ok) throw new Error('Not OK');
    console.log('✓ API reachable\n');
  } catch {
    console.error(`✗ Cannot reach ${BASE_URL}/health — is the API running?`);
    process.exit(1);
  }

  let completed = 0;
  const total = USERS * SESSIONS_PER_USER;

  for (let d = 0; d < DAYS; d++) {
    const sessionsThisDay = Math.floor(total / DAYS);
    console.log(`Day ${d + 1}/${DAYS} — ${sessionsThisDay} sessions`);

    // Run sessions in batches of 10 to avoid overwhelming the API
    const batchSize = 10;
    for (let i = 0; i < sessionsThisDay; i += batchSize) {
      const batch = Array.from({ length: Math.min(batchSize, sessionsThisDay - i) }, (_, idx) =>
        simulateUser(randomUUID(), i + idx),
      );
      await Promise.all(batch);
      completed += batch.length;
      process.stdout.write(`\r  Progress: ${completed}/${total}`);
      await sleep(500); // Throttle between batches
    }
    console.log('');
    await sleep(1000);
  }

  console.log(`\n✓ Simulation complete — ${total} sessions sent\n`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Simulation failed:', err);
  process.exit(1);
});
