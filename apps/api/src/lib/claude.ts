/**
 * Claude API wrapper for the Orchestrator.
 * Centralizes all Anthropic SDK calls with:
 *  - Egyptian RE market system context
 *  - Retry logic (3 attempts with exponential backoff)
 *  - Token usage logging
 *  - Redis caching where appropriate
 */

import Anthropic from '@anthropic-ai/sdk';
import type { Developer, Project, LocationROI } from '@osool/shared';
import type { ICPSegment } from '@osool/shared';
import type { ParsedIntent } from '@osool/shared';
import { intentCacheKey } from '@osool/shared';
import { parseIntentFast } from '@osool/shared';
import { getConfig } from '../config.js';
import { getRedis } from './redis.js';

const EGYPTIAN_RE_SYSTEM = `You are an expert AI analyst specializing in the Egyptian real estate market. You have deep knowledge of:

DEVELOPERS: Emaar Misr, SODIC, Orascom Development, Palm Hills, Mountain View, Talaat Moustafa Group (TMG), Hassan Allam Properties, Madinet Masr, City Edge, Ora Developers, La Vista, Hyde Park, MNHD, Tatweer Misr.

LOCATIONS: New Cairo, Sheikh Zayed, 6th of October, New Administrative Capital (R5/R7/R8/MU districts), New Alamein, North Coast (Ras El Hikma, Sidi Abdel Rahman), Madinaty, Shorouk, Ain Sokhna, Mostakbal City, Katameya.

MARKET DYNAMICS:
- Price tracking in EGP (Egyptian Pound) primarily, USD for expat investors
- Average prices range from 25,000 EGP/sqm (6th October) to 95,000 EGP/sqm (premium North Coast)
- Payment plans: typically 5-14 years, 5-20% down payment
- Delivery timelines: 3-7 years for off-plan projects
- Key buyer segments: Expat Investors, Domestic HNW, First-Time Buyers, Institutional investors
- High-volume comparison queries: Emaar vs SODIC, Palm Hills vs Mountain View, New Capital vs North Coast
- ROI drivers: location premium, developer reputation, payment plan flexibility, resale market liquidity
- Recent market movers: Ras El Hikma ($35B UAE investment), New Capital government hub completion

Always respond in the format requested. Be specific with numbers, developer names, and location names. For Arabic content, use Modern Standard Arabic appropriate for a professional real estate audience.`;

let _client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!_client) {
    _client = new Anthropic({ apiKey: getConfig().ANTHROPIC_API_KEY });
  }
  return _client;
}

async function callClaude(
  messages: Anthropic.MessageParam[],
  systemExtra?: string,
  maxTokens = 2000,
): Promise<{ content: string; inputTokens: number; outputTokens: number }> {
  const system = systemExtra ? `${EGYPTIAN_RE_SYSTEM}\n\n${systemExtra}` : EGYPTIAN_RE_SYSTEM;
  let lastError: unknown;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await getClient().messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: maxTokens,
        system,
        messages,
      });

      const textBlock = response.content.find((b) => b.type === 'text');
      const content = textBlock?.type === 'text' ? textBlock.text : '';

      return {
        content,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      };
    } catch (err) {
      lastError = err;
      if (attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 1000 * Math.pow(2, attempt)));
      }
    }
  }

  throw lastError;
}

// ── Intent Parsing ────────────────────────────────────────────────────────────

export interface IntentParseResult {
  intentType: string;
  entities: Record<string, unknown>;
  confidence: number;
  segment: ICPSegment;
}

/**
 * Parse a raw chat message into a structured intent signal.
 * Uses fast regex first, falls back to Claude when confidence is low.
 * Results are cached in Redis for 24h.
 */
