/**
 * Resend email client — fully implemented using the Resend SDK.
 */

import { Resend } from 'resend';
import { getConfig } from '../../config.js';

let _resend: Resend | null = null;

function getResend(): Resend {
  if (!_resend) {
    const apiKey = getConfig().RESEND_API_KEY;
    if (!apiKey) {
      throw new Error('RESEND_API_KEY is not configured');
    }
    _resend = new Resend(apiKey);
  }
  return _resend;
}

export interface SendEmailParams {
  to: string | string[];
  subject: string;
  htmlBody: string;
  text?: string;
  from?: string;
  replyTo?: string;
  tags?: { name: string; value: string }[];
}

/** Send a transactional email via Resend. Returns the message ID on success. */
export async function sendEmail(params: SendEmailParams): Promise<{ messageId: string }> {
  const cfg = getConfig();

  // Development mode: log instead of send if no API key
  if (!cfg.RESEND_API_KEY) {
    console.info(`[Resend:DEV] Would send email to ${JSON.stringify(params.to)}: "${params.subject}"`);
    return { messageId: `dev-${Date.now()}` };
  }

  const resend = getResend();
  const { data, error } = await resend.emails.send({
    from: params.from ?? cfg.EMAIL_FROM,
    to: Array.isArray(params.to) ? params.to : [params.to],
    subject: params.subject,
    html: params.htmlBody,
    replyTo: params.replyTo,
    tags: params.tags,
  });

  if (error) {
    throw new Error(`Resend API error: ${error.message ?? JSON.stringify(error)}`);
  }

  return { messageId: data?.id ?? 'unknown' };
}

/** Send a batch of emails (up to 100 per call per Resend limits). */
export async function sendBatch(
  emails: SendEmailParams[],
): Promise<{ sent: number; errors: number }> {
  const cfg = getConfig();

  if (!cfg.RESEND_API_KEY) {
    console.info(`[Resend:DEV] Would send ${emails.length} batch emails`);
    return { sent: emails.length, errors: 0 };
  }

  let sent = 0;
  let errors = 0;

  // Send in batches of 50 to stay within limits
  for (let i = 0; i < emails.length; i += 50) {
    const chunk = emails.slice(i, i + 50);
    const promises = chunk.map((e) =>
      sendEmail(e)
        .then(() => { sent++; })
        .catch(() => { errors++; }),
    );
    await Promise.all(promises);
  }

  return { sent, errors };
}
