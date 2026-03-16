import { type CreateFastifyContextOptions } from './trpc-fastify.js';
import { db } from '@osool/db';
import { getRedis } from './redis.js';
import { verifyPlatformToken } from './auth.js';

export interface Context {
  db: typeof db;
  redis: ReturnType<typeof getRedis>;
  userId?: string;
  visitorId?: string;
  userRole?: string;
}

export async function createContext(opts: CreateFastifyContextOptions): Promise<Context> {
  const authHeader = opts.req.headers.authorization;
  let userId: string | undefined;
  let userRole: string | undefined;

  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    // Verify the Platform JWT using the shared secret
    const payload = verifyPlatformToken(token);
    if (payload && payload.sub) {
      // Platform 'sub' is the email or user ID
      userId = payload.sub;
      userRole = payload.role;
    } else {
      // Fallback or dev mode: if no secret configured, it might return null.
      // We log but don't crash, might want to explicitly reject in prod.
      console.warn('Invalid or missing platform token payload');
    }
  }

  const visitorId = opts.req.headers['x-visitor-id'] as string | undefined;

  return {
    db,
    redis: getRedis(),
    userId,
    visitorId,
    userRole,
  };
}
