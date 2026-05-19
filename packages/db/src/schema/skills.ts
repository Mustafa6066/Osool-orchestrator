/**
 * Skills registry schema.
 * Each row is a versioned, toggleable capability fragment for one or more agents.
 */

import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  jsonb,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';

export const skills = pgTable('skills', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 100 }).notNull().unique(),
  version: varchar('version', { length: 20 }).default('1.0.0').notNull(),
  description: text('description'),
  /** Which agent names this skill applies to — e.g. ["chat-agent","outreach"] */
  targetAgents: jsonb('target_agents').$type<string[]>().notNull().default([]),
  enabled: boolean('enabled').default(true).notNull(),
  /** Optional JSON config passed to the skill at runtime */
  config: jsonb('config').$type<Record<string, unknown>>(),
  /** Prompt fragment injected into the agent's system prompt when enabled */
  promptFragment: text('prompt_fragment'),
  /**
   * JSON array of Anthropic-compatible tool definitions.
   * Merged into the agent's tools array when the skill is enabled.
   */
  toolsJson: jsonb('tools_json').$type<
    Array<{
      name: string;
      description: string;
      input_schema: { type: 'object'; properties: Record<string, unknown>; required?: string[] };
    }>
  >(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_skills_enabled').on(table.enabled),
  index('idx_skills_name').on(table.name),
]);
