/**
 * Outreach schema — contacts, campaigns, and touchpoints for the outreach agent.
 * Populated by Agent-Reach channels (RSS, web, Twitter, YouTube, LinkedIn-public).
 */

import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  integer,
  jsonb,
  boolean,
  index,
} from 'drizzle-orm/pg-core';

// ── Contacts discovered via reach channels ────────────────────────────────────

export const contacts = pgTable('contacts', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** Platform-native user/post ID */
  externalId: varchar('external_id', { length: 255 }),
  /** Source platform: twitter | linkedin | youtube | rss | web */
  platform: varchar('platform', { length: 50 }).notNull(),
  handle: varchar('handle', { length: 255 }),
  name: varchar('name', { length: 255 }),
  /**
   * Source qualifier — IMPORTANT for LinkedIn compliance.
   * Always 'linkedin-public' for LinkedIn contacts (public search only via Jina).
   */
  source: varchar('source', { length: 100 }),
  /** Raw enrichment data from the channel (profile bio, post text, etc.) */
  enrichment: jsonb('enrichment').$type<Record<string, unknown>>(),
  /** ICP segment classification */
  icpSegment: varchar('icp_segment', { length: 50 }),
  /** Lead quality score 0-100 */
  score: integer('score').default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('idx_contacts_platform').on(table.platform),
  index('idx_contacts_segment').on(table.icpSegment),
  index('idx_contacts_score').on(table.score),
  index('idx_contacts_external').on(table.platform, table.externalId),
]);

// ── Outreach campaigns ────────────────────────────────────────────────────────

export const outreachCampaigns = pgTable('outreach_campaigns', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  /** Which channels to use in this campaign (e.g. ["rss","twitter"]) */
  channelMix: jsonb('channel_mix').$type<string[]>().notNull(),
  targetSegment: varchar('target_segment', { length: 50 }),
  /** draft | active | paused | completed */
  status: varchar('status', { length: 20 }).default('draft').notNull(),
  active: boolean('active').default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// ── Touchpoints — individual outreach events ──────────────────────────────────

export const outreachTouchpoints = pgTable('outreach_touchpoints', {
  id: uuid('id').primaryKey().defaultRandom(),
  campaignId: uuid('campaign_id').references(() => outreachCampaigns.id, { onDelete: 'cascade' }).notNull(),
  contactId: uuid('contact_id').references(() => contacts.id, { onDelete: 'cascade' }).notNull(),
  /** Channel used for this touchpoint */
  channel: varchar('channel', { length: 50 }).notNull(),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  /** Any response or interaction data */
  response: jsonb('response').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_touchpoints_campaign').on(table.campaignId),
  index('idx_touchpoints_contact').on(table.contactId),
]);
