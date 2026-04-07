/**
 * Expert Panel Service — scores AI-generated content with a multi-expert AI panel.
 *
 * Uses Claude to evaluate content across 7 expert personas tailored to Egyptian real estate.
 * Iterates until score ≥ 90 (max 3 rounds). Prevents low-quality content from publishing.
 */

import Anthropic from '@anthropic-ai/sdk';
import { getConfig } from '../config.js';

// ── Expert Definitions ────────────────────────────────────────────────────────

interface Expert {
  name: string;
  role: string;
  criteria: string;
  weight: number;
}

const EXPERTS: Expert[] = [
  {
    name: 'Market Analyst',
    role: 'Egyptian Real Estate Market Analyst',
    criteria: 'Accuracy of market data (prices, developers, locations, delivery timelines). Specificity of EGP pricing, compound names, and area comparisons. Current and relevant market insights.',
    weight: 1.0,
  },
  {
    name: 'SEO Specialist',
    role: 'Bilingual SEO Content Specialist (English/Arabic)',
    criteria: 'Keyword integration (natural, not stuffed). Meta description quality. Header hierarchy (H1/H2/H3). Internal linking opportunities. Schema markup suggestions. Readability score.',
    weight: 1.0,
  },
  {
    name: 'Investment Advisor',
    role: 'Real Estate Investment Advisor (Egyptian market)',
    criteria: 'ROI calculations accuracy. Cap rate mentions. Payment plan analysis. EGP/USD price comparisons. Resale value projections. Risk assessment.',
    weight: 1.0,
  },
  {
    name: 'Legal Expert',
    role: 'Egyptian Real Estate Legal Expert',
    criteria: 'Compliance with CBE Law 194/2020 (EGP-only payments). Awareness of FRA Decision 125/2025 (fractional ownership). Contract law references (Civil Code 131). Registration and legal process accuracy.',
    weight: 1.0,
  },
  {
    name: 'AI Writing Detector',
    role: 'AI Content Humanness Evaluator',
    criteria: 'Natural sentence variation. Absence of AI clichés ("delve", "landscape", "tapestry"). Conversational tone where appropriate. Unique phrasing. Emotional engagement.',
    weight: 1.5,
  },
  {
    name: 'UX Copywriter',
    role: 'UX Copywriter & CTA Specialist',
    criteria: 'Clear value proposition in first paragraph. Strong, specific CTAs (not generic "Contact us"). Scannable formatting (bullet points, short paragraphs). User benefit focus over feature listing.',
    weight: 1.0,
  },
  {
    name: 'Cultural Expert',
    role: 'Egyptian/Arab Cultural Sensitivity Expert',
    criteria: 'Appropriate tone for Egyptian audience. Cultural references that resonate. Respectful handling of religious/cultural considerations. Appropriate formality level. Understanding of Egyptian buyer psychology.',
    weight: 1.0,
  },
];

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ExpertScore {
  expert: string;
  score: number;
  feedback: string;
}

export interface ScoringRound {
  round: number;
  scores: ExpertScore[];
  avgScore: number;
  weaknesses: string[];
  revisedAt: string;
}

export interface QualityGateResult {
  passed: boolean;
  finalScore: number;
  rounds: ScoringRound[];
  revisedContent?: string;
}

// ── Client ────────────────────────────────────────────────────────────────────

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_client) {
    _client = new Anthropic({ apiKey: getConfig().ANTHROPIC_API_KEY });
  }
  return _client;
}

// ── Core Scoring ──────────────────────────────────────────────────────────────

/**
 * Score content through the expert panel.
 * Returns individual expert scores + weighted average.
 */
