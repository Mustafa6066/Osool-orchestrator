import { type CreateFastifyContextOptions } from './trpc-fastify.js';
import { db } from '@osool/db';
import { getRedis } from './redis.js';

export interface Context {
  db: typeof db;
  redis: ReturnType<typeof getRedis>;
  userId?: string;
  visitorId?: string;
}

export async function createContext(opts: CreateFastifyContextOptions): Promise<Context> {
  const authHeader = opts.req.headers.authorization;
  let userId: string | undefined;

  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    // In production, verify with Clerk. For now, trust the token as user ID.
    userId = token;
  }

  const visitorId = opts.req.headers['x-visitor-id'] as string | undefined;

  return {
    db,
    redis: getRedis(),
    userId,
    visitorId,
  };
}
