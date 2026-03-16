import { pgTable, uuid, text, timestamp, varchar, boolean, jsonb } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  clerkId: varchar('clerk_id', { length: 255 }).unique(),
  platformUserId: varchar('platform_user_id', { length: 255 }).unique(),
  email: varchar('email', { length: 320 }),
  name: varchar('name', { length: 255 }),
  role: varchar('role', { length: 50 }).default('visitor').notNull(),
  icpSegment: varchar('icp_segment', { length: 50 }),
  language: varchar('language', { length: 5 }).default('en'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  emailVerified: boolean('email_verified').default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
