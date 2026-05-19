import type Anthropic from '@anthropic-ai/sdk';

export interface LLMCallOptions {
  model: string;
  maxTokens?: number;
  /**
   * System prompt — can be a plain string or an array of blocks where each
   * block can be marked `cacheable: true` to receive `cache_control: ephemeral`.
   */
  system?: string | Array<{ text: string; cacheable?: boolean }>;
  /** Whether to cache the entire string system prompt. */
  cacheable?: boolean;
  messages: Array<{ role: 'user' | 'assistant'; content: string | Anthropic.ContentBlock[] }>;
  tools?: Array<{
    name: string;
    description: string;
    input_schema: { type: 'object'; properties: Record<string, unknown>; required?: string[] };
  }>;
  toolChoice?: { type: 'auto' | 'any' | 'tool'; name?: string };
  /** Label for Langfuse trace */
  traceLabel?: string;
  agentName?: string;
  operation?: string;
  tags?: string[];
}

export interface LLMResponse {
  content: Anthropic.ContentBlock[];
  stopReason: string;
  usage: {
    tokensIn: number;
    tokensOut: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
  };
  latencyMs: number;
  traceId?: string;
}

export interface TracedMessage {
  role: 'user' | 'assistant';
  content: string;
}
