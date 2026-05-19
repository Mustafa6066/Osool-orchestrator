/**
 * reach-enrich.job.ts
 *
 * Enriches a contact profile discovered by reach-scan.
 * Uses the platform-bridge to check if this contact is already known.
 * Upserts into the contacts table with latest enrichment data.
 *
 * IMPORTANT: LinkedIn contacts are tagged source='linkedin-public'
 * for easy purge compliance (GDPR / LinkedIn TOS).
 */

import { db } from '@osool/db';
import { contacts } from '@osool/db/schema';
import { eq } from 'drizzle-orm';
import type { ReachEnrichJobData } from '../queue.js';

export async function runReachEnrich(
  data: ReachEnrichJobData,
): Promise<{ contactId: string; created: boolean }> {
  const { platform, handle, sourceMetadata } = data;

  // Use externalId = platform:handle as a stable identifier
  const externalId = `${platform}:${handle}`;

  const existing = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(eq(contacts.externalId, externalId))
    .limit(1);

  if (existing.length > 0) {
    // Update enrichment data (but preserve existing score)
    await db
      .update(contacts)
      .set({ enrichment: { ...(sourceMetadata ?? {}), lastSeen: new Date().toISOString() } })
      .where(eq(contacts.externalId, externalId));
    return { contactId: existing[0]!.id, created: false };
  }

  // Insert new contact
  const [created] = await db
    .insert(contacts)
    .values({
      externalId,
      platform,
      handle,
      name: handle,
      source: platform === 'linkedin' ? 'linkedin-public' : platform,
      enrichment: { ...(sourceMetadata ?? {}), lastSeen: new Date().toISOString() },
    })
    .returning({ id: contacts.id });

  return { contactId: created!.id, created: true };
}
