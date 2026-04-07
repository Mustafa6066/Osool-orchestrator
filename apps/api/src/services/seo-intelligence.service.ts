/**
 * SEO Intelligence Service — weekly keyword research, content fingerprinting,
 * competitor gap analysis, and content decay detection.
 *
 * Adapted from Content Attack Brief (ai-marketing-skills) for Egyptian real estate.
 */

import Anthropic from '@anthropic-ai/sdk';
import { db } from '@osool/db';
import { seoContent, keywords } from '@osool/db/schema';
import { eq, gte, desc, sql, count } from 'drizzle-orm';
import { getConfig } from '../config.js';
import { getRedis } from '../lib/redis.js';

// ── Egyptian RE Topic Keywords ────────────────────────────────────────────────

const TOPIC_KEYWORDS = [
  'new capital', 'new cairo', 'sheikh zayed', '6th october', 'north coast',
  'ras el hikma', 'ain sokhna', 'mostakbal city', 'madinaty',
  'compound', 'villa', 'apartment', 'duplex', 'penthouse',
  'installment', 'down payment', 'delivery', 'roi', 'investment',
  'emaar', 'sodic', 'palm hills', 'mountain view', 'tmg', 'ora',
  'hassan allam', 'city edge', 'hyde park', 'tatweer misr', 'la vista',
  'prices', 'payment plan', 'resale', 'comparison', 'guide',
];

// ── Types ─────────────────────────────────────────────────────────────────────

export interface KeywordOpportunity {
  keyword: string;
  funnelStage: 'TOFU' | 'MOFU' | 'BOFU';
  impactScore: number;
  difficulty: number;
  searchVolume: number;
  executionPath: 'AUTO' | 'SEMI' | 'TEAM';
  rationale: string;
}

export interface ContentDecayAlert {
  slug: string;
  pageType: string;
  daysSinceUpdate: number;
  reason: string;
}

export interface CompetitorGap {
  topic: string;
  coverage: 'missing' | 'weak';
  opportunity: string;
}

export interface SEOIntelligenceReport {
  generatedAt: string;
  keywordOpportunities: KeywordOpportunity[];
  decayAlerts: ContentDecayAlert[];
  competitorGaps: CompetitorGap[];
  topicFingerprint: Record<string, number>;
}

// ── Client ────────────────────────────────────────────────────────────────────

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_client) {
    _client = new Anthropic({ apiKey: getConfig().ANTHROPIC_API_KEY });
  }
  return _client;
}

// ── Content Fingerprinting ────────────────────────────────────────────────────

/**
 * Analyze published content for topic frequency patterns.
 * Returns a map of topic → count showing content coverage.
 */
export async function contentFingerprint(): Promise<Record<string, number>> {
  const published = await db
    .select({ body: seoContent.body, title: seoContent.title })
    .from(seoContent)
    .where(eq(seoContent.status, 'published'));

  const counts: Record<string, number> = {};
  for (const topic of TOPIC_KEYWORDS) {
    counts[topic] = 0;
  }

  for (const content of published) {
    const text = `${content.title} ${content.body}`.toLowerCase();
    for (const topic of TOPIC_KEYWORDS) {
      const regex = new RegExp(topic.replace(/\s+/g, '\\s+'), 'gi');
      const matches = text.match(regex);
      if (matches) counts[topic] += matches.length;
    }
  }

  return counts;
}

// ── Funnel Stage Classification ───────────────────────────────────────────────

export function classifyFunnelStage(keyword: string): 'TOFU' | 'MOFU' | 'BOFU' {
  const kw = keyword.toLowerCase();

  // BOFU — high buying intent
  const bofuPatterns = ['buy', 'price', 'invest', 'down payment', 'installment', 'reserve', 'book', 'payment plan'];
  if (bofuPatterns.some((p) => kw.includes(p))) return 'BOFU';

  // MOFU — comparison and research
  const mofuPatterns = ['compare', 'vs', 'roi', 'guide', 'review', 'best', 'top', 'which'];
  if (mofuPatterns.some((p) => kw.includes(p))) return 'MOFU';

  // TOFU — awareness
  return 'TOFU';
}

// ── Execution Path ────────────────────────────────────────────────────────────

export function executionPath(difficulty: number): 'AUTO' | 'SEMI' | 'TEAM' {
  if (difficulty <= 30) return 'AUTO';
  if (difficulty <= 60) return 'SEMI';
  return 'TEAM';
}

// ── Content Decay Detection ───────────────────────────────────────────────────

