import { z } from 'zod';
import { router, publicProcedure, protectedProcedure } from '../lib/trpc.js';
import { db } from '@osool/db';
import { seoPages, keywords } from '@osool/db/schema';
import { eq, and, desc, sql } from 'drizzle-orm';
import { seoQueue } from '../jobs/queues.js';
import type { SEOPageInput } from '../agents/seo-agent.js';
import { fetchLiveProperties } from '../services/platform-bridge.service.js';

export const seoRouter = router({
  getPage: publicProcedure
    .input(z.object({ path: z.string() }))
    .query(async ({ input }) => {
      const [page] = await db
        .select()
        .from(seoPages)
        .where(eq(seoPages.path, input.path))
        .limit(1);
      
      if (!page) return null;

      // Enhance with live runtime properties for better CX
      let liveProperties = [];
      try {
        if (page.pageType === 'developer_profile' && page.metadata && typeof page.metadata === 'object' && 'developerId' in page.metadata) {
           liveProperties = await fetchLiveProperties({ developer: page.metadata.developerId as string, limit: 3 });
        } else if (page.pageType === 'location_guide' && page.metadata && typeof page.metadata === 'object' && 'locationId' in page.metadata) {
           liveProperties = await fetchLiveProperties({ location: page.metadata.locationId as string, limit: 3 });
        }
      } catch (err) {
        console.error('Failed to augment SEO page with live properties', err);
      }

      return {
        ...page,
        liveProperties
      };
    }),

  listPages: publicProcedure
    .input(z.object({
      pageType: z.string().optional(),
      locale: z.string().default('en'),
      limit: z.number().min(1).max(100).default(50),
      offset: z.number().min(0).default(0),
    }))
    .query(async ({ input }) => {
      const conditions = [eq(seoPages.published, true), eq(seoPages.locale, input.locale)];
      if (input.pageType) conditions.push(eq(seoPages.pageType, input.pageType));

      const results = await db
        .select()
        .from(seoPages)
        .where(and(...conditions))
        .orderBy(desc(seoPages.updatedAt))
        .limit(input.limit)
        .offset(input.offset);

      return results;
    }),

  generatePage: protectedProcedure
    .input(z.object({
      pageType: z.enum(['developer_profile', 'location_guide', 'developer_comparison', 'roi_analysis', 'buying_guide']),
      entityId: z.string().optional(),
      entityIds: z.array(z.string()).optional(),
      locale: z.enum(['en', 'ar']).default('en'),
      keywordId: z.string().uuid().optional(),
    }))
    .mutation(async ({ input }) => {
      const job = await seoQueue.add('generate', input as SEOPageInput, {
        removeOnComplete: 50,
        removeOnFail: 20,
      });
      return { jobId: job.id };
    }),

  getKeywords: publicProcedure
    .input(z.object({
      cluster: z.string().optional(),
      intent: z.string().optional(),
      limit: z.number().min(1).max(200).default(50),
    }))
    .query(async ({ input }) => {
      const conditions = [];
      if (input.cluster) conditions.push(eq(keywords.cluster, input.cluster));
      if (input.intent) conditions.push(eq(keywords.intent, input.intent));

      return db
        .select()
        .from(keywords)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(keywords.searchVolume))
        .limit(input.limit);
    }),
});
