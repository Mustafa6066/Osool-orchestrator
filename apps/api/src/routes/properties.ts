import { z } from 'zod';
import { router, publicProcedure } from '../lib/trpc.js';
import { db } from '@osool/db';
import { properties, developers } from '@osool/db/schema';
import { eq, and, gte, lte, like, desc, asc, sql } from 'drizzle-orm';

export const propertiesRouter = router({
  list: publicProcedure
    .input(z.object({
      developerId: z.string().optional(),
      location: z.string().optional(),
      propertyType: z.string().optional(),
      priceMin: z.number().optional(),
      priceMax: z.number().optional(),
      bedrooms: z.number().optional(),
      limit: z.number().min(1).max(100).default(20),
      offset: z.number().min(0).default(0),
      sortBy: z.enum(['price_asc', 'price_desc', 'newest']).default('newest'),
    }))
    .query(async ({ input }) => {
      const conditions = [eq(properties.active, true)];

      if (input.developerId) conditions.push(eq(properties.developerId, input.developerId));
      if (input.location) conditions.push(like(properties.location, `%${input.location}%`));
      if (input.propertyType) conditions.push(eq(properties.propertyType, input.propertyType));
      if (input.priceMin) conditions.push(gte(properties.priceMin, String(input.priceMin)));
      if (input.priceMax) conditions.push(lte(properties.priceMax, String(input.priceMax)));
      if (input.bedrooms) conditions.push(eq(properties.bedrooms, input.bedrooms));

      const orderBy = input.sortBy === 'price_asc'
        ? asc(properties.priceMin)
        : input.sortBy === 'price_desc'
          ? desc(properties.priceMax)
          : desc(properties.createdAt);

      const results = await db
        .select()
        .from(properties)
        .where(and(...conditions))
        .orderBy(orderBy)
        .limit(input.limit)
        .offset(input.offset);

      const [{ total }] = await db
        .select({ total: sql<number>`count(*)` })
        .from(properties)
        .where(and(...conditions));

      return { items: results, total: Number(total) };
    }),

  getBySlug: publicProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ input }) => {
      const [property] = await db
        .select()
        .from(properties)
        .where(eq(properties.slug, input.slug))
        .limit(1);
      return property ?? null;
    }),

  getDevelopers: publicProcedure.query(async () => {
    return db.select().from(developers).orderBy(asc(developers.name));
  }),

  getDeveloperBySlug: publicProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ input }) => {
      const [dev] = await db
        .select()
        .from(developers)
        .where(eq(developers.slug, input.slug))
        .limit(1);
      return dev ?? null;
    }),
});
