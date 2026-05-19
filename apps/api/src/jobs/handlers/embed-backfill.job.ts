/**
 * embed-backfill.job.ts
 *
 * Backfills missing pgvector embeddings for properties and/or seoContent.
 * Runs nightly or on-demand. Uses Redis locks to prevent overlap.
 *
 * Job deduplication ensures only one backfill runs at a time.
 */

import {
  backfillPropertyEmbeddings,
  backfillSEOEmbeddings,
} from '../../services/embeddings.service.js';
import type { EmbedBackfillJobData } from '../queue.js';

export async function runEmbedBackfill(data: EmbedBackfillJobData): Promise<{
  properties: { done: number; failed: number } | null;
  seo: { done: number; failed: number } | null;
}> {
  const entity = data.entity ?? 'all';
  const limit = data.limit ?? 100;

  const propertiesResult =
    entity === 'properties' || entity === 'all'
      ? await backfillPropertyEmbeddings(limit)
      : null;

  const seoResult =
    entity === 'seo' || entity === 'all'
      ? await backfillSEOEmbeddings(Math.min(limit, 50))
      : null;

  return { properties: propertiesResult, seo: seoResult };
}