export async function findDecayingContent(daysThreshold = 90): Promise<ContentDecayAlert[]> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - daysThreshold);

  const stale = await db
    .select({
      slug: seoContent.slug,
      pageType: seoContent.pageType,
      updatedAt: seoContent.updatedAt,
    })
    .from(seoContent)
    .where(eq(seoContent.status, 'published'));

  const alerts: ContentDecayAlert[] = [];
  const now = Date.now();

  for (const page of stale) {
    const daysSince = Math.floor((now - new Date(page.updatedAt).getTime()) / (1000 * 60 * 60 * 24));
    if (daysSince >= daysThreshold) {
      alerts.push({
        slug: page.slug,
        pageType: page.pageType,
        daysSinceUpdate: daysSince,
        reason: `Content not updated in ${daysSince} days — market data may be stale`,
      });
    }
  }

  return alerts.sort((a, b) => b.daysSinceUpdate - a.daysSinceUpdate);
}

// ── Competitor Gap Analysis (AI-powered) ──────────────────────────────────────

export async function findCompetitorGaps(
  topicFingerprint: Record<string, number>,
): Promise<CompetitorGap[]> {
  // Identify topics with zero or minimal coverage
  const weakTopics = Object.entries(topicFingerprint)
    .filter(([, count]) => count < 3)
    .map(([topic, count]) => ({ topic, count }))
    .sort((a, b) => a.count - b.count);

  if (weakTopics.length === 0) return [];

  const prompt = `You are an Egyptian real estate SEO strategist for Osool.

The following topics have LOW coverage in our published content:
${weakTopics.map((t) => `- "${t.topic}" (mentioned only ${t.count} times)`).join('\n')}

For each weak topic, suggest a content opportunity that would help an Egyptian real estate platform rank higher.
Consider: compound reviews, area guides, price comparisons, investment analyses, buyer guides.

Respond in JSON format:
[
  { "topic": "...", "coverage": "missing" or "weak", "opportunity": "Create a comprehensive guide about..." }
]`;

  const response = await getClient().messages.create({
    model: getConfig().ANTHROPIC_MODEL,
    max_tokens: 2000,
    messages: [{ role: 'user', content: prompt }],
  });

  const textBlock = response.content.find((b) => b.type === 'text');
  const text = textBlock?.type === 'text' ? textBlock.text : '[]';

  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return [];

  return JSON.parse(jsonMatch[0]) as CompetitorGap[];
}

// ── Keyword Opportunity Scoring ───────────────────────────────────────────────

export async function scoreKeywordOpportunities(): Promise<KeywordOpportunity[]> {
  // Fetch existing keywords from DB
  const existingKeywords = await db
    .select()
    .from(keywords)
    .orderBy(desc(keywords.searchVolume))
    .limit(100);

  if (existingKeywords.length === 0) return [];

  const prompt = `You are an Egyptian real estate SEO strategist. Given these keywords from our database, score each for content opportunity.

Keywords:
${existingKeywords
    .slice(0, 50)
    .map((k) => `- "${k.keyword}" (vol: ${k.searchVolume}, diff: ${k.difficulty}, intent: ${k.intent ?? 'unknown'})`)
    .join('\n')}

For each keyword, provide an impact score (0-100) based on:
- Search volume potential for Egyptian market
- Competition difficulty
- Revenue potential (BOFU > MOFU > TOFU)
- Content gap (do we have content for this?)

Respond in JSON format (top 20 only):
[
  { "keyword": "...", "impactScore": 85, "rationale": "High intent keyword with low competition..." }
]`;

  const response = await getClient().messages.create({
    model: getConfig().ANTHROPIC_MODEL,
    max_tokens: 2000,
    messages: [{ role: 'user', content: prompt }],
  });

  const textBlock = response.content.find((b) => b.type === 'text');
  const text = textBlock?.type === 'text' ? textBlock.text : '[]';

  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return [];

  const scored = JSON.parse(jsonMatch[0]) as { keyword: string; impactScore: number; rationale: string }[];

  return scored.map((s) => {
    const dbKw = existingKeywords.find((k) => k.keyword === s.keyword);
    return {
      keyword: s.keyword,
      funnelStage: classifyFunnelStage(s.keyword),
      impactScore: s.impactScore,
      difficulty: dbKw?.difficulty ?? 50,
      searchVolume: dbKw?.searchVolume ?? 0,
      executionPath: executionPath(dbKw?.difficulty ?? 50),
      rationale: s.rationale,
    };
  });
}

// ── Full Intelligence Run ─────────────────────────────────────────────────────

export async function generateIntelligenceReport(): Promise<SEOIntelligenceReport> {
  const [fingerprint, decay, opportunities] = await Promise.all([
    contentFingerprint(),
    findDecayingContent(),
    scoreKeywordOpportunities(),
  ]);

  const gaps = await findCompetitorGaps(fingerprint);

  return {
    generatedAt: new Date().toISOString(),
    keywordOpportunities: opportunities,
    decayAlerts: decay,
    competitorGaps: gaps,
    topicFingerprint: fingerprint,
  };
}
