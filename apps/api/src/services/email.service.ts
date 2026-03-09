/**
 * Email Service — sequence and send record helpers
 */
import { db } from '@osool/db';
import { emailSequences, emailSends } from '@osool/db/schema';
import { eq, desc, sql, and, isNull } from 'drizzle-orm';

export async function getActiveSequences() {
  return db.select().from(emailSequences).where(eq(emailSequences.active, true));
}

export async function getSequenceByTier(tier: string) {
  return db
    .select()
    .from(emailSequences)
    .where(and(eq((emailSequences as any).tier, tier), eq(emailSequences.active, true)));
}

export async function hasAlreadyReceivedEmail(sessionId: string, sequenceId: string): Promise<boolean> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(emailSends)
    .where(and(eq((emailSends as any).sessionId, sessionId), eq(emailSends.sequenceId, sequenceId)));
  return (row?.count ?? 0) > 0;
}

export async function getEmailSendHistory(sessionId: string) {
  return db
    .select()
    .from(emailSends)
    .where(eq((emailSends as any).sessionId, sessionId))
    .orderBy(desc(emailSends.createdAt));
}

export async function countEmailsSent(since?: Date): Promise<number> {
  const where = since
    ? sql`${(emailSends as any).sentAt} >= ${since}`
    : undefined;
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(emailSends)
    .where(where);
  return row?.count ?? 0;
}

export async function getEmailsBySequence(sequenceId: string, page = 1, limit = 25) {
  const offset = (page - 1) * limit;
  const [rows, countRow] = await Promise.all([
    db
      .select()
      .from(emailSends)
      .where(eq(emailSends.sequenceId, sequenceId))
      .orderBy(desc(emailSends.createdAt))
      .offset(offset)
      .limit(limit),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(emailSends)
      .where(eq(emailSends.sequenceId, sequenceId)),
  ]);
  return { emails: rows, total: countRow[0]?.count ?? 0 };
}