async function scoreContent(
  content: string,
  contentType: string,
  locale: string,
): Promise<{ scores: ExpertScore[]; avgScore: number; weaknesses: string[] }> {
  const expertList = EXPERTS.map(
    (e, i) => `Expert ${i + 1}: "${e.name}" (${e.role})\nEvaluate: ${e.criteria}\nWeight: ${e.weight}x`,
  ).join('\n\n');

  const prompt = `You are scoring AI-generated ${contentType} content for an Egyptian real estate platform (Osool).
Locale: ${locale}

CONTENT TO EVALUATE:
---
${content}
---

Score this content as each of the following experts. For each expert, provide:
1. A score from 0-100
2. Specific feedback (2-3 sentences)

${expertList}

Respond in this exact JSON format:
{
  "scores": [
    { "expert": "Market Analyst", "score": 85, "feedback": "..." },
    { "expert": "SEO Specialist", "score": 78, "feedback": "..." },
    { "expert": "Investment Advisor", "score": 82, "feedback": "..." },
    { "expert": "Legal Expert", "score": 90, "feedback": "..." },
    { "expert": "AI Writing Detector", "score": 70, "feedback": "..." },
    { "expert": "UX Copywriter", "score": 75, "feedback": "..." },
    { "expert": "Cultural Expert", "score": 88, "feedback": "..." }
  ],
  "top3_weaknesses": ["weakness 1", "weakness 2", "weakness 3"]
}`;

  const response = await getClient().messages.create({
    model: getConfig().ANTHROPIC_MODEL,
    max_tokens: 2000,
    messages: [{ role: 'user', content: prompt }],
  });

  const textBlock = response.content.find((b) => b.type === 'text');
  const text = textBlock?.type === 'text' ? textBlock.text : '{}';

  // Extract JSON from response
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return { scores: [], avgScore: 0, weaknesses: ['Failed to parse expert panel response'] };
  }

  const parsed = JSON.parse(jsonMatch[0]) as {
    scores: ExpertScore[];
    top3_weaknesses: string[];
  };

  // Calculate weighted average
  let totalWeight = 0;
  let weightedSum = 0;
  for (const score of parsed.scores) {
    const expert = EXPERTS.find((e) => e.name === score.expert);
    const weight = expert?.weight ?? 1.0;
    weightedSum += score.score * weight;
    totalWeight += weight;
  }

  const avgScore = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;

  return {
    scores: parsed.scores,
    avgScore,
    weaknesses: parsed.top3_weaknesses ?? [],
  };
}

/**
 * Revise content based on identified weaknesses.
 */
async function reviseContent(
  content: string,
  contentType: string,
  locale: string,
  weaknesses: string[],
): Promise<string> {
  const prompt = `You are revising AI-generated ${contentType} content for an Egyptian real estate platform (Osool).
Locale: ${locale}

ORIGINAL CONTENT:
---
${content}
---

An expert panel identified these weaknesses:
${weaknesses.map((w, i) => `${i + 1}. ${w}`).join('\n')}

Revise the content to address ALL weaknesses. Keep the same structure and format.
Return ONLY the revised content, no commentary.`;

  const response = await getClient().messages.create({
    model: getConfig().ANTHROPIC_MODEL,
    max_tokens: 4000,
    messages: [{ role: 'user', content: prompt }],
  });

  const textBlock = response.content.find((b) => b.type === 'text');
  return textBlock?.type === 'text' ? textBlock.text : content;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Run the full expert panel quality gate on content.
 * Scores → if below 90, revises and re-scores (up to maxRounds).
 */
export async function runExpertPanel(
  content: string,
  contentType: string,
  locale: string,
  maxRounds = 3,
): Promise<QualityGateResult> {
  const rounds: ScoringRound[] = [];
  let currentContent = content;
  let finalScore = 0;

  for (let round = 1; round <= maxRounds; round++) {
    const { scores, avgScore, weaknesses } = await scoreContent(currentContent, contentType, locale);

    rounds.push({
      round,
      scores,
      avgScore,
      weaknesses,
      revisedAt: new Date().toISOString(),
    });

    finalScore = avgScore;

    if (avgScore >= 90) {
      return {
        passed: true,
        finalScore,
        rounds,
        revisedContent: round > 1 ? currentContent : undefined,
      };
    }

    // Revise if not the last round
    if (round < maxRounds) {
      currentContent = await reviseContent(currentContent, contentType, locale, weaknesses);
    }
  }

  return {
    passed: false,
    finalScore,
    rounds,
    revisedContent: rounds.length > 1 ? currentContent : undefined,
  };
}
