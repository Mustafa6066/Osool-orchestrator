/**
 * Memory schema — SQL mirror for MemPalace vectors.
 * MemPalace (ChromaDB) is the source of truth for vectors;
 * this table enables SQL joins for analytics and admin views.
 */

import { pgTable, uuid, varchar, text, timestamp, index } from 'drizzle-orm/pg-core';

export const memoryIndex = pgTable('memory_index', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** MemPalace wing (ICP segment or user-scoped) */
  wing: varchar('wing', { length: 100 }).notNull(),
  /** Intent topic room — pricing | comparison | financing | legal | objections | lead-history */
  room: varchar('room', { length: 50 }).notNull(),
  /** MemPalace drawer ID (ChromaDB document ID) */
  drawerId: varchar('drawer_id', { length: 64 }).notNull().unique(),
  /** The entity type stored in this drawer */
  entityType: varchar('entity_type', { length: 50 }),
  /** Foreign key-like reference (property ID, session ID, etc.) */
  entityId: text('entity_id'),
  /** ICP segment for cross-session recall grouping */
  icpSegment: varchar('icp_segment', { length: 50 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_memory_wing_room').on(table.wing, table.room),
  index('idx_memory_drawer').on(table.drawerId),
  index('idx_memory_entity').on(table.entityType, table.entityId),
  index('idx_memory_segment').on(table.icpSegment),
]);
