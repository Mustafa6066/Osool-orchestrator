/**
 * generate-seo-content.job.ts
 *
 * Generates AI content for an SEO page and stores it in the seoContent table.
 * Skips generation if published content already exists (unless forceRegenerate).
 */

import { db } from '@osool/db';
import { seoContent } from '@osool/db/schema';
import { eq, and } from 'drizzle-orm';
import { generateSEOPage } from '../../agents/seo-agent.js';
import type { SEOContentGenJobData } from '../queue.js';

export async function generateSEOContent(data: SEOContentGenJobData): Promise<{ generated: boolean; slug: string }> {
  const { pageType, locale, entityId, entityIds, forceRegenerate } = data;
  const slug = data.slug ?? `${pageType}-${entityId ?? 'general'}`;

  // Check if published content already exists
  if (!forceRegenerate) {
    const [existing] = await db
      .select({ id: seoContent.id })
      .from(seoContent)
      .where(
        and(
          eq(seoContent.pageType, pageType),
          eq(seoContent.slug, slug),
          eq(seoContent.locale, locale),
          eq(seoContent.status, 'published'),
        ),
      );

    if (existing) {
      return { generated: false, slug };
    }
  }

  // Generate via Claude
  const generated = await generateSEOPage({
    pageType: pageType as 'developer_profile' | 'location_guide' | 'developer_comparison' | 'roi_analysis' | 'buying_guide',
    entityId,
    entityIds,
    locale,
  });

  // Upsert into seoContent table
  const existing = await db
    .select({ id: seoContent.id })
    .from(seoContent)
    .where(and(eq(seoContent.pageType, pageType), eq(seoContent.slug, slug), eq(seoContent.locale, locale)));

  if (existing.length > 0) {
    await db
      .update(seoContent)
      .set({
        title: generated.title,
        metaDescription: generated.metaDescription,
        description: generated.metaDescription,
        h1: generated.h1,
        body: generated.content,
        schemaMarkup: generated.schemaMarkup,
        status: 'published',
        version: 1,
        updatedAt: new Date(),
      })
      .where(and(eq(seoContent.pageType, pageType), eq(seoContent.slug, slug), eq(seoContent.locale, locale)));
  } else {
    await db.insert(seoContent).values({
      pageType,
      slug,
      locale,
      title: generated.title,
      metaDescription: generated.metaDescription,
      description: generated.metaDescription,
      h1: generated.h1,
      body: generated.content,
      schemaMarkup: generated.schemaMarkup,
      status: 'published',
      version: 1,
    });
  }

  return { generated: true, slug };
}
