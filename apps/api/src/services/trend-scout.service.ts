/**
 * Trend Scout Service — multi-source trend detection for Egyptian real estate.
 * Extends market-pulse with external trend sources (Google Trends RSS, Reddit).
 *
 * All external sources are optional — gracefully degrades without API keys.
 */

import Anthropic from '@anthropic-ai/sdk';
import { getConfig } from '../config.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TrendItem {
  source: string;
  title: string;
  relevanceScore: number;
  url?: string;
  publishedAt?: string;
}

export interface TrendScoutResult {
  trends: TrendItem[];
  contentAngles: string[];
  scannedAt: string;
}

// ── Egyptian RE Relevance Keywords ────────────────────────────────────────────

const RELEVANCE_KEYWORDS = [
  'egypt', 'cairo', 'real estate', 'property', 'compound', 'villa', 'apartment',
  'new capital', 'north coast', 'investment', 'housing', 'construction',
  'emaar', 'sodic', 'palm hills', 'mountain view', 'development',
  'ras el hikma', 'ain sokhna', 'interest rate', 'mortgage', 'infrastructure',
];

// ── Client ────────────────────────────────────────────────────────────────────

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_client) {
    _client = new Anthropic({ apiKey: getConfig().ANTHROPIC_API_KEY });
  }
  return _client;
}

// ── Google Trends RSS ─────────────────────────────────────────────────────────

async function fetchGoogleTrendsEgypt(): Promise<TrendItem[]> {
  try {
    // Google Trends RSS feed for Egypt
    const url = 'https://trends.google.com/trending/rss?geo=EG';
    const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) return [];

    const text = await response.text();

    // Simple XML parsing for RSS items
    const items: TrendItem[] = [];
    const titleMatches = text.matchAll(/<title><!\[CDATA\[(.*?)\]\]><\/title>/g);

    for (const match of titleMatches) {
      const title = match[1];
      if (!title || title === 'Daily Search Trends') continue;

      items.push({
        source: 'google_trends',
        title,
        relevanceScore: scoreRelevance(title),
      });
    }

    return items.filter((t) => t.relevanceScore > 0);
  } catch {
    return [];
  }
}

// ── Reddit Trends ─────────────────────────────────────────────────────────────

async function fetchRedditTrends(): Promise<TrendItem[]> {
  const subreddits = ['realestate', 'egypt', 'investing'];
  const items: TrendItem[] = [];

  for (const sub of subreddits) {
    try {
      const url = `https://www.reddit.com/r/${sub}/hot.json?limit=10`;
      const response = await fetch(url, {
        headers: { 'User-Agent': 'Osool-TrendScout/1.0' },
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) continue;

      const data = (await response.json()) as {
        data: { children: { data: { title: string; url: string; created_utc: number } }[] };
      };

      for (const post of data.data.children) {
        const relevance = scoreRelevance(post.data.title);
        if (relevance > 0) {
          items.push({
            source: `reddit_${sub}`,
            title: post.data.title,
            relevanceScore: relevance,
            url: post.data.url,
            publishedAt: new Date(post.data.created_utc * 1000).toISOString(),
          });
        }
      }
    } catch {
      continue;
    }
  }

  return items;
}

// ── Brave Search (optional) ──────────────────────────────────────────────────

async function fetchBraveNews(): Promise<TrendItem[]> {
  const config = getConfig();
  if (!config.BRAVE_API_KEY) return [];

  try {
    const query = encodeURIComponent('Egypt real estate market news 2025');
    const url = `https://api.search.brave.com/res/v1/news/search?q=${query}&count=10`;
    const response = await fetch(url, {
      headers: { 'X-Subscription-Token': config.BRAVE_API_KEY, Accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return [];

    const data = (await response.json()) as {
      results: { title: string; url: string; age: string }[];
    };

    return (data.results ?? []).map((r) => ({
      source: 'brave_news',
      title: r.title,
      relevanceScore: scoreRelevance(r.title),
      url: r.url,
    }));
  } catch {
    return [];
  }
}

// ── Relevance Scoring ─────────────────────────────────────────────────────────

function scoreRelevance(title: string): number {
  const lower = title.toLowerCase();
  let score = 0;

  for (const kw of RELEVANCE_KEYWORDS) {
    if (lower.includes(kw)) {
      score += kw.length > 6 ? 2 : 1; // Longer/more specific keywords get more weight
    }
  }

  return Math.min(score, 10); // Cap at 10
}

// ── Content Angle Generation ──────────────────────────────────────────────────

async function generateContentAngles(trends: TrendItem[]): Promise<string[]> {
  if (trends.length === 0) return [];

  const topTrends = trends
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, 10);

  const prompt = `You are a content strategist for Osool, an Egyptian real estate platform.

These are trending topics relevant to Egyptian real estate:
${topTrends.map((t) => `- "${t.title}" (source: ${t.source}, relevance: ${t.relevanceScore}/10)`).join('\n')}

Suggest 5 content angles that would resonate with Egyptian property buyers/investors.
Each angle should be a specific article title or content idea.

Respond as a JSON array of strings:
["Article idea 1", "Article idea 2", ...]`;

  const response = await getClient().messages.create({
    model: getConfig().ANTHROPIC_MODEL,
    max_tokens: 1000,
    messages: [{ role: 'user', content: prompt }],
  });

  const textBlock = response.content.find((b) => b.type === 'text');
  const text = textBlock?.type === 'text' ? textBlock.text : '[]';

  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return [];

  return JSON.parse(jsonMatch[0]) as string[];
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Run the full trend scout pipeline:
 * 1. Fetch trends from multiple sources (Google Trends, Reddit, Brave)
 * 2. Score for Egyptian RE relevance
 * 3. Generate content angles from top trends
 */
export async function runTrendScout(): Promise<TrendScoutResult> {
  const [googleTrends, redditTrends, braveNews] = await Promise.all([
    fetchGoogleTrendsEgypt(),
    fetchRedditTrends(),
    fetchBraveNews(),
  ]);

  const allTrends = [...googleTrends, ...redditTrends, ...braveNews]
    .filter((t) => t.relevanceScore > 0)
    .sort((a, b) => b.relevanceScore - a.relevanceScore);

  const contentAngles = await generateContentAngles(allTrends);

  return {
    trends: allTrends,
    contentAngles,
    scannedAt: new Date().toISOString(),
  };
}
