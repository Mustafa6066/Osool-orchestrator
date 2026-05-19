/**
 * RSS Channel — Egyptian real estate news feeds.
 * Cheapest channel with highest signal density.
 *
 * Default feeds (override via constructor):
 *  - Nawy News (if available)
 *  - EGY Property news
 *  - Al-Mal newspaper (real estate section)
 */

import { XMLParser } from 'fast-xml-parser';
import type { Channel, ReachItem, ReachContent, HealthResult } from './base.js';

const DEFAULT_FEEDS = [
  'https://www.egproperties.com/news/feed',
  'https://nawy.com/news/rss',
  'https://www.almal.com.eg/feed/rss/?cat=22',
];

export class RSSChannel implements Channel {
  readonly name = 'rss';

  private readonly feeds: string[];
  private readonly parser: XMLParser;

  constructor(feeds?: string[]) {
    this.feeds = feeds ?? DEFAULT_FEEDS;
    this.parser = new XMLParser({ ignoreAttributes: false });
  }

  async check(): Promise<HealthResult> {
    const start = Date.now();
    try {
      const res = await fetch(this.feeds[0] ?? DEFAULT_FEEDS[0], {
        signal: AbortSignal.timeout(5000),
      });
      return { healthy: res.ok, latencyMs: Date.now() - start };
    } catch (err) {
      return { healthy: false, latencyMs: Date.now() - start, error: String(err) };
    }
  }

  async search(query: string, opts?: { limit?: number; since?: Date }): Promise<ReachItem[]> {
    const limit = opts?.limit ?? 10;
    const since = opts?.since;
    const results: ReachItem[] = [];

    await Promise.all(
      this.feeds.map(async (feedUrl) => {
        try {
          const items = await this._parseFeed(feedUrl);
          for (const item of items) {
            if (since && item.publishedAt && item.publishedAt < since) continue;
            const text = `${item.title} ${item.text}`.toLowerCase();
            if (!query || text.includes(query.toLowerCase())) {
              results.push(item);
            }
          }
        } catch {
          // Individual feed failure doesn't abort the whole search
        }
      }),
    );

    return results
      .sort((a, b) => (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0))
      .slice(0, limit);
  }

  async fetch(url: string): Promise<ReachContent> {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    const text = await res.text();
    return {
      url,
      title: url,
      text,
      metadata: { channel: this.name },
    };
  }

  private async _parseFeed(feedUrl: string): Promise<ReachItem[]> {
    const res = await fetch(feedUrl, { signal: AbortSignal.timeout(10_000) });
    const xml = await res.text();
    const parsed = this.parser.parse(xml) as Record<string, unknown>;

    const channel = (parsed.rss as Record<string, unknown>)?.channel as Record<string, unknown>;
    const rawItems = (channel?.item as unknown[]) ?? [];
    const items = Array.isArray(rawItems) ? rawItems : [rawItems];

    return items.map((item) => {
      const i = item as Record<string, unknown>;
      const pubDate = i.pubDate as string | undefined;
      return {
        id: String(i.guid ?? i.link ?? Math.random()),
        title: String(i.title ?? ''),
        text: String(i.description ?? ''),
        url: String(i.link ?? feedUrl),
        publishedAt: pubDate ? new Date(pubDate) : undefined,
        author: String(i['dc:creator'] ?? ''),
        channel: this.name,
        metadata: { feedUrl, source: 'rss' },
      };
    });
  }
}
