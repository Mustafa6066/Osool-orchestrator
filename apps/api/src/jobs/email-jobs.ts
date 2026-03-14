import { Resend } from 'resend';
import { db } from '@osool/db';
import { chatSessions, emailSequences, emailSends, users, waitlist } from '@osool/db/schema';
import { eq, and } from 'drizzle-orm';
import { env } from '../lib/env.js';

const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

export async function sendNurtureEmail(sessionId: string, score: number): Promise<void> {
  const [session] = await db
    .select()
    .from(chatSessions)
    .where(eq(chatSessions.id, sessionId))
    .limit(1);

  if (!session?.userId) return;

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);

  if (!user?.email) return;

  // Find matching email sequence
  const sequences = await db
    .select()
    .from(emailSequences)
    .where(
      and(
        eq(emailSequences.active, true),
        eq(emailSequences.icpSegment, session.icpSegment ?? 'first_time_buyer'),
      ),
    );

  const sequence = sequences[0];
  if (!sequence) return;

  const steps = sequence.steps as Array<{ delayHours: number; subject: string; templateId: string; channel: string }>;
  if (!steps.length) return;

  const firstStep = steps[0];

  if (!resend) {
    console.log(`[Email] Would send "${firstStep.subject}" to ${user.email} (no RESEND_API_KEY)`);
    return;
  }

  const result = await resend.emails.send({
    from: 'Osool CoInvestor <noreply@osool.co>',
    to: user.email,
    subject: firstStep.subject,
    html: `<h1>${firstStep.subject}</h1><p>Thank you for your interest in Egyptian real estate investment. Your personalized recommendations are ready.</p>`,
  });

  await db.insert(emailSends).values({
    sequenceId: sequence.id,
    userId: user.id,
    email: user.email,
    stepIndex: 0,
    status: 'sent',
    resendMessageId: result.data?.id,
    sentAt: new Date(),
  });

  // If score is high enough, add to waitlist
  if (score >= 80) {
    await db.insert(waitlist).values({
      userId: user.id,
      email: user.email,
      name: user.name,
      source: 'chat_qualification',
      icpSegment: session.icpSegment,
      leadScore: score,
      status: 'active',
    }).onConflictDoNothing();
  }
}
