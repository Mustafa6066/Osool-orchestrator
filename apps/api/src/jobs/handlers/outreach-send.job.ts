/**
 * outreach-send.job.ts
 *
 * Sends a single outreach touchpoint to a contact via the specified channel.
 * Records the touchpoint in the outreachTouchpoints table.
 *
 * Currently supports:
 *   - email: via Resend (same as email-send.job.ts)
 *   - linkedin/twitter: records intent only (manual send TBD)
 */

import { db } from '@osool/db';
import { outreachTouchpoints, contacts } from '@osool/db/schema';
import { eq } from 'drizzle-orm';
import { getEmailSendQueue } from '../queue.js';
import type { OutreachSendJobData } from '../queue.js';

export async function runOutreachSend(
  data: OutreachSendJobData,
): Promise<{ sent: boolean; channel: string }> {
  const { campaignId, contactId, channel, messageTemplate } = data;

  // Load contact details
  const [contact] = await db
    .select()
    .from(contacts)
    .where(eq(contacts.id, contactId))
    .limit(1);

  if (!contact) {
    return { sent: false, channel };
  }

  let sent = false;

  if (channel === 'email' && contact.enrichment) {
    const enrichment = contact.enrichment as Record<string, unknown>;
    const email = enrichment.email as string | undefined;
    if (email) {
      await getEmailSendQueue().add('outreach-email', {
        to: email,
        toName: contact.name ?? undefined,
        templateType: 'outreach',
        html: messageTemplate,
      });
      sent = true;
    }
  }
  // For linkedin/twitter: record intent — manual outreach workflow TBD

  // Record touchpoint
  await db.insert(outreachTouchpoints).values({
    campaignId,
    contactId,
    channel,
    sentAt: new Date(),
    response: { status: sent ? 'queued' : 'pending_manual' },
  });

  return { sent, channel };
}
