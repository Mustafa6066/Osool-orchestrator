/**
 * @osool/llm — Central Anthropic client package
 *
 * Provides:
 * - Prompt caching (cache_control: ephemeral on system prompts)
 * - Model routing (Opus / Sonnet / Haiku based on task + complexity)
 * - Batch API accumulator helpers
 * - Langfuse tracing on every call
 * - Cost tracking mirror (llmCostLog table)
 */

export { createLLMClient, type LLMClient } from './client.js';
export { pickModel, type ModelPickInput } from './router.js';
export { BatchAccumulator } from './batch.js';
export type { LLMCallOptions, LLMResponse, TracedMessage } from './types.js';
