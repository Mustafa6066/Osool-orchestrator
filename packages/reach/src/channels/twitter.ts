/**
 * Twitter/X Channel — developer announcements from Egyptian RE accounts.
 * Uses the Twitter v2 API with Bearer token authentication.
 *
 * Target accounts: @NawyEgypt, @SODICdevelopers, @MountainViewDev, @OrascomDev
 *
 * Requires TWITTER_BEARER_TOKEN env var.
 */

import type { Channel, ReachItem, ReachContent, HealthResult } from './base.js';

const TWITTER_API = 'https://api.twitter.com/2';
const TARGET_ACCOUNTS = [
  'NawyEgypt',
  'SODICdevelopers',
  'MountainViewDev',
  'OrascomDev',
  'TatweerMisr',
  'Palm_Hills',
];

export class TwitterChannel implements Channel {
  readonly name = 'twitter';

  private get bearerToken(): string | undefined {
    return process.env.TWITTER_BEARER_TOKEN;
  }

  async check(): Promise<HealthResult> {
    const start = Date.now();
    if (!this.bearerToken) {
      return { healthy: false, latencyMs: 0, error: 'TWITTER_BEARER_TOKEN not set' };
    }
    try {
      const res = await fetch(`${TWITTER_API}/tweets/search/recent?query=from:NawyEgypt&max_results=10`, {
        headers: { Authorization: `Bearer ${this.bearerToken}` },
        signal: AbortSignal.timeout(5000),
      });
      return { healthy: res.ok, latencyMs: Date.now() - start };
    } catch (err) {
      return { healthy: false, latencyMs: Date.now() - start, error: String(err) };
    }
  }

  async search(query: string, opts?: { limit?: number; since?: Date }): Promise<ReachItem[]> {
    if (!this.bearerToken) return [];

    const limit = Math.min(opts?.limit ?? 10, 100);
    const accounts = TARGET_ACCOUNTS.map((a) => `from:${a}`).join(' OR ');
    const sinceId = opts?.since
      ? `&start_time=${opts.since.toISOString()}`
      : '';

    const q = encodeURIComponent(`(${accounts}) ${query} lang:en -is:retweet`);
    const url = `${TWITTER_API}/tweets/search/recent?query=${q}&max_results=${limit}&tweet.fields=created_at,author_id,text&expansions=author_id&user.fields=username,name${sinceId}`;

    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${this.bearerToken}` },
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) return [];

      const data = (await res.json()) as {
        data?: Array<{ id: string; text: string; created_at?: string; author_id?: string }>;
        includes?: { users?: Array<{ id: string; username: string; name: string }> };
      };

      const users = new Map((data.includes?.users ?? []).map((u) => [u.id, u]));
      return (data.data ?? []).map((tweet) => {
        const user = tweet.author_id ? users.get(tweet.author_id) : undefined;
        return {
          id: tweet.id,
          title: `@${user?.username ?? 'unknown'}: ${tweet.text.slice(0, 80)}`,
          text: tweet.text,
          url: `https://twitter.com/i/web/status/${tweet.id}`,
          publishedAt: tweet.created_at ? new Date(tweet.created_at) : undefined,
          author: user?.username,
          channel: this.name,
          metadata: { platform: 'twitter', authorName: user?.name },
        };
      });
    } catch {
      return [];
    }
  }

  async fetch(url: string): Promise<ReachContent> {
    // For individual tweet URLs we use the web channel as fallback
    const tweetIdMatch = url.match(/status\/(\d+)/);
    if (!tweetIdMatch || !this.bearerToken) {
      return { url, title: url, text: '', metadata: { channel: this.name } };
    }

    const tweetId = tweetIdMatch[1];
    const res = await fetch(`${TWITTER_API}/tweets/${tweetId}?tweet.fields=text,created_at`, {
      headers: { Authorization: `Bearer ${this.bearerToken}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return { url, title: url, text: '', metadata: { channel: this.name } };

    const data = (await res.json()) as { data?: { text: string; created_at?: string } };
    const tweet = data.data;
    return {
      url,
      title: `Tweet ${tweetId}`,
      text: tweet?.text ?? '',
      publishedAt: tweet?.created_at ? new Date(tweet.created_at) : undefined,
      metadata: { channel: this.name, platform: 'twitter' },
    };
  }
}
