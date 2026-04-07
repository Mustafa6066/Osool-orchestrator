import { pgTable, uuid, text, timestamp, varchar, integer, jsonb, real, index } from 'drizzle-orm/pg-core';
import { chatSessions } from './chat.js';

/**
 * Reasoning chains — persists the structured reasoning from the Consensus Router.
 * Each row captures one multi-agent consensus execution for audit, quality monitoring,
 * and the admin "why did the AI say this?" trace (inspired by Repowise's get_why()).
 */
export const reasoningChains = pgTable('reasoning_chains', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id').references(() => chatSessions.id, { onDelete: 'cascade' }).notNull(),
  query: text('query').notNull(),
  locale: varchar('locale', { length: 5 }).default('en').notNull(),

  /** JSON array of agent names that contributed */
  agentNames: jsonb('agent_names').$type<string[]>().notNull(),

  /** Full reasoning chain per agent: { [agentName]: ReasoningStep[] } */
  chains: jsonb('chains').$type<Record<string, Array<{
    stepName: string;
    thought: string;
    evidence: string[];
    conclusion: string;
    confidence: number;
  }>>>().notNull(),

  /** Weighted consensus confidence (0.0–1.0) */
  confidenceScore: real('confidence_score').notNull(),

  /** Final synthesized response text */
  synthesizedResponse: text('synthesized_response'),

  /** Total tokens consumed by all agents + synthesis */
  totalTokensIn: integer('total_tokens_in').default(0),
  totalTokensOut: integer('total_tokens_out').default(0),

  /** Total latency in milliseconds */
  latencyMs: integer('latency_ms'),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_reasoning_chains_session').on(table.sessionId),
  index('idx_reasoning_chains_created').on(table.createdAt),
]);

/**
 * LLM cost log — tracks every LLM API call across all agents for cost monitoring.
 * Inspired by Repowise's `repowise costs --by operation --by model --by day`.
 */
export const llmCostLog = pgTable('llm_cost_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  model: varchar('model', { length: 100 }).notNull(),
  provider: varchar('provider', { length: 20 }).notNull(), // 'anthropic' | 'openai' | 'ollama'
  operation: varchar('operation', { length: 100 }).notNull(), // e.g., 'consensus-synthesis', 'seo-gen', 'valuation'
  agentName: varchar('agent_name', { length: 100 }),
  sessionId: uuid('session_id'),
  tokensIn: integer('tokens_in').notNull().default(0),
  tokensOut: integer('tokens_out').notNull().default(0),
  costUsd: real('cost_usd').notNull().default(0),
  durationMs: integer('duration_ms'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_llm_cost_log_created').on(table.createdAt),
  index('idx_llm_cost_log_agent').on(table.agentName),
  index('idx_llm_cost_log_operation').on(table.operation),
]);
