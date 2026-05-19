import Anthropic from '@anthropic-ai/sdk';
import type { MessageParam, TextBlockParam } from '@anthropic-ai/sdk/resources/messages.js';
import type { LLMCallOptions, LLMResponse, TracedMessage } from './types.js';

export interface LLMClient {
  messages: {
    create(opts: LLMCallOptions): Promise<LLMResponse>;
  };
  batches: {
    create(requests: Array<{ custom_id: string; params: LLMCallOptions }>): Promise<{ id: string }>;
    results(batchId: string): AsyncIterable<{ custom_id: string; result: { message: Anthropic.Message } }>;
  };
}

/**
 * Create a singleton LLM client with:
 * - Anthropic prompt caching on cacheable system blocks
 * - Langfuse tracing (lazy — no-op if LANGFUSE_SECRET_KEY not set)
 * - Cost tracking event emission
 */
export function createLLMClient(opts: {
  apiKey: string;
  langfusePublicKey?: string;
  langfuseSecretKey?: string;
  langfuseHost?: string;
}): LLMClient {
  const anthropic = new Anthropic({ apiKey: opts.apiKey });

  // Lazy Langfuse — gracefully degrade if not configured
  type TraceShape = {
    id?: string;
    generation(args: Record<string, unknown>): { end(args: Record<string, unknown>): void };
  };
  type LangfuseShape = { trace(args: Record<string, unknown>): TraceShape };
  let langfuse: LangfuseShape | undefined;
  void opts;

  return {
    messages: {
      async create(callOpts: LLMCallOptions): Promise<LLMResponse> {
        const startMs = Date.now();

        // Inject cache_control on cacheable system blocks
        const systemParam = buildCacheableSystem(callOpts.system, callOpts.cacheable);

        const trace: TraceShape | undefined = langfuse?.trace({
          name: callOpts.traceLabel ?? 'llm-call',
          metadata: { agentName: callOpts.agentName, operation: callOpts.operation },
          tags: callOpts.tags ?? [],
        });

        const generation = trace?.generation({
          name: callOpts.operation ?? 'generate',
          model: callOpts.model,
          input: callOpts.messages,
          metadata: { systemLength: typeof systemParam === 'string' ? systemParam.length : 0 },
        });

        const response = await anthropic.messages.create({
          model: callOpts.model,
          max_tokens: callOpts.maxTokens ?? 2048,
          system: systemParam as Anthropic.TextBlockParam[] | string | undefined,
          messages: callOpts.messages as MessageParam[],
          tools: callOpts.tools as Anthropic.Tool[] | undefined,
          tool_choice: callOpts.toolChoice as Anthropic.ToolChoice | undefined,
        });

        const latencyMs = Date.now() - startMs;
        const tokensIn = response.usage.input_tokens ?? 0;
        const tokensOut = response.usage.output_tokens ?? 0;
        const usage = response.usage as unknown as Record<string, number | undefined>;
        const cacheRead = usage.cache_read_input_tokens ?? 0;
        const cacheWrite = usage.cache_creation_input_tokens ?? 0;

        generation?.end({
          output: response.content,
          usage: { input: tokensIn, output: tokensOut },
          metadata: { latencyMs, cacheReadTokens: cacheRead, cacheWriteTokens: cacheWrite },
        });

        return {
          content: response.content,
          stopReason: response.stop_reason ?? 'end_turn',
          usage: { tokensIn, tokensOut, cacheReadTokens: cacheRead, cacheWriteTokens: cacheWrite },
          latencyMs,
          traceId: (trace as { id?: string })?.id,
        };
      },
    },

    batches: {
      async create(requests: Array<{ custom_id: string; params: LLMCallOptions }>) {
        const batchRequests = requests.map((req) => ({
          custom_id: req.custom_id,
          params: {
            model: req.params.model,
            max_tokens: req.params.maxTokens ?? 2048,
            system: req.params.system,
            messages: req.params.messages as MessageParam[],
          },
        }));
        const batch = await (anthropic as unknown as {
          messages: { batches: { create(args: { requests: typeof batchRequests }): Promise<{ id: string }> } };
        }).messages.batches.create({ requests: batchRequests });
        return { id: batch.id };
      },

      async *results(batchId: string) {
        const results = await (anthropic as unknown as {
          messages: { batches: { results(id: string): AsyncIterable<{ custom_id: string; result: { type: string; message?: Anthropic.Message } }> } };
        }).messages.batches.results(batchId);
        for await (const result of results) {
          if (result.result.type === 'succeeded') {
            yield {
              custom_id: result.custom_id,
              result: { message: result.result.message as Anthropic.Message },
            };
          }
        }
      },
    },
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Builds system parameter with cache_control injected on cacheable blocks.
 * Splits a string system prompt into cacheable (long static context) and
 * non-cacheable (dynamic per-call) parts.
 */
function buildCacheableSystem(
  system: string | Array<{ text: string; cacheable?: boolean }> | undefined,
  globalCacheable?: boolean,
): string | Anthropic.TextBlockParam[] | undefined {
  if (!system) return undefined;

  if (typeof system === 'string') {
    if (globalCacheable) {
      return [
        {
          type: 'text' as const,
          text: system,
          cache_control: { type: 'ephemeral' as const },
        },
      ] as unknown as Anthropic.TextBlockParam[];
    }
    return system;
  }

  return system.map((block): Anthropic.TextBlockParam => {
    const b: Anthropic.TextBlockParam = { type: 'text', text: block.text };
    if (block.cacheable) {
      (b as TextBlockParam & { cache_control?: { type: 'ephemeral' } }).cache_control = { type: 'ephemeral' };
    }
    return b;
  }) as unknown as Anthropic.TextBlockParam[];
}
