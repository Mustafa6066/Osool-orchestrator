import { pgTable, uuid, text, timestamp, varchar, integer, numeric, jsonb, index, boolean } from 'drizzle-orm/pg-core';

export const keywords = pgTable('keywords', {
  id: uuid('id').primaryKey().defaultRandom(),
  keyword: varchar('keyword', { length: 500 }).notNull(),
  keywordAr: varchar('keyword_ar', { length: 500 }),
  slug: varchar('slug', { length: 500 }).unique().notNull(),
  cluster: varchar('cluster', { length: 200 }),
  searchVolume: integer('search_volume').default(0),
  difficulty: integer('difficulty').default(0),
  cpcEgp: numeric('cpc_egp', { precision: 10, scale: 2 }),
  intent: varchar('intent', { length: 50 }),
  language: varchar('language', { length: 5 }).default('en'),
  lastUpdated: timestamp('last_updated', { withTimezone: true }).defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_keywords_cluster').on(table.cluster),
  index('idx_keywords_intent').on(table.intent),
]);

export const seoPages = pgTable('seo_pages', {
  id: uuid('id').primaryKey().defaultRandom(),
  path: varchar('path', { length: 1000 }).unique().notNull(),
  locale: varchar('locale', { length: 5 }).default('en').notNull(),
  title: varchar('title', { length: 500 }).notNull(),
  metaDescription: text('meta_description'),
  h1: varchar('h1', { length: 500 }),
  content: text('content'),
  pageType: varchar('page_type', { length: 100 }).notNull(),
  keywordId: uuid('keyword_id').references(() => keywords.id),
  schemaMarkup: jsonb('schema_markup').$type<Record<string, unknown>>(),
  published: boolean('published').default(false),
  indexable: boolean('indexable').default(true),
  chatConversionRate: numeric('chat_conversion_rate', { precision: 5, scale: 2 }).default('0'),
  impressions: integer('impressions').default(0),
  lastRegenerated: timestamp('last_regenerated', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_seo_pages_path').on(table.path),
  index('idx_seo_pages_type').on(table.pageType),
]);

/**
 * AI-generated SEO content store — keyed by (pageType + slug + locale).
 * Stores multiple versions; the latest version is used for display.
 */
export const seoContent = pgTable('seo_content', {
  id: uuid('id').primaryKey().defaultRandom(),
  pageType: varchar('page_type', { length: 100 }).notNull(), // 'comparison' | 'roi' | 'project' | 'guide'
  slug: varchar('slug', { length: 500 }).notNull(),
  locale: varchar('locale', { length: 5 }).default('en').notNull(),
  version: integer('version').default(1).notNull(),
  title: varchar('title', { length: 500 }).notNull(),
  metaDescription: text('meta_description'),
  description: text('description'),
  h1: varchar('h1', { length: 500 }),
  body: text('body').notNull(),
  schemaMarkup: jsonb('schema_markup').$type<Record<string, unknown>>(),
  generationPromptKey: varchar('generation_prompt_key', { length: 255 }), // For audit/debugging
  wordCount: integer('word_count').default(0),
  status: varchar('status', { length: 50 }).default('draft').notNull(), // 'draft' | 'published' | 'archived' | 'needs_review'
  publishedAt: timestamp('published_at', { withTimezone: true }),

  /** Quality gate scoring — populated by expert panel service */
  qualityScore: integer('quality_score'), // 0-100, null = not scored yet
  qualityRounds: jsonb('quality_rounds').$type<{
    round: number;
    scores: { expert: string; score: number; feedback: string }[];
    avgScore: number;
    weaknesses: string[];
    revisedAt: string;
  }[]>(),
  qualityStatus: varchar('quality_status', { length: 50 }), // 'pending' | 'scoring' | 'passed' | 'failed' | 'needs_review'

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_seo_content_type_slug').on(table.pageType, table.slug),
  index('idx_seo_content_locale').on(table.locale),
  index('idx_seo_content_status').on(table.status),
]);
