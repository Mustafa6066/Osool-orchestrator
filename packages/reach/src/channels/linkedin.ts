/**
 * LinkedIn Channel — HNW investor signals via PUBLIC SEARCH ONLY.
 *
 * IMPORTANT LEGAL NOTE (from absorption plan risks section):
 *   Scraping HNW profiles is the single biggest legal exposure.
 *   Mitigate: public LinkedIn search only, via Jina Reader.
 *   NEVER authenticate. NEVER store profile URLs directly.
 *   Tag all contacts with source='linkedin-public' for easy purge.
 *
 * This channel uses Jina Reader to extract public LinkedIn search result
 * pages — no credentials, no authenticated endpoints.
 */

import type { Channel, ReachItem, ReachContent, HealthResult } from './base.js';

const JINA_SEARCH = 'https://s.jina.ai/';
const JINA_READER = 'https://r.jina.ai/';

export class LinkedInChannel implements Channel {
  readonly name = 'linkedin';

  async check(): Promise<HealthResult> {
    const start = Date.now();
    try {
      const q = encodeURIComponent('egypt real estate investment site:linkedin.com/posts');
      const res = await fetch(`${JINA_SEARCH}${q}`, {
        signal: AbortSignal.timeout(10_000),
        headers: { Accept: 'application/json' },
      });
      return { healthy: res.ok, latencyMs: Date.now() - start };
    } catch (err) {
      return { healthy: false, latencyMs: Date.now() - start, error: String(err) };
    }
  }

  /**
   * Search LinkedIn public posts via Jina Search.
   * Results are tagged source='linkedin-public' in metadata.
   */
  async search(query: string, opts?: { limit?: number }): Promise<ReachItem[]> {
    const limit = opts?.limit ?? 5;
    // Scope search to LinkedIn public posts/articles only
    const q = encodeURIComponent(`${query} egypt real estate site:linkedin.com/posts`);

    try {
      const res = await fetch(`${JINA_SEARCH}${q}`, {
        signal: AbortSignal.timeout(20_000),
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) return [];

      const data = (await res.json()) as {
        data?: Array<{ url: string; title: string; content: string; publishedTime?: string }>;
      };
      const items = data.data ?? [];

      return items.slice(0, limit).map((item, i) => ({
        id: `linkedin-${i}-${encodeURIComponent(item.url)}`,
        title: item.title,
        text: item.content,
        url: item.url,
        publishedAt: item.publishedTime ? new Date(item.publishedTime) : undefined,
        channel: this.name,
        metadata: {
          // CRITICAL: always mark as public source for easy purge
          source: 'linkedin-public',
          platform: 'linkedin',
        },
      }));
    } catch {
      return [];
    }
  }

  async fetch(url: string): Promise<ReachContent> {
    // Only fetch public post URLs — never profile pages
    if (!url.includes('/posts/') && !url.includes('/pulse/')) {
      return {
        url,
        title: url,
        text: '',
        metadata: { channel: this.name, source: 'linkedin-public', skipped: 'non-post-url' },
      };
    }

    try {
      const jinaUrl = `${JINA_READER}${url}`;
      const res = await fetch(jinaUrl, {
        signal: AbortSignal.timeout(20_000),
        headers: { Accept: 'text/plain' },
      });
      const text = await res.text();
      const title = text.split('\n').find((l) => l.startsWith('Title:'))?.replace('Title:', '').trim() ?? url;
      return {
        url,
        title,
        text: text.trim(),
        metadata: { channel: this.name, source: 'linkedin-public' },
      };
    } catch {
      return { url, title: url, text: '', metadata: { channel: this.name, source: 'linkedin-public' } };
    }
  }
}
