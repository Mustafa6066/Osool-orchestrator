import { pgTable, uuid, varchar, text, timestamp, integer, jsonb, index } from 'drizzle-orm/pg-core';

/**
 * Marketing experiment table — A/B test any channel variable
 * (email subjects, SEO page formats, chat prompts, ad creatives)
 * with real statistics: bootstrap confidence intervals + Mann-Whitney U.
 */
export const experiments = pgTable('experiments', {
  id: uuid('id').primaryKey().defaultRandom(),

  /** Channel or agent that owns this experiment */
  agent: varchar('agent', { length: 100 }).notNull(), // 'seo' | 'email' | 'chat' | 'ads'

  /** Human-readable hypothesis */
  hypothesis: text('hypothesis').notNull(),

  /** Variable being tested (e.g. "email_subject_line", "cta_text", "meta_description_format") */
  variable: varchar('variable', { length: 255 }).notNull(),

  /** Variant definitions: [{ name: "A", config: {...} }, { name: "B", config: {...} }] */
  variants: jsonb('variants').$type<{ name: string; config: Record<string, unknown> }[]>().notNull(),

  /** Primary metric to optimize: "ctr", "open_rate", "conversion", "engagement", "bounce_rate" */
  primaryMetric: varchar('primary_metric', { length: 100 }).notNull(),

  /** Hours per scoring cycle */
  cycleHours: integer('cycle_hours').default(24).notNull(),

  /** Minimum data points per variant before scoring */
  minSamples: integer('min_samples').default(30).notNull(),

  /** Experiment status flow: running → trending → keep | discard */
  status: varchar('status', { length: 50 }).default('running').notNull(),

  /** Baseline variant name */
  baselineVariant: varchar('baseline_variant', { length: 100 }),

  /** Winning variant name (set when status = 'keep') */
  winner: varchar('winner', { length: 100 }),

  /** Statistical result from last scoring: { pValue, liftCI, mannWhitneyU, significant } */
  result: jsonb('result').$type<{
    pValue: number;
    liftPercent: number;
    liftCILower: number;
    liftCIUpper: number;
    mannWhitneyU: number;
    significant: boolean;
    scoredAt: string;
  }>(),

  /** Raw data points: [{ variant, metric, value, ts }] */
  dataPoints: jsonb('data_points').$type<{
    variant: string;
    metric: string;
    value: number;
    ts: string;
  }[]>().default([]),

  /** Proven playbook entry (set when experiment is kept) */
  playbook: jsonb('playbook').$type<{
    variable: string;
    bestPractice: string;
    liftPercent: number;
    confidence: number;
    adoptedAt: string;
  }>(),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_experiments_agent').on(table.agent),
  index('idx_experiments_status').on(table.status),
  index('idx_experiments_variable').on(table.variable),
]);