export async function parseIntent(
  message: string,
  pageContext?: { pageType?: string; url?: string },
): Promise<IntentParseResult> {
  const redis = getRedis();
  const cacheKey = intentCacheKey(message);

  // Try cache first
  const cached = await redis.get(cacheKey);
  if (cached) {
    return JSON.parse(cached) as IntentParseResult;
  }

  // Fast regex parse
  const fast = parseIntentFast(message, pageContext);

  if (!fast.requiresLLM) {
    const result: IntentParseResult = {
      intentType: fast.intentType,
      entities: fast.entities as Record<string, unknown>,
      confidence: fast.confidence,
      segment: fast.segment,
    };
    await redis.set(cacheKey, JSON.stringify(result), 'EX', 86400);
    return result;
  }

  // Low confidence → use Claude
  const prompt = `Analyze this Egyptian real estate inquiry and extract structured intent.

Message: "${message}"
${pageContext ? `Page context: ${pageContext.pageType} at ${pageContext.url}` : ''}

Respond with ONLY a JSON object (no markdown):
{
  "intentType": "comparison|roi_inquiry|price_check|developer_review|area_research|payment_plan|general",
  "entities": {
    "developers": ["list of developer ids from: emaar, sodic, orascom, palm_hills, mountain_view, tmg, hassan_allam, madinet_masr, city_edge, ora, la_vista, hyde_park, mnhd, tatweer_misr"],
    "locations": ["list of location slugs"],
    "projects": ["list of project names mentioned"],
    "priceRange": null or {"min": number, "max": number, "currency": "EGP|USD"}
  },
  "confidence": 0.0-1.0,
  "segment": "expat_investor|domestic_hnw|first_time_buyer|institutional"
}`;

  try {
    const { content } = await callClaude([{ role: 'user', content: prompt }]);
    const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const result = JSON.parse(cleaned) as IntentParseResult;
    await redis.set(cacheKey, JSON.stringify(result), 'EX', 86400);
    return result;
  } catch {
    // Claude failed, return the fast parse result
    const result: IntentParseResult = {
      intentType: fast.intentType,
      entities: fast.entities as Record<string, unknown>,
      confidence: fast.confidence,
      segment: fast.segment,
    };
    return result;
  }
}

// ── Content Generation ────────────────────────────────────────────────────────

export interface GeneratedContent {
  en: string;
  ar: string;
  seoTitle: string;
  seoDescription: string;
}

/** Generate developer comparison page content (EN + AR). */
export async function generateComparison(
  devA: Pick<Developer, 'name' | 'nameAr' | 'tier' | 'avgDeliveryRatePercent' | 'avgPricePerSqm' | 'regions'>,
  devB: Pick<Developer, 'name' | 'nameAr' | 'tier' | 'avgDeliveryRatePercent' | 'avgPricePerSqm' | 'regions'>,
  comparisonData: Record<string, unknown>,
): Promise<GeneratedContent> {
  const prompt = `Generate comprehensive comparison content for two Egyptian real estate developers.

Developer A: ${devA.name} (${devA.nameAr})
- Delivery rate: ${devA.avgDeliveryRatePercent}%
- Avg price/sqm: ${devA.avgPricePerSqm.toLocaleString()} EGP
- Regions: ${devA.regions.join(', ')}
- Tier: ${devA.tier}

Developer B: ${devB.name} (${devB.nameAr})
- Delivery rate: ${devB.avgDeliveryRatePercent}%
- Avg price/sqm: ${devB.avgPricePerSqm.toLocaleString()} EGP
- Regions: ${devB.regions.join(', ')}
- Tier: ${devB.tier}

Additional data: ${JSON.stringify(comparisonData)}

Respond with ONLY a JSON object (no markdown):
{
  "en": "400-600 word comparison analysis in English, covering delivery track record, pricing, locations, payment plans, and investment verdict",
  "ar": "مقارنة شاملة بالعربية بنفس المحتوى، 400-600 كلمة",
  "seoTitle": "SEO-optimized title (55-60 chars) e.g. '[DevA] vs [DevB]: Egypt Real Estate Comparison 2025'",
  "seoDescription": "Meta description (150-160 chars) summarizing key comparison points"
}`;

  const { content } = await callClaude([{ role: 'user', content: prompt }], undefined, 3000);
  const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  try {
    return JSON.parse(cleaned) as GeneratedContent;
  } catch {
    const fallback = `${devA.name} vs ${devB.name}: comparison content could not be generated. Please retry.`;
    return { en: fallback, ar: fallback, seoTitle: `${devA.name} vs ${devB.name}`, seoDescription: fallback.slice(0, 155) };
  }
}

