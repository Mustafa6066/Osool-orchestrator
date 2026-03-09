/**
 * Lead scoring algorithm for Osool CoInvestor.
 * Produces a score 0-100 used to qualify leads.
 *
 * Scoring dimensions:
 *   Chat engagement (0-20): message count & depth
 *   Budget disclosure (0-15): explicit budget shared
 *   Area preference (0-10): specific location selected
 *   Developer comparison (0-10): compared 2+ developers
 *   Pages visited (0-15): SEO content engagement
 *   Email captured (0-15): provided email address
 *   Recency (0-15): how recently they were active
 *
 * Score >60 → trigger email nurture sequence
 * Score >80 → add to waitlist + priority alert
 */

export interface LeadScoringInput {
  chatMessageCount: number;
  budgetDisclosed: boolean;
  budgetAmount?: number;
  areaPreferenceSet: boolean;
  developersComparedCount: number;
  pagesVisited: number;
  emailCaptured: boolean;
  lastActiveAt: Date;
}

export interface LeadScore {
  total: number;
  breakdown: {
    chatEngagement: number;
    budgetDisclosure: number;
    areaPreference: number;
    developerComparison: number;
    pagesVisited: number;
    emailCaptured: number;
    recency: number;
  };
  qualifiedForEmail: boolean;
  qualifiedForWaitlist: boolean;
}

export function calculateLeadScore(input: LeadScoringInput, now = new Date()): LeadScore {
  const chatEngagement = Math.min(20, input.chatMessageCount * 2);

  let budgetDisclosure = 0;
  if (input.budgetDisclosed) {
    budgetDisclosure = 10;
    if (input.budgetAmount && input.budgetAmount >= 3_000_000) {
      budgetDisclosure = 15;
    }
  }

  const areaPreference = input.areaPreferenceSet ? 10 : 0;

  const developerComparison = Math.min(10, input.developersComparedCount * 5);

  const pagesVisited = Math.min(15, input.pagesVisited * 3);

  const emailCaptured = input.emailCaptured ? 15 : 0;

  const hoursSinceActive = Math.max(0, (now.getTime() - input.lastActiveAt.getTime()) / (1000 * 60 * 60));
  let recency: number;
  if (hoursSinceActive < 1) recency = 15;
  else if (hoursSinceActive < 24) recency = 12;
  else if (hoursSinceActive < 72) recency = 8;
  else if (hoursSinceActive < 168) recency = 4;
  else recency = 0;

  const total = chatEngagement + budgetDisclosure + areaPreference + developerComparison + pagesVisited + emailCaptured + recency;

  return {
    total,
    breakdown: {
      chatEngagement,
      budgetDisclosure,
      areaPreference,
      developerComparison,
      pagesVisited,
      emailCaptured,
      recency,
    },
    qualifiedForEmail: total >= 60,
    qualifiedForWaitlist: total >= 80,
  };
}
