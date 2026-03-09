import { db } from '@osool/db';
import { intentSignals, chatSessions, funnelEvents } from '@osool/db/schema';
import { calculateLeadScore, type LeadScoringInput } from '@osool/shared';
import { eq, and, gte, count } from 'drizzle-orm';

export interface IntentClassification {
  intentType: string;
  confidence: number;
  entities: Record<string, unknown>;
}

const INTENT_PATTERNS: Array<{
  pattern: RegExp;
  type: string;
  confidence: number;
}> = [
  { pattern: /\b(price|cost|how much|ثمن|سعر|كام)\b/i, type: 'pricing_inquiry', confidence: 85 },
  { pattern: /\b(compare|vs|versus|which is better|مقارنة|أفضل)\b/i, type: 'comparison', confidence: 80 },
  { pattern: /\b(roi|return|investment|yield|عائد|استثمار)\b/i, type: 'investment_analysis', confidence: 80 },
  { pattern: /\b(buy|purchase|interested|want|شراء|عايز|محتاج)\b/i, type: 'purchase_intent', confidence: 75 },
  { pattern: /\b(area|location|where|zone|منطقة|فين|مكان)\b/i, type: 'location_search', confidence: 70 },
  { pattern: /\b(installment|payment plan|down payment|قسط|مقدم|تسهيلات)\b/i, type: 'financing', confidence: 75 },
  { pattern: /\b(delivery|when|timeline|تسليم|امتى|موعد)\b/i, type: 'timeline_inquiry', confidence: 70 },
  { pattern: /\b(bedroom|size|area|sqm|meter|غرف|مساحة|متر)\b/i, type: 'specification_search', confidence: 65 },
];

export function classifyIntent(message: string): IntentClassification {
  for (const { pattern, type, confidence } of INTENT_PATTERNS) {
    if (pattern.test(message)) {
      return { intentType: type, confidence, entities: {} };
    }
  }
  return { intentType: 'general_inquiry', confidence: 50, entities: {} };
}

export async function recordIntent(
  visitorId: string,
  message: string,
  userId?: string,
): Promise<IntentClassification> {
  const classification = classifyIntent(message);

  await db.insert(intentSignals).values({
    visitorId,
    userId,
    intentType: classification.intentType,
    confidence: classification.confidence,
    entities: classification.entities,
    rawQuery: message,
    source: 'chat',
  });

  return classification;
}

export async function computeLeadScoreForSession(sessionId: string): Promise<number> {
  const [session] = await db
    .select()
    .from(chatSessions)
    .where(eq(chatSessions.id, sessionId))
    .limit(1);

  if (!session) return 0;

  const intents = await db
    .select()
    .from(intentSignals)
    .where(eq(intentSignals.visitorId, session.visitorId ?? ''));

  const hasBudgetIntent = intents.some((i) => i.intentType === 'pricing_inquiry' || i.intentType === 'financing');
  const hasAreaIntent = intents.some((i) => i.intentType === 'location_search');
  const comparisonCount = intents.filter((i) => i.intentType === 'comparison').length;

  const events = await db
    .select()
    .from(funnelEvents)
    .where(eq(funnelEvents.visitorId, session.visitorId ?? ''));

  const pagesVisited = events.filter((e) => e.event === 'page_view').length;
  const emailCaptured = events.some((e) => e.event === 'email_captured');

  const input: LeadScoringInput = {
    chatMessageCount: session.messageCount ?? 0,
    budgetDisclosed: hasBudgetIntent,
    areaPreferenceSet: hasAreaIntent,
    developersComparedCount: comparisonCount,
    pagesVisited,
    emailCaptured,
    lastActiveAt: session.lastMessageAt ?? new Date(),
  };

  const score = calculateLeadScore(input);

  // Update session with score
  await db
    .update(chatSessions)
    .set({ leadScore: score.total })
    .where(eq(chatSessions.id, sessionId));

  return score.total;
}
