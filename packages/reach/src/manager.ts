/**
 * Reach Manager — orchestrates multiple channels with health tracking
 * and a unified search/fetch interface.
 */

import type { Channel, ReachItem, ReachContent } from './channels/base.js';
import { RSSChannel } from './channels/rss.js';
import { WebChannel } from './channels/web.js';
import { TwitterChannel } from './channels/twitter.js';
import { YouTubeChannel } from './channels/youtube.js';
import { LinkedInChannel } from './channels/linkedin.js';

export interface ReachManager {
  search(query: string, opts?: { channels?: string[]; limit?: number; since?: Date }): Promise<ReachItem[]>;
  fetch(url: string, channelName?: string): Promise<ReachContent>;
  healthCheck(): Promise<Record<string, { healthy: boolean; latencyMs: number }>>;
  getChannel(name: string): Channel | undefined;
}

/**
 * Create a ReachManager with all default channels enabled.
 * Pass `channelOverrides` to inject mocks in tests.
 */
export function createReachManager(channelOverrides?: Channel[]): ReachManager {
  const defaultChannels: Channel[] = [
    new RSSChannel(),
    new WebChannel(),
    new TwitterChannel(),
    new YouTubeChannel(),
    new LinkedInChannel(),
  ];

  const channels = new Map<string, Channel>(
    (channelOverrides ?? defaultChannels).map((c) => [c.name, c]),
  );

  return {
    async search(query, opts = {}) {
      const targetNames = opts.channels ?? [...channels.keys()];
      const results: ReachItem[] = [];

      await Promise.all(
        targetNames.map(async (name) => {
          const ch = channels.get(name);
          if (!ch) return;
          try {
            const items = await ch.search(query, { limit: opts.limit, since: opts.since });
            results.push(...items);
          } catch {
            // Channel failure is non-fatal
          }
        }),
      );

      // De-duplicate by URL, sort by recency
      const seen = new Set<string>();
      return results
        .filter((item) => {
          if (seen.has(item.url)) return false;
          seen.add(item.url);
          return true;
        })
        .sort((a, b) => (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0))
        .slice(0, opts.limit ?? 20);
    },

    async fetch(url, channelName) {
      const ch = channelName ? channels.get(channelName) : undefined;
      if (ch) return ch.fetch(url);
      // Auto-detect channel from URL
      if (url.includes('twitter.com') || url.includes('x.com')) return channels.get('twitter')!.fetch(url);
      if (url.includes('youtube.com') || url.includes('youtu.be')) return channels.get('youtube')!.fetch(url);
      if (url.includes('linkedin.com')) return channels.get('linkedin')!.fetch(url);
      return channels.get('web')!.fetch(url);
    },

    async healthCheck() {
      const results: Record<string, { healthy: boolean; latencyMs: number }> = {};
      await Promise.all(
        [...channels.entries()].map(async ([name, ch]) => {
          const result = await ch.check();
          results[name] = { healthy: result.healthy, latencyMs: result.latencyMs };
        }),
      );
      return results;
    },

    getChannel(name) {
      return channels.get(name);
    },
  };
}
