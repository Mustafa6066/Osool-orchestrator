/**
 * check-email-triggers.job.ts
 *
 * Evaluates whether a lead should enter an email sequence
 * based on their trigger event, score, and segment.
 *
 * Email sequences:
 *   score 30-59 + any segment → nurture (5-step, 7-day cadence)
 *   score 60-84              → warm (3-step, 2-day cadence)
 *   score 85+               → hot (immediate + same-day follow-up)
 *   signup / waitlist_join  → welcome (immediate)
 */

import { db } from '@osool/db';
import { emailSequences, emailSends, intentSignals, users } from '@osool/db/schema';
import { eq, and, desc, count } from 'drizzle-orm';
import { getRedis } from '../../lib/redis.js';
import { getEmailSendQueue, type EmailTriggerJobData } from '../queue.js';
import { generateEmail } from '../../lib/claude.js';
import { getConfig } from '../../config.js';

const DEBOUNCE_TTL = 60 * 60 * 24; // 24h: don't re-trigger same sequence within 24h

export async function checkEmailTriggers(data: EmailTriggerJobData): Promise<{ triggered: boolean; sequence?: string }> {
  const redis = getRedis();
  const cfg = getConfig();

  // No email configured → skip
  if (!cfg.RESEND_API_KEY) return { triggered: false };

  // Resolve email address
  let email = data.email;
  let name = data.name ?? 'there';

  if (!email && data.userId) {
    const [user] = await db.select().from(users).where(eq(users.id, data.userId));
    email = user?.email ?? undefined;
    name = user?.name ?? name;
  }

  if (!email) return { triggered: false };

  // Determine sequence tier
  let sequenceTier: string;
  const score = data.score ?? 0;

  if (data.trigger === 'signup' || data.trigger === 'waitlist_join') {
    sequenceTier = 'welcome';
  } else if (score >= 85) {
    sequenceTier = 'hot';
  } else if (score >= 60) {
    sequenceTier = 'warm';
  } else if (score >= 30) {
    sequenceTier = 'nurture';
  } else {
    return { triggered: false };
  }

  // Redis debounce: avoid re-sending same sequence to same lead within 24h
  const debounceKey = `email:triggered:${email}:${sequenceTier}`;
  const alreadyTriggered = await redis.get(debounceKey);
  if (alreadyTriggered) return { triggered: false };

  // Find the sequence in DB
  const [sequence] = await db
    .select()
    .from(emailSequences)
    .where(eq(emailSequences.tier, sequenceTier))
    .limit(1);

  if (!sequence) return { triggered: false };

  // Get most recent intent signals for personalisation
  const signals = await db
    .select()
    .from(intentSignals)
    .where(data.sessionId ? eq(intentSignals.sessionId, data.sessionId) : eq(intentSignals.anonymousId, data.anonymousId ?? ''))
    .orderBy(desc(intentSignals.createdAt))
    .limit(5);

  const topEntities = signals.flatMap((s) => {
    const e = s.entities as Record<string, unknown>;
    return [...((e.developers as string[]) ?? []), ...((e.locations as string[]) ?? [])];
  });

  // Determine email template type from sequence tier
  const templateType =
    sequenceTier === 'hot' ? 'premium_invite' as const :
    sequenceTier === 'warm' ? 'roi_report' as const :
    'thought_leadership' as const;

  // Generate personalised first email via Claude
  const emailContent = await generateEmail(
    {
      name,
      segment: (data.segment ?? signals[0]?.segment) as string,
      preferredAreas: [...new Set(topEntities.filter((e) => !e.includes('_')))].slice(0, 3),
      preferredDevelopers: [...new Set(topEntities.filter((e) => e.includes('_')))].slice(0, 3),
      leadScore: score,
    },
    templateType,
  );

  // Build subject + html from result
  const subject = emailContent.subject;
  const html = emailContent.htmlBody;

  // Enqueue the send
  const sendQ = getEmailSendQueue();
  await sendQ.add('send-sequence-email', {
    to: email,
    toName: name,
    subject,
    html,
    sequenceId: sequence.id,
    stepNumber: 1,
    userId: data.userId,
    anonymousId: data.anonymousId,
  });

  // Set debounce key
  await redis.set(debounceKey, '1', 'EX', DEBOUNCE_TTL);

  return { triggered: true, sequence: sequenceTier };
}
