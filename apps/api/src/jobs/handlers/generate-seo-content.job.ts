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
import { getContentQualityGateQueue, type SEOContentGenJobData } from '../queue.js';

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

  const validPageTypes = ['developer_profile', 'location_guide', 'developer_comparison', 'roi_analysis', 'buying_guide'] as const;
  type ValidPageType = typeof validPageTypes[number];

  if (!validPageTypes.includes(pageType as ValidPageType)) {
    throw new Error(`Invalid pageType: ${pageType}. Must be one of: ${validPageTypes.join(', ')}`);
  }

  // Generate via Claude
  const generated = await generateSEOPage({
    pageType: pageType as ValidPageType,
    entityId,
    entityIds,
    locale,
  });

  // Upsert into seoContent table
  const existing = await db
    .select({ id: seoContent.id })
    .from(seoContent)
    .where(and(eq(seoContent.pageType, pageType), eq(seoContent.slug, slug), eq(seoContent.locale, locale)));

  let contentId: string;

  if (existing.length > 0) {
    contentId = existing[0].id;
    await db
      .update(seoContent)
      .set({
        title: generated.title,
        metaDescription: generated.metaDescription,
        description: generated.metaDescription,
        h1: generated.h1,
        body: generated.content,
        schemaMarkup: generated.schemaMarkup,
        status: 'draft',
        qualityStatus: 'pending',
        version: 1,
        updatedAt: new Date(),
      })
      .where(and(eq(seoContent.pageType, pageType), eq(seoContent.slug, slug), eq(seoContent.locale, locale)));
  } else {
    const [inserted] = await db.insert(seoContent).values({
      pageType,
      slug,
      locale,
      title: generated.title,
      metaDescription: generated.metaDescription,
      description: generated.metaDescription,
      h1: generated.h1,
      body: generated.content,
      schemaMarkup: generated.schemaMarkup,
      status: 'draft',
      qualityStatus: 'pending',
      version: 1,
    }).returning({ id: seoContent.id });
    contentId = inserted.id;
  }

  // Chain to quality gate — expert panel scores before publishing
  const qualityQ = getContentQualityGateQueue();
  await qualityQ.add(`quality-${contentId}`, {
    seoContentId: contentId,
    contentType: pageType,
    locale,
  });

  return { generated: true, slug };
}
