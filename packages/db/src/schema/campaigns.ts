import { pgTable, uuid, text, timestamp, varchar, numeric, integer, jsonb, boolean, index } from 'drizzle-orm/pg-core';

export const campaigns = pgTable('campaigns', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 500 }).notNull(),
  platform: varchar('platform', { length: 50 }).notNull(),
  externalId: varchar('external_id', { length: 255 }),
  status: varchar('status', { length: 50 }).default('draft').notNull(),
  objective: varchar('objective', { length: 100 }),
  icpSegment: varchar('icp_segment', { length: 50 }),
  budgetDaily: numeric('budget_daily', { precision: 12, scale: 2 }),
  budgetTotal: numeric('budget_total', { precision: 12, scale: 2 }),
  currency: varchar('currency', { length: 10 }).default('EGP'),
  targeting: jsonb('targeting').$type<Record<string, unknown>>(),
  creativeAssets: jsonb('creative_assets').$type<Array<{ type: string; url: string; headline?: string }>>(),
  startDate: timestamp('start_date', { withTimezone: true }),
  endDate: timestamp('end_date', { withTimezone: true }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_campaigns_platform').on(table.platform),
  index('idx_campaigns_status').on(table.status),
  index('idx_campaigns_segment').on(table.icpSegment),
]);

export const campaignMetrics = pgTable('campaign_metrics', {
  id: uuid('id').primaryKey().defaultRandom(),
  campaignId: uuid('campaign_id').references(() => campaigns.id, { onDelete: 'cascade' }).notNull(),
  date: timestamp('date', { withTimezone: true }).notNull(),
  impressions: integer('impressions').default(0),
  clicks: integer('clicks').default(0),
  conversions: integer('conversions').default(0),
  spend: numeric('spend', { precision: 12, scale: 2 }).default('0'),
  revenue: numeric('revenue', { precision: 12, scale: 2 }).default('0'),
  ctr: numeric('ctr', { precision: 8, scale: 4 }),
  cpc: numeric('cpc', { precision: 10, scale: 2 }),
  cpa: numeric('cpa', { precision: 10, scale: 2 }),
  roas: numeric('roas', { precision: 8, scale: 2 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_campaign_metrics_campaign_date').on(table.campaignId, table.date),
]);

export const retargetingAudiences = pgTable('retargeting_audiences', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 500 }).notNull(),
  audienceName: varchar('audience_name', { length: 500 }),
  platform: varchar('platform', { length: 50 }).notNull(),
  externalId: varchar('external_id', { length: 255 }),
  platformAudienceId: varchar('platform_audience_id', { length: 255 }),
  segment: varchar('segment', { length: 50 }),
  rules: jsonb('rules').$type<Array<{ field: string; op: string; value: unknown }>>().default([]),
  estimatedSize: integer('estimated_size'),
  memberCount: integer('member_count').default(0),
  active: boolean('active').default(true),
  status: varchar('status', { length: 50 }).default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