/** Generate ROI analysis content for a location. */
export async function generateROIAnalysis(
  location: string,
  locationAr: string,
  data: {
    avgPricePerSqm: number;
    priceChange1y: number;
    priceChange3y: number;
    priceChange5y: number;
    rentalYield: number;
    liquidityScore: number;
  },
): Promise<GeneratedContent> {
  const prompt = `Generate ROI analysis content for an Egyptian real estate location.

Location: ${location} (${locationAr})
- Current avg price/sqm: ${data.avgPricePerSqm.toLocaleString()} EGP
- Price appreciation 1yr: +${data.priceChange1y}%
- Price appreciation 3yr: +${data.priceChange3y}%
- Price appreciation 5yr: +${data.priceChange5y}%
- Rental yield: ${data.rentalYield}%
- Liquidity score: ${data.liquidityScore}/100

Respond with ONLY a JSON object (no markdown):
{
  "en": "500-700 word ROI analysis in English covering: current market position, historical price trends, rental yield comparison, investment thesis, risks, and 5-year outlook",
  "ar": "تحليل العائد على الاستثمار بالعربية، 500-700 كلمة",
  "seoTitle": "SEO title (55-60 chars) e.g. '[Location] Real Estate ROI: Investment Guide 2025'",
  "seoDescription": "Meta description (150-160 chars) highlighting ROI data points"
}`;

  const { content } = await callClaude([{ role: 'user', content: prompt }], undefined, 3000);
  const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  try {
    return JSON.parse(cleaned) as GeneratedContent;
  } catch {
    const fallback = `ROI analysis for ${location}: content could not be generated. Please retry.`;
    return { en: fallback, ar: fallback, seoTitle: `${location} Real Estate ROI 2025`, seoDescription: fallback.slice(0, 155) };
  }
}

/** Generate project deep-dive content. */
export async function generateProjectContent(project: Partial<Project>): Promise<GeneratedContent> {
  const prompt = `Generate project description content for an Egyptian real estate development.

Project: ${project.name} (${project.nameAr ?? ''})
- Developer: ${project.developerId}
- Location: ${project.location}
- Type: ${project.type?.join(', ') ?? 'mixed'}
- Price range: ${project.minPrice?.toLocaleString()} - ${project.maxPrice?.toLocaleString()} EGP
- Price/sqm: ${project.avgPricePerSqm?.toLocaleString()} EGP
- Delivery: ${project.deliveryStatus}
- Payment plan: ${project.paymentPlanYears ?? 'N/A'} years, ${project.downPaymentPercent ?? 'N/A'}% down
- Amenities: ${project.amenities?.join(', ') ?? 'N/A'}

Respond with ONLY a JSON object (no markdown):
{
  "en": "400-500 word project description in English covering: overview, standout features, unit types, investment potential, payment plan breakdown",
  "ar": "وصف المشروع بالعربية، 400-500 كلمة",
  "seoTitle": "SEO title (55-60 chars)",
  "seoDescription": "Meta description (150-160 chars)"
}`;

  const { content } = await callClaude([{ role: 'user', content: prompt }], undefined, 2500);
  const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  try {
    return JSON.parse(cleaned) as GeneratedContent;
  } catch {
    const name = project.name ?? 'Project';
    const fallback = `${name}: content could not be generated. Please retry.`;
    return { en: fallback, ar: fallback, seoTitle: name, seoDescription: fallback.slice(0, 155) };
  }
}

