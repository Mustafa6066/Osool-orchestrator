/**
 * send-email.job.ts
 *
 * Sends a single email via Resend and records the send in the DB.
 */

import { db } from '@osool/db';
import { emailSends } from '@osool/db/schema';
import { eq } from 'drizzle-orm';
import { sendEmail as resendSend } from '../../lib/integrations/resend.client.js';
import { getConfig } from '../../config.js';
import type { EmailSendJobData } from '../queue.js';

export async function sendEmail(data: EmailSendJobData): Promise<{ messageId: string }> {
  const cfg = getConfig();

  // Insert a pending record first
  const [record] = await db
    .insert(emailSends)
    .values({
      email: data.to,
      subject: data.subject,
      sequenceId: data.sequenceId ?? null,
      stepNumber: data.stepNumber ?? null,
      stepIndex: data.stepNumber ? data.stepNumber - 1 : 0,
      userId: data.userId ?? null,
      status: 'pending',
    })
    .returning({ id: emailSends.id });

  try {
    const result = await resendSend({
      from: cfg.EMAIL_FROM,
      to: data.to,
      subject: data.subject ?? '',
      htmlBody: data.html ?? '',
      text: data.text,
    });

    // Update to sent
    await db
      .update(emailSends)
      .set({ status: 'sent', externalId: result.messageId, resendMessageId: result.messageId, sentAt: new Date() })
      .where(eq(emailSends.id, record.id));

    return { messageId: result.messageId };
  } catch (err) {
    await db
      .update(emailSends)
      .set({ status: 'failed', error: (err as Error).message })
      .where(eq(emailSends.id, record.id));
    throw err;
  }
}
