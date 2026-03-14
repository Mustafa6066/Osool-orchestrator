import { pgTable, uuid, text, timestamp, varchar, integer, jsonb, index } from 'drizzle-orm/pg-core';
import { users } from './users.js';

export const chatSessions = pgTable('chat_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id),
  visitorId: varchar('visitor_id', { length: 255 }),
  icpSegment: varchar('icp_segment', { length: 50 }),
  language: varchar('language', { length: 5 }).default('en'),
  messageCount: integer('message_count').default(0),
  leadScore: integer('lead_score').default(0),
  summary: text('summary'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
  lastMessageAt: timestamp('last_message_at', { withTimezone: true }).defaultNow(),
  endedAt: timestamp('ended_at', { withTimezone: true }),
}, (table) => [
  index('idx_chat_sessions_user').on(table.userId),
  index('idx_chat_sessions_visitor').on(table.visitorId),
  index('idx_chat_sessions_score').on(table.leadScore),
]);

export const chatMessages = pgTable('chat_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id').references(() => chatSessions.id, { onDelete: 'cascade' }).notNull(),
  role: varchar('role', { length: 20 }).notNull(),
  content: text('content').notNull(),
  toolCalls: jsonb('tool_calls').$type<Array<{ name: string; args: Record<string, unknown>; result?: unknown }>>(),
  intentType: varchar('intent_type', { length: 50 }),
  intentEntities: jsonb('intent_entities').$type<Record<string, unknown>>(),
  tokensUsed: integer('tokens_used'),
  latencyMs: integer('latency_ms'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_chat_messages_session').on(table.sessionId),
]);
