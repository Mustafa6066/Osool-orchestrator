import { pgTable, uuid, varchar, text, timestamp, integer, jsonb, index, numeric } from 'drizzle-orm/pg-core';

/**
 * CRO audit results — score Osool landing pages across 8 conversion dimensions.
 * Monitors conversion quality of property listings, area guides, and developer profiles.
 */
export const croAudits = pgTable('cro_audits', {
  id: uuid('id').primaryKey().defaultRandom(),

  /** URL that was audited */
  url: text('url').notNull(),

  /** Page type: 'property_listing' | 'area_guide' | 'developer_profile' | 'comparison' | 'roi_analysis' */
  pageType: varchar('page_type', { length: 100 }).notNull(),

  /** Overall CRO score (0-100) */
  overallScore: integer('overall_score').notNull(),

  /** Per-dimension scores */
  dimensionScores: jsonb('dimension_scores').$type<{
    headlineClarity: number;
    ctaVisibility: number;
    socialProof: number;
    urgency: number;
    trustSignals: number;
    formFriction: number;
    mobileResponsiveness: number;
    pageSpeed: number;
  }>().notNull(),

  /** Detailed findings per dimension */
  findings: jsonb('findings').$type<{
    dimension: string;
    score: number;
    issues: string[];
    recommendations: string[];
  }[]>().notNull(),

  /** Prioritized fixes */
  fixes: jsonb('fixes').$type<{
    priority: 'P0' | 'P1' | 'P2' | 'P3';
    dimension: string;
    description: string;
    expectedLift: string;
  }[]>(),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_cro_audits_page_type').on(table.pageType),
  index('idx_cro_audits_score').on(table.overallScore),
]);
