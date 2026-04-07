/**
 * LLM Cost Tracker — logs every LLM API call for cost monitoring and budget control.
 *
 * Inspired by Repowise's `repowise costs --by operation --by model --by day`.
 *
 * Usage:
 *   import { trackLLMCost, getLLMCostSummary } from './llm-cost-tracker.js';
 *   await trackLLMCost({
 *     model: 'claude-sonnet-4-20250514',
 *     provider: 'anthropic',
 *     operation: 'consensus-synthesis',
 *     agentName: 'valuation-v1',
 *     tokensIn: 1200,
 *     tokensOut: 450,
 *     durationMs: 2300,
 *   });
 */

import { db } from '@osool/db';
import { llmCostLog } from '@osool/db/schema';
import { sql, gte, and } from 'drizzle-orm';
import type { LLMCostLogEntry } from '@osool/shared';

// ── Pricing per 1M tokens (USD) — updated as of 2025 ───────────────────────────

const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  // Anthropic
  'claude-sonnet-4-20250514': { input: 3.0, output: 15.0 },
  'claude-sonnet-4-5-20250929': { input: 3.0, output: 15.0 },
  'claude-haiku-3-5-20241022': { input: 0.8, output: 4.0 },
  'claude-opus-4-20250514': { input: 15.0, output: 75.0 },
  // OpenAI
  'gpt-4o': { input: 2.5, output: 10.0 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gpt-4-turbo': { input: 10.0, output: 30.0 },
  // Ollama (local — free)
  'llama3': { input: 0, output: 0 },
  'mixtral': { input: 0, output: 0 },
};

/** Calculate cost in USD for a given model + token count. */
function calculateCost(model: string, tokensIn: number, tokensOut: number): number {
  // Find pricing by prefix match (model versions may differ slightly)
  const pricing = Object.entries(MODEL_PRICING).find(([key]) => model.includes(key));
  if (!pricing) return 0;

  const [, rates] = pricing;
  return (tokensIn * rates.input + tokensOut * rates.output) / 1_000_000;
}

/** Track a single LLM API call. */
export async function trackLLMCost(entry: Omit<LLMCostLogEntry, 'timestamp' | 'costUsd'> & { sessionId?: string }): Promise<void> {
  const costUsd = calculateCost(entry.model, entry.tokensIn, entry.tokensOut);

  await db.insert(llmCostLog).values({
    model: entry.model,
    provider: entry.provider,
    operation: entry.operation,
    agentName: entry.agentName,
    sessionId: entry.sessionId,
    tokensIn: entry.tokensIn,
    tokensOut: entry.tokensOut,
    costUsd,
    durationMs: entry.durationMs,
  });
}

/** Get cost summary by day, model, operation, or agent. */
export async function getLLMCostSummary(
  groupBy: 'day' | 'model' | 'operation' | 'agent',
  days: number = 7,
): Promise<Array<{ label: string; totalCost: number; totalTokensIn: number; totalTokensOut: number; callCount: number }>> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const groupColumn = {
    day: sql`DATE(${llmCostLog.createdAt})`,
    model: llmCostLog.model,
    operation: llmCostLog.operation,
    agent: llmCostLog.agentName,
  }[groupBy];

  const results = await db
    .select({
      label: sql<string>`COALESCE(CAST(${groupColumn} AS TEXT), 'unknown')`,
      totalCost: sql<number>`COALESCE(SUM(${llmCostLog.costUsd}), 0)`,
      totalTokensIn: sql<number>`COALESCE(SUM(${llmCostLog.tokensIn}), 0)`,
      totalTokensOut: sql<number>`COALESCE(SUM(${llmCostLog.tokensOut}), 0)`,
      callCount: sql<number>`COUNT(*)`,
    })
    .from(llmCostLog)
    .where(gte(llmCostLog.createdAt, since))
    .groupBy(groupColumn)
    .orderBy(sql`COALESCE(SUM(${llmCostLog.costUsd}), 0) DESC`);

  return results;
}

/** Get total cost for current billing period (month). */
export async function getMonthlyTotal(): Promise<{ totalCost: number; totalCalls: number; totalTokens: number }> {
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const [result] = await db
    .select({
      totalCost: sql<number>`COALESCE(SUM(${llmCostLog.costUsd}), 0)`,
      totalCalls: sql<number>`COUNT(*)`,
      totalTokens: sql<number>`COALESCE(SUM(${llmCostLog.tokensIn} + ${llmCostLog.tokensOut}), 0)`,
    })
    .from(llmCostLog)
    .where(gte(llmCostLog.createdAt, startOfMonth));

  return result ?? { totalCost: 0, totalCalls: 0, totalTokens: 0 };
}
