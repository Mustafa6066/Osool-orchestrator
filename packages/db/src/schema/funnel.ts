import { pgTable, uuid, text, timestamp, varchar, integer, jsonb, boolean, index } from 'drizzle-orm/pg-core';
import { users } from './users';

export const funnelEvents = pgTable('funnel_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id),
  visitorId: varchar('visitor_id', { length: 255 }),
  sessionId: varchar('session_id', { length: 255 }),
  event: varchar('event', { length: 100 }).notNull(),
  stage: varchar('stage', { length: 50 }).notNull(),
  properties: jsonb('properties').$type<Record<string, unknown>>(),
  source: varchar('source', { length: 100 }),
  medium: varchar('medium', { length: 100 }),
  campaign: varchar('campaign', { length: 255 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_funnel_events_user').on(table.userId),
  index('idx_funnel_events_visitor').on(table.visitorId),
  index('idx_funnel_events_stage').on(table.stage),
  index('idx_funnel_events_event').on(table.event),
  index('idx_funnel_events_created').on(table.createdAt),
]);

export const emailSequences = pgTable('email_sequences', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 500 }).notNull(),
  tier: varchar('tier', { length: 50 }), // 'welcome' | 'nurture' | 'warm' | 'hot'
  icpSegment: varchar('icp_segment', { length: 50 }),
  triggerScore: integer('trigger_score').default(60),
  steps: jsonb('steps').$type<Array<{
    delayHours: number;
    subject: string;
    subjectAr?: string;
    templateId: string;
    channel: 'email' | 'whatsapp';
  }>>().default([]),
  active: boolean('active').default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const emailSends = pgTable('email_sends', {
  id: uuid('id').primaryKey().defaultRandom(),
  sequenceId: uuid('sequence_id').references(() => emailSequences.id),
  userId: uuid('user_id').references(() => users.id),
  email: varchar('email', { length: 320 }).notNull(),
  subject: varchar('subject', { length: 1000 }),
  stepIndex: integer('step_index').default(0),
  stepNumber: integer('step_number').default(1),
  status: varchar('status', { length: 50 }).default('pending').notNull(),
  resendMessageId: varchar('resend_message_id', { length: 255 }),
  externalId: varchar('external_id', { length: 255 }), // alias for resendMessageId
  error: text('error'),
  openedAt: timestamp('opened_at', { withTimezone: true }),
  clickedAt: timestamp('clicked_at', { withTimezone: true }),
  bouncedAt: timestamp('bounced_at', { withTimezone: true }),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_email_sends_user').on(table.userId),
  index('idx_email_sends_status').on(table.status),
]);

export const waitlist = pgTable('waitlist', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id),
  email: varchar('email', { length: 320 }).notNull(),
  name: varchar('name', { length: 255 }),
  phone: varchar('phone', { length: 50 }),
  source: varchar('source', { length: 100 }),
  icpSegment: varchar('icp_segment', { length: 50 }),
  leadScore: integer('lead_score'),
  preferredLocations: jsonb('preferred_locations').$type<string[]>().default([]),
  budgetRange: jsonb('budget_range').$type<{ min: number; max: number }>(),
  notes: text('notes'),
  status: varchar('status', { length: 50 }).default('active').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_waitlist_email').on(table.email),
  index('idx_waitlist_score').on(table.leadScore),
]);

export const feedbackLoopEvents = pgTable('feedback_loop_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  source: varchar('source', { length: 50 }).notNull().default('system'),
  eventType: varchar('event_type', { length: 100 }).notNull().default('loop_run'),
  loopType: varchar('loop_type', { length: 100 }),
  entityId: varchar('entity_id', { length: 255 }),
  entityType: varchar('entity_type', { length: 100 }),
  actionsTriggered: integer('actions_triggered').default(0),
  data: jsonb('data').$type<Record<string, unknown>>(),
  summary: jsonb('summary').$type<Record<string, unknown>>(),
  processedAt: timestamp('processed_at', { withTimezone: true }),
  runAt: timestamp('run_at', { withTimezone: true }).defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_feedback_source').on(table.source),
  index('idx_feedback_event_type').on(table.eventType),
]);

export const intentSignals = pgTable('intent_signals', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: varchar('session_id', { length: 255 }),
  visitorId: varchar('visitor_id', { length: 255 }),
  anonymousId: varchar('anonymous_id', { length: 255 }),
  userId: uuid('user_id').references(() => users.id),
  intentType: varchar('intent_type', { length: 50 }).notNull(),
  confidence: integer('confidence').default(50),
  entities: jsonb('entities').$type<Record<string, unknown>>(),
  segment: varchar('segment', { length: 50 }),
  rawQuery: text('raw_query'),
  message: text('message'),
  pageContext: jsonb('page_context').$type<Record<string, unknown>>(),
  source: varchar('source', { length: 100 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_intent_visitor').on(table.visitorId),
  index('idx_intent_session').on(table.sessionId),
  index('idx_intent_type').on(table.intentType),
]);
