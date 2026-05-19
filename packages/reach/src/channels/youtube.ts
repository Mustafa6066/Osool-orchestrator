/**
 * YouTube Channel — market commentary via yt-dlp transcripts.
 * Uses the YouTube Data API v3 for search, then fetches captions.
 *
 * Requires YOUTUBE_API_KEY env var.
 * Falls back to web scraping via Jina Reader for caption-less videos.
 */

import type { Channel, ReachItem, ReachContent, HealthResult } from './base.js';

const YT_API = 'https://www.googleapis.com/youtube/v3';
const JINA_READER = 'https://r.jina.ai/';

export class YouTubeChannel implements Channel {
  readonly name = 'youtube';

  private get apiKey(): string | undefined {
    return process.env.YOUTUBE_API_KEY;
  }

  async check(): Promise<HealthResult> {
    const start = Date.now();
    if (!this.apiKey) {
      return { healthy: false, latencyMs: 0, error: 'YOUTUBE_API_KEY not set' };
    }
    try {
      const res = await fetch(
        `${YT_API}/search?part=snippet&q=egypt+real+estate&type=video&maxResults=1&key=${this.apiKey}`,
        { signal: AbortSignal.timeout(5000) },
      );
      return { healthy: res.ok, latencyMs: Date.now() - start };
    } catch (err) {
      return { healthy: false, latencyMs: Date.now() - start, error: String(err) };
    }
  }

  async search(query: string, opts?: { limit?: number; since?: Date }): Promise<ReachItem[]> {
    if (!this.apiKey) return [];

    const limit = Math.min(opts?.limit ?? 5, 50);
    const publishedAfter = opts?.since ? `&publishedAfter=${opts.since.toISOString()}` : '';
    const q = encodeURIComponent(`${query} egypt real estate`);

    try {
      const res = await fetch(
        `${YT_API}/search?part=snippet&q=${q}&type=video&maxResults=${limit}&relevanceLanguage=ar&key=${this.apiKey}${publishedAfter}`,
        { signal: AbortSignal.timeout(10_000) },
      );
      if (!res.ok) return [];

      const data = (await res.json()) as {
        items?: Array<{
          id: { videoId: string };
          snippet: {
            title: string;
            description: string;
            publishedAt: string;
            channelTitle: string;
          };
        }>;
      };

      return (data.items ?? []).map((item) => ({
        id: item.id.videoId,
        title: item.snippet.title,
        text: item.snippet.description,
        url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
        publishedAt: new Date(item.snippet.publishedAt),
        author: item.snippet.channelTitle,
        channel: this.name,
        metadata: { platform: 'youtube', videoId: item.id.videoId },
      }));
    } catch {
      return [];
    }
  }

  async fetch(url: string): Promise<ReachContent> {
    // Use Jina Reader to extract transcript / page text from YouTube
    const jinaUrl = `${JINA_READER}${url}`;
    try {
      const res = await fetch(jinaUrl, {
        signal: AbortSignal.timeout(30_000),
        headers: { Accept: 'text/plain' },
      });
      const text = await res.text();
      const lines = text.split('\n');
      const title = lines.find((l) => l.startsWith('Title:'))?.replace('Title:', '').trim() ?? url;
      return {
        url,
        title,
        text: text.trim(),
        metadata: { channel: this.name, source: 'jina-reader' },
      };
    } catch {
      return { url, title: url, text: '', metadata: { channel: this.name } };
    }
  }
}
