import { z } from 'zod';
import { router, publicProcedure, protectedProcedure } from '../lib/trpc.js';
import { db } from '@osool/db';
import { funnelEvents, waitlist, campaigns, campaignMetrics } from '@osool/db/schema';
import { eq, and, desc, sql, gte, lte } from 'drizzle-orm';

export const funnelRouter = router({
  trackEvent: publicProcedure
    .input(z.object({
      event: z.string(),
      stage: z.string(),
      properties: z.record(z.unknown()).optional(),
      source: z.string().optional(),
      medium: z.string().optional(),
      campaign: z.string().optional(),
      visitorId: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      await db.insert(funnelEvents).values({
        userId: ctx.userId,
        visitorId: input.visitorId ?? ctx.visitorId,
        event: input.event,
        stage: input.stage,
        properties: input.properties,
        source: input.source,
        medium: input.medium,
        campaign: input.campaign,
      });
      return { success: true };
    }),

  joinWaitlist: publicProcedure
    .input(z.object({
      email: z.string().email(),
      name: z.string().optional(),
      phone: z.string().optional(),
      source: z.string().optional(),
      preferredLocations: z.array(z.string()).optional(),
      budgetRange: z.object({ min: z.number(), max: z.number() }).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const [entry] = await db
        .insert(waitlist)
        .values({
          userId: ctx.userId,
          email: input.email,
          name: input.name,
          phone: input.phone,
          source: input.source ?? 'website',
          preferredLocations: input.preferredLocations ?? [],
          budgetRange: input.budgetRange,
          status: 'active',
        })
        .returning();
      return entry;
    }),

  getMetrics: protectedProcedure
    .input(z.object({
      startDate: z.string().datetime(),
      endDate: z.string().datetime(),
    }))
    .query(async ({ input }) => {
      const start = new Date(input.startDate);
      const end = new Date(input.endDate);

      const funnelStages = await db
        .select({
          stage: funnelEvents.stage,
          count: sql<number>`count(*)`,
        })
        .from(funnelEvents)
        .where(and(
          gte(funnelEvents.createdAt, start),
          lte(funnelEvents.createdAt, end),
        ))
        .groupBy(funnelEvents.stage);

      const waitlistCount = await db
        .select({ count: sql<number>`count(*)` })
        .from(waitlist)
        .where(eq(waitlist.status, 'active'));

      return {
        funnelStages: funnelStages.map((s) => ({ stage: s.stage, count: Number(s.count) })),
        waitlistSize: Number(waitlistCount[0]?.count ?? 0),
      };
    }),

  getCampaignMetrics: protectedProcedure
    .input(z.object({
      campaignId: z.string().uuid(),
      startDate: z.string().datetime().optional(),
      endDate: z.string().datetime().optional(),
    }))
    .query(async ({ input }) => {
      const conditions = [eq(campaignMetrics.campaignId, input.campaignId)];
      if (input.startDate) conditions.push(gte(campaignMetrics.date, new Date(input.startDate)));
      if (input.endDate) conditions.push(lte(campaignMetrics.date, new Date(input.endDate)));

      return db
        .select()
        .from(campaignMetrics)
        .where(and(...conditions))
        .orderBy(desc(campaignMetrics.date));
    }),
});
