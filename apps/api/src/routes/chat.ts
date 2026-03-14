import { z } from 'zod';
import { router, publicProcedure } from '../lib/trpc.js';
import { db } from '@osool/db';
import { chatSessions, chatMessages } from '@osool/db/schema';
import { eq, desc } from 'drizzle-orm';
import { chat } from '../agents/chat-agent.js';
import { recordIntent, computeLeadScoreForSession } from '../agents/intent-agent.js';
import { scoringQueue } from '../jobs/queues.js';

export const chatRouter = router({
  createSession: publicProcedure
    .input(z.object({
      visitorId: z.string().optional(),
      language: z.string().default('en'),
      icpSegment: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const [session] = await db
        .insert(chatSessions)
        .values({
          userId: ctx.userId,
          visitorId: input.visitorId ?? ctx.visitorId,
          language: input.language,
          icpSegment: input.icpSegment,
        })
        .returning();
      return session;
    }),

  sendMessage: publicProcedure
    .input(z.object({
      sessionId: z.string().uuid(),
      message: z.string().min(1).max(5000),
    }))
    .mutation(async ({ input, ctx }) => {
      // Classify intent
      const intent = await recordIntent(
        ctx.visitorId ?? 'anonymous',
        input.message,
        ctx.userId,
      );

      // Generate AI reply
      const result = await chat({
        sessionId: input.sessionId,
        message: input.message,
        userId: ctx.userId,
        visitorId: ctx.visitorId,
      });

      // Queue lead scoring
      await scoringQueue.add('score', { sessionId: input.sessionId }, {
        delay: 2000,
        removeOnComplete: 100,
      });

      return {
        ...result,
        intent,
      };
    }),

  getHistory: publicProcedure
    .input(z.object({
      sessionId: z.string().uuid(),
    }))
    .query(async ({ input }) => {
      const messages = await db
        .select()
        .from(chatMessages)
        .where(eq(chatMessages.sessionId, input.sessionId))
        .orderBy(chatMessages.createdAt);
      return messages;
    }),

  getSession: publicProcedure
    .input(z.object({
      sessionId: z.string().uuid(),
    }))
    .query(async ({ input }) => {
      const [session] = await db
        .select()
        .from(chatSessions)
        .where(eq(chatSessions.id, input.sessionId))
        .limit(1);
      return session ?? null;
    }),
});
