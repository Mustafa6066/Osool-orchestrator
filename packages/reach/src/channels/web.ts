/**
 * Web Channel — generic extraction via Jina Reader (no API key required).
 * Jina Reader converts any URL to clean Markdown text.
 * API: https://r.jina.ai/{url}
 */

import type { Channel, ReachItem, ReachContent, HealthResult } from './base.js';

const JINA_READER = 'https://r.jina.ai/';
const JINA_SEARCH = 'https://s.jina.ai/';

export class WebChannel implements Channel {
  readonly name = 'web';

  async check(): Promise<HealthResult> {
    const start = Date.now();
    try {
      const res = await fetch(`${JINA_READER}https://www.google.com`, {
        signal: AbortSignal.timeout(8000),
        headers: { Accept: 'text/plain' },
      });
      return { healthy: res.ok, latencyMs: Date.now() - start };
    } catch (err) {
      return { healthy: false, latencyMs: Date.now() - start, error: String(err) };
    }
  }

  async search(query: string, opts?: { limit?: number }): Promise<ReachItem[]> {
    const limit = opts?.limit ?? 5;
    const encoded = encodeURIComponent(query);
    const url = `${JINA_SEARCH}${encoded}`;

    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(20_000),
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) return [];

      const data = (await res.json()) as {
        data?: Array<{ url: string; title: string; content: string; publishedTime?: string }>;
      };
      const items = data.data ?? [];

      return items.slice(0, limit).map((item, i) => ({
        id: `web-${i}-${encodeURIComponent(item.url)}`,
        title: item.title,
        text: item.content,
        url: item.url,
        publishedAt: item.publishedTime ? new Date(item.publishedTime) : undefined,
        channel: this.name,
        metadata: { source: 'jina-search' },
      }));
    } catch {
      return [];
    }
  }

  async fetch(url: string): Promise<ReachContent> {
    const jinaUrl = `${JINA_READER}${url}`;
    const res = await fetch(jinaUrl, {
      signal: AbortSignal.timeout(20_000),
      headers: { Accept: 'text/plain' },
    });
    const text = await res.text();
    // Jina returns "Title: ...\nURL: ...\n\nContent..." — parse the header
    const lines = text.split('\n');
    const titleLine = lines.find((l) => l.startsWith('Title:'));
    const title = titleLine ? titleLine.replace('Title:', '').trim() : url;
    const content = lines.filter((l) => !l.startsWith('Title:') && !l.startsWith('URL:')).join('\n').trim();

    return {
      url,
      title,
      text: content,
      html: undefined,
      metadata: { channel: this.name, source: 'jina-reader' },
    };
  }
}
