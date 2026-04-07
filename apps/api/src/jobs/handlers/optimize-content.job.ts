/**
 * optimize-content.job.ts
 *
 * Runs evolutionary content optimization on an existing SEO content draft.
 * Optimizes headline, meta description, H1, and intro paragraph.
 */

import { db } from '@osool/db';
import { seoContent } from '@osool/db/schema';
import { eq } from 'drizzle-orm';
import { optimizeElement } from '../../services/content-optimizer.service.js';
import type { ContentOptimizationJobData } from '../queue.js';

const DEFAULT_ELEMENTS = ['headline', 'meta', 'h1'];

export async function optimizeContent(
  data: ContentOptimizationJobData,
): Promise<{ optimized: boolean; improvements: Record<string, number> }> {
  const { seoContentId, elements = DEFAULT_ELEMENTS, maxRounds = 3 } = data;

  const [content] = await db
    .select()
    .from(seoContent)
    .where(eq(seoContent.id, seoContentId));

  if (!content) {
    throw new Error(`SEO content not found: ${seoContentId}`);
  }

  const improvements: Record<string, number> = {};
  const updates: Record<string, unknown> = { updatedAt: new Date() };

  for (const element of elements) {
    let original: string | null = null;
    let field: string | null = null;

    switch (element) {
      case 'headline':
      case 'title':
        original = content.title;
        field = 'title';
        break;
      case 'meta':
      case 'meta_description':
        original = content.metaDescription;
        field = 'metaDescription';
        break;
      case 'h1':
        original = content.h1;
        field = 'h1';
        break;
    }

    if (!original || !field) continue;

    const result = await optimizeElement(original, element, content.pageType, maxRounds);

    if (result.improvement > 0) {
      updates[field] = result.optimized;
      improvements[element] = Math.round(result.improvement);
    }
  }

  // Apply optimized content
  if (Object.keys(improvements).length > 0) {
    await db
      .update(seoContent)
      .set(updates)
      .where(eq(seoContent.id, seoContentId));
  }

  return {
    optimized: Object.keys(improvements).length > 0,
    improvements,
  };
}
