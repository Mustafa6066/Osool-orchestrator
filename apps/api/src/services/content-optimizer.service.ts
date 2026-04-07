/**
 * Content Optimizer Service — Karpathy-style evolutionary optimization.
 *
 * Generates multiple variants of content elements, scores them with expert panel,
 * evolves winners, and selects the best version.
 */

import Anthropic from '@anthropic-ai/sdk';
import { getConfig } from '../config.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface OptimizationRound {
  round: number;
  element: string;
  variants: { text: string; score: number }[];
  bestScore: number;
  bestVariant: string;
}

export interface OptimizationResult {
  element: string;
  original: string;
  optimized: string;
  improvement: number; // percentage lift
  rounds: OptimizationRound[];
}

export interface ContentOptimizationReport {
  seoContentId: string;
  results: OptimizationResult[];
  totalImprovement: number;
  completedAt: string;
}

// ── Client ────────────────────────────────────────────────────────────────────

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_client) {
    _client = new Anthropic({ apiKey: getConfig().ANTHROPIC_API_KEY });
  }
  return _client;
}

// ── Variant Generation ────────────────────────────────────────────────────────

/**
 * Generate N variants of a content element.
 */
async function generateVariants(
  original: string,
  element: string,
  contentType: string,
  count: number = 10,
): Promise<string[]> {
  const prompt = `You are an expert copywriter for an Egyptian real estate platform (Osool).

Generate ${count} diverse variations of this ${element} for a ${contentType} page.
Each variant should be unique in style, tone, or approach while maintaining accuracy.

ORIGINAL:
"${original}"

Requirements:
- Keep the same factual content but vary the writing style
- Include both formal and conversational variants
- Some should be concise, others more descriptive
- For Arabic-market content, consider bilingual appeal
- Focus on Egyptian real estate buyer psychology

Respond as a JSON array of strings:
["variant 1", "variant 2", ...]`;

  const response = await getClient().messages.create({
    model: getConfig().ANTHROPIC_MODEL,
    max_tokens: 3000,
    messages: [{ role: 'user', content: prompt }],
  });

  const textBlock = response.content.find((b) => b.type === 'text');
  const text = textBlock?.type === 'text' ? textBlock.text : '[]';

  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return [original];

  return JSON.parse(jsonMatch[0]) as string[];
}

// ── Batch Scoring ─────────────────────────────────────────────────────────────

/**
 * Score multiple variants in a single Claude call.
 */
async function batchScore(
  variants: string[],
  element: string,
  contentType: string,
): Promise<{ text: string; score: number }[]> {
  const prompt = `You are a content quality scorer for an Egyptian real estate platform.

Score each of these ${element} variants for a ${contentType} page on a scale of 0-100.
Consider: clarity, engagement, SEO value, Egyptian market relevance, and conversion potential.

Variants:
${variants.map((v, i) => `${i + 1}. "${v}"`).join('\n')}

Respond in JSON format:
[
  { "index": 1, "score": 85, "reason": "..." },
  { "index": 2, "score": 72, "reason": "..." }
]`;

  const response = await getClient().messages.create({
    model: getConfig().ANTHROPIC_MODEL,
    max_tokens: 2000,
    messages: [{ role: 'user', content: prompt }],
  });

  const textBlock = response.content.find((b) => b.type === 'text');
  const text = textBlock?.type === 'text' ? textBlock.text : '[]';

  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    return variants.map((v) => ({ text: v, score: 50 }));
  }

  const scored = JSON.parse(jsonMatch[0]) as { index: number; score: number }[];

  return variants.map((v, i) => ({
    text: v,
    score: scored.find((s) => s.index === i + 1)?.score ?? 50,
  }));
}

// ── Evolution ─────────────────────────────────────────────────────────────────

/**
 * Take top variants and generate evolved versions.
 */
async function evolveVariants(
  topVariants: string[],
  element: string,
  contentType: string,
  count: number = 10,
): Promise<string[]> {
  const prompt = `You are an expert copywriter for Osool (Egyptian real estate platform).

These are the top-performing ${element} variants for a ${contentType} page:
${topVariants.map((v, i) => `${i + 1}. "${v}"`).join('\n')}

Generate ${count} new evolved variants by:
- Combining the best qualities of the top variants
- Trying new angles inspired by what worked
- Pushing further on the strongest elements

Respond as a JSON array of strings:
["evolved variant 1", "evolved variant 2", ...]`;

  const response = await getClient().messages.create({
    model: getConfig().ANTHROPIC_MODEL,
    max_tokens: 3000,
    messages: [{ role: 'user', content: prompt }],
  });

  const textBlock = response.content.find((b) => b.type === 'text');
  const text = textBlock?.type === 'text' ? textBlock.text : '[]';

  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return topVariants;

  return JSON.parse(jsonMatch[0]) as string[];
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Optimize a single content element through evolutionary rounds.
 *
 * 1. Generate 10 variants
 * 2. Score all → keep top 3
 * 3. Evolve 10 new variants from top 3
 * 4. Score again → keep best
 * 5. Repeat up to maxRounds or until avg score ≥ 80
 */
export async function optimizeElement(
  original: string,
  element: string,
  contentType: string,
  maxRounds = 3,
): Promise<OptimizationResult> {
  const rounds: OptimizationRound[] = [];
  let currentBest = original;
  let currentBestScore = 0;

  // Initial generation
  let variants = await generateVariants(original, element, contentType);
  variants = [original, ...variants]; // Include original for comparison

  for (let round = 1; round <= maxRounds; round++) {
    const scored = await batchScore(variants, element, contentType);
    scored.sort((a, b) => b.score - a.score);

    const best = scored[0];
    const top3 = scored.slice(0, 3);

    rounds.push({
      round,
      element,
      variants: scored,
      bestScore: best.score,
      bestVariant: best.text,
    });

    if (best.score > currentBestScore) {
      currentBestScore = best.score;
      currentBest = best.text;
    }

    // Stop if quality threshold met
    const avgTop3 = top3.reduce((sum, v) => sum + v.score, 0) / top3.length;
    if (avgTop3 >= 80) break;

    // Evolve for next round
    if (round < maxRounds) {
      variants = await evolveVariants(
        top3.map((v) => v.text),
        element,
        contentType,
      );
    }
  }

  // Score the original for comparison
  const [originalScored] = await batchScore([original], element, contentType);
  const originalScore = originalScored.score;

  return {
    element,
    original,
    optimized: currentBest,
    improvement: originalScore > 0 ? ((currentBestScore - originalScore) / originalScore) * 100 : 0,
    rounds,
  };
}
