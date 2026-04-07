/**
 * CRO Audit Service — score Osool landing pages across 8 conversion dimensions.
 *
 * Uses Claude to analyze page content against conversion optimization criteria
 * tailored for Egyptian real estate.
 */

import Anthropic from '@anthropic-ai/sdk';
import { getConfig } from '../config.js';

// ── Types (re-exported from shared for service use) ──────────────────────────

interface CRODimensionScores {
  headlineClarity: number;
  ctaVisibility: number;
  socialProof: number;
  urgency: number;
  trustSignals: number;
  formFriction: number;
  mobileResponsiveness: number;
  pageSpeed: number;
}

interface CROFinding {
  dimension: string;
  score: number;
  issues: string[];
  recommendations: string[];
}

interface CROFix {
  priority: 'P0' | 'P1' | 'P2' | 'P3';
  dimension: string;
  description: string;
  expectedLift: string;
}

export interface CROAuditOutput {
  overallScore: number;
  dimensionScores: CRODimensionScores;
  findings: CROFinding[];
  fixes: CROFix[];
}

// ── Client ────────────────────────────────────────────────────────────────────

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_client) {
    _client = new Anthropic({ apiKey: getConfig().ANTHROPIC_API_KEY });
  }
  return _client;
}

// ── Core Audit ────────────────────────────────────────────────────────────────

/**
 * Fetch a page's HTML and run CRO audit via Claude.
 */
export async function auditPage(url: string, pageType: string): Promise<CROAuditOutput> {
  // Fetch the page HTML
  let html: string;
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Osool-CRO-Audit/1.0' },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch ${url}: ${response.status}`);
    }
    html = await response.text();
  } catch (err) {
    throw new Error(`Cannot fetch page for CRO audit: ${(err as Error).message}`);
  }

  // Truncate HTML to avoid context limits (keep first 30KB)
  const truncatedHtml = html.length > 30_000 ? html.substring(0, 30_000) + '\n<!-- truncated -->' : html;

  const prompt = `You are a Conversion Rate Optimization expert specializing in Egyptian real estate websites.

Audit this ${pageType} page for conversion optimization across 8 dimensions.

PAGE HTML:
---
${truncatedHtml}
---

Score each dimension from 0-100 and provide findings:

1. **Headline Clarity** — Is the value proposition clear within 5 seconds? Does it mention specific developments, prices, or locations?
2. **CTA Visibility** — Are CTAs prominent, above the fold, with contrasting colors? Are they specific ("Reserve Unit in Mountain View") vs generic ("Contact Us")?
3. **Social Proof** — Testimonials, developer logos, unit counts sold, investor success stories?
4. **Urgency** — Limited units, price increase notices, delivery dates, demand indicators?
5. **Trust Signals** — Developer credentials, legal compliance (FRA/CBE), secure payment badges, license numbers?
6. **Form Friction** — How many fields in the inquiry form? Is it multi-step? Does it ask for unnecessary info?
7. **Mobile Responsiveness** — Viewport meta tag, responsive images, touch targets ≥48px, readable text without zoom?
8. **Page Speed** — Image sizes, number of scripts, lazy loading, compression indicators?

Respond in this exact JSON format:
{
  "overallScore": 72,
  "dimensionScores": {
    "headlineClarity": 80,
    "ctaVisibility": 65,
    "socialProof": 70,
    "urgency": 55,
    "trustSignals": 85,
    "formFriction": 75,
    "mobileResponsiveness": 80,
    "pageSpeed": 70
  },
  "findings": [
    {
      "dimension": "CTA Visibility",
      "score": 65,
      "issues": ["CTAs use generic text", "Primary CTA is below the fold"],
      "recommendations": ["Use specific CTA: 'Reserve Your Unit in [Compound]'", "Move CTA to hero section"]
    }
  ],
  "fixes": [
    {
      "priority": "P0",
      "dimension": "CTA Visibility",
      "description": "Replace generic 'Contact Us' with specific compound/unit CTAs",
      "expectedLift": "+15-25% click-through rate"
    }
  ]
}

Include findings for ALL 8 dimensions and prioritize fixes from P0 (critical) to P3 (nice-to-have).`;

  const response = await getClient().messages.create({
    model: getConfig().ANTHROPIC_MODEL,
    max_tokens: 4000,
    messages: [{ role: 'user', content: prompt }],
  });

  const textBlock = response.content.find((b) => b.type === 'text');
  const text = textBlock?.type === 'text' ? textBlock.text : '{}';

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Failed to parse CRO audit response');
  }

  return JSON.parse(jsonMatch[0]) as CROAuditOutput;
}
