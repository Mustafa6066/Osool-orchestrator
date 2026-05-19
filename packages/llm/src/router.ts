/**
 * Model Router — picks the right Anthropic model based on task type and complexity.
 *
 * Routing rules (from the absorption plan):
 *  - Chat / conversational              → Sonnet
 *  - Intent classification / quick ops  → Haiku
 *  - Synthesis / content quality checks → Opus
 */

export type TaskType =
  | 'chat'
  | 'intent_classify'
  | 'seo_generate'
  | 'content_quality'
  | 'lead_score'
  | 'market_analysis'
  | 'synthesis'
  | 'batch_seo';

export type ComplexityLevel = 'low' | 'medium' | 'high';

export interface ModelPickInput {
  task: TaskType;
  complexity?: ComplexityLevel;
  /** Force a specific model regardless of routing rules */
  override?: string;
}

export interface ModelConfig {
  modelId: string;
  maxTokens: number;
  cacheable: boolean;
}

/**
 * Pick a model ID + config for the given task.
 * Model IDs are resolved from environment variables with hardcoded fallbacks.
 */
export function pickModel(input: ModelPickInput): ModelConfig {
  if (input.override) {
    return { modelId: input.override, maxTokens: 4096, cacheable: false };
  }

  const haiku = process.env.ANTHROPIC_MODEL_HAIKU ?? 'claude-haiku-4-5';
  const sonnet = process.env.ANTHROPIC_MODEL_SONNET ?? 'claude-sonnet-4-20250514';
  const opus = process.env.ANTHROPIC_MODEL_OPUS ?? 'claude-opus-4-5';

  switch (input.task) {
    // Fast, cheap — classification only
    case 'intent_classify':
    case 'lead_score':
      return { modelId: haiku, maxTokens: 512, cacheable: false };

    // Default conversational
    case 'chat':
      return { modelId: sonnet, maxTokens: 2048, cacheable: true };

    // Batch SEO — sonnet is good enough and cheaper
    case 'batch_seo':
    case 'seo_generate':
      return { modelId: sonnet, maxTokens: 4096, cacheable: true };

    // High-quality synthesis and market analysis get Opus
    case 'synthesis':
    case 'market_analysis':
    case 'content_quality':
      return {
        modelId: input.complexity === 'low' ? sonnet : opus,
        maxTokens: 4096,
        cacheable: true,
      };

    default:
      return { modelId: sonnet, maxTokens: 2048, cacheable: false };
  }
}
