/**
 * Redis client singleton — used by queues, caching, and agent state.
 */

import Redis from 'ioredis';
import { getConfig } from '../config.js';

let redis: Redis | null = null;

export function isRedisConfigured(): boolean {
  const url = getConfig().REDIS_URL;
  return !url.includes('localhost') && !url.includes('127.0.0.1');
}

export function getRedis(): Redis {
  if (!redis) {
    const cfg = getConfig();
    redis = new Redis(cfg.REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      lazyConnect: true,
    });

    redis.on('error', (err) => {
      console.error('[Redis] Connection error:', err.message);
    });

    redis.on('connect', () => {
      console.info('[Redis] Connected');
    });
  }
  return redis;
}

/** Parse REDIS_URL into ioredis connection options (needed for BullMQ). */
export function getRedisOpts() {
  const url = getConfig().REDIS_URL;
  try {
    const parsed = new URL(url);
    return {
      host: parsed.hostname || 'localhost',
      port: parseInt(parsed.port || '6379', 10),
      password: parsed.password || undefined,
      maxRetriesPerRequest: null as unknown as number,
      enableReadyCheck: false,
    };
  } catch {
    return {
      host: 'localhost',
      port: 6379,
      maxRetriesPerRequest: null as unknown as number,
      enableReadyCheck: false,
    };
  }
}

export async function closeRedis(): Promise<void> {
  if (redis) {
    await redis.quit();
    redis = null;
  }
}
