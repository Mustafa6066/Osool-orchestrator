import { pgTable, uuid, varchar, text, boolean, timestamp, jsonb, integer } from 'drizzle-orm/pg-core';
import { users } from './users.js';

export const notifications = pgTable('notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  type: varchar('type', { length: 50 }).notNull(), // 'market_pulse' | 'price_drop' | 'new_listing' | 'lead_update'
  title: varchar('title', { length: 255 }).notNull(),
  titleAr: varchar('title_ar', { length: 255 }),
  body: text('body').notNull(),
  bodyAr: text('body_ar'),
  data: jsonb('data').$type<Record<string, unknown>>(), // payload: {developers, locations, priceChange, etc.}
  read: boolean('read').default(false).notNull(),
  priority: integer('priority').default(0).notNull(), // 0=normal, 1=high (hot lead)
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
