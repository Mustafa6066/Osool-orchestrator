/**
 * quality-gate.job.ts
 *
 * Runs the expert panel quality gate on AI-generated SEO content.
 * Scores content → revises if needed → auto-publishes if ≥ 90 or flags for review.
 */

import { db } from '@osool/db';
import { seoContent } from '@osool/db/schema';
import { eq } from 'drizzle-orm';
import { runExpertPanel } from '../../services/expert-panel.service.js';
import type { ContentQualityGateJobData } from '../queue.js';

export async function runQualityGate(
  data: ContentQualityGateJobData,
): Promise<{ passed: boolean; score: number; rounds: number }> {
  const { seoContentId, contentType, locale = 'en', maxRounds = 3 } = data;

  // Fetch the content to score
  const [content] = await db
    .select()
    .from(seoContent)
    .where(eq(seoContent.id, seoContentId));

  if (!content) {
    throw new Error(`SEO content not found: ${seoContentId}`);
  }

  // Mark as scoring
  await db
    .update(seoContent)
    .set({ qualityStatus: 'scoring', updatedAt: new Date() })
    .where(eq(seoContent.id, seoContentId));

  // Build full content string for scoring
  const fullContent = [
    `Title: ${content.title}`,
    `Meta Description: ${content.metaDescription ?? ''}`,
    `H1: ${content.h1 ?? ''}`,
    '',
    content.body,
  ].join('\n');

  // Run expert panel
  const result = await runExpertPanel(fullContent, contentType, locale, maxRounds);

  // Update content record with quality results
  const updateData: Record<string, unknown> = {
    qualityScore: result.finalScore,
    qualityRounds: result.rounds,
    updatedAt: new Date(),
  };

  if (result.passed) {
    // Auto-publish if quality gate passes
    updateData.qualityStatus = 'passed';
    updateData.status = 'published';
    updateData.publishedAt = new Date();

    // If content was revised, update the body
    if (result.revisedContent) {
      updateData.body = result.revisedContent;
    }
  } else {
    // Flag for manual review
    updateData.qualityStatus = 'needs_review';
    updateData.status = 'needs_review';
  }

  await db
    .update(seoContent)
    .set(updateData)
    .where(eq(seoContent.id, seoContentId));

  return {
    passed: result.passed,
    score: result.finalScore,
    rounds: result.rounds.length,
  };
}