/** Generate personalized email content for a lead. */
export async function generateEmail(
  lead: {
    name?: string;
    preferredAreas?: string[];
    preferredDevelopers?: string[];
    budgetRange?: { min: number; max: number };
    leadScore: number;
    segment: string;
  },
  templateType: 'roi_report' | 'thought_leadership' | 'premium_invite',
): Promise<{ subject: string; htmlBody: string }> {
  const templates = {
    roi_report: 'Send them a personalized ROI analysis for their area of interest. Include specific numbers, market insights, and a clear CTA to explore further on the platform.',
    thought_leadership: "Share 3 non-obvious insights about Egyptian real estate that most investors miss. Position Osool CoInvestor as the platform that gives them an unfair informational advantage.",
    premium_invite: `Invite them to join the Osool Premium waitlist. They qualify because their lead score is ${lead.leadScore}/100. Make them feel exclusive and urgent.`,
  };

  const prompt = `Write a personalized email for an Egyptian real estate investor.

Lead profile:
- Name: ${lead.name ?? 'Investor'}
- Segment: ${lead.segment}
- Lead score: ${lead.leadScore}/100
- Preferred areas: ${lead.preferredAreas?.join(', ') ?? 'diverse'}
- Preferred developers: ${lead.preferredDevelopers?.join(', ') ?? 'various'}
- Budget: ${lead.budgetRange ? `${lead.budgetRange.min.toLocaleString()} - ${lead.budgetRange.max.toLocaleString()} EGP` : 'not disclosed'}

Email type: ${templateType}
Goal: ${templates[templateType]}

Respond with ONLY a JSON object (no markdown):
{
  "subject": "Email subject line (under 60 chars, compelling and personalized)",
  "htmlBody": "Full HTML email body (use inline styles, professional design, 300-500 words, include specific Egyptian RE data points, clear CTA button)"
}`;

  const { content } = await callClaude([{ role: 'user', content: prompt }], undefined, 2000);
  const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  try {
    return JSON.parse(cleaned) as { subject: string; htmlBody: string };
  } catch {
    return {
      subject: `${templateType === 'premium_invite' ? 'Exclusive Invitation' : 'Market Insights'} — Osool CoInvestor`,
      htmlBody: `<p>Dear ${lead.name ?? 'Investor'},</p><p>We have curated market insights for you. Please visit Osool CoInvestor for more details.</p>`,
    };
  }
}

/** Generate ad copy variants for a topic and audience segment. */
export async function generateAdCopy(
  topic: string,
  segment: ICPSegment,
  channel: 'meta' | 'linkedin' | 'google',
): Promise<{ headline: string; body: string; cta: string }[]> {
  const channelFormats = {
    meta: 'Facebook/Instagram: headline ≤40 chars, body ≤125 chars, CTA ≤20 chars',
    linkedin: 'LinkedIn: headline ≤70 chars, body ≤150 chars, CTA ≤20 chars',
    google: 'Google Search: headline ≤30 chars, body ≤90 chars, CTA ≤15 chars',
  };

  const prompt = `Generate 3 ad copy variants for an Egyptian real estate audience.

Topic: ${topic}
Target segment: ${segment}
Channel: ${channel} — ${channelFormats[channel]}

Create 3 variants with different angles (e.g., FOMO/scarcity, ROI/data-driven, lifestyle/aspiration).

Respond with ONLY a JSON array (no markdown):
[
  {"headline": "...", "body": "...", "cta": "..."},
  {"headline": "...", "body": "...", "cta": "..."},
  {"headline": "...", "body": "...", "cta": "..."}
]`;

  const { content } = await callClaude([{ role: 'user', content: prompt }], undefined, 1000);
  const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  try {
    return JSON.parse(cleaned) as { headline: string; body: string; cta: string }[];
  } catch {
    // Return 3 minimal variants so the caller never crashes
    return [
      { headline: `Invest in Egypt RE`, body: `Osool CoInvestor — data-driven real estate for ${segment}.`, cta: 'Explore Now' },
      { headline: `Smart RE Decisions`, body: `Compare developers, track ROI, invest confidently.`, cta: 'Get Started' },
      { headline: `Egypt Property 2025`, body: `Exclusive insights for serious investors.`, cta: 'Learn More' },
    ];
  }
}
