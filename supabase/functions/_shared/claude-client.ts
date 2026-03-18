/**
 * Claude API client for the AI Command Center.
 * Supports streaming responses with tool calling.
 */

import { fetchWithAutoRetry, type RateLimitConfig } from './ai-providers.ts';
import { waitForProviderSlot, withConcurrencyTracking, reportRateLimit } from './rate-limiter.ts';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

// Model identifiers
export const CLAUDE_MODELS = {
  haiku: 'claude-haiku-4-5-20251001',
  sonnet: 'claude-sonnet-4-6',
  opus: 'claude-opus-4-6',
} as const;

export type ModelTier = 'QUICK' | 'STANDARD' | 'DEEP';

export function getModelForTier(tier: ModelTier): string {
  switch (tier) {
    case 'QUICK':
      return CLAUDE_MODELS.haiku;
    case 'STANDARD':
      return CLAUDE_MODELS.sonnet;
    case 'DEEP':
      return CLAUDE_MODELS.opus;
    default:
      return CLAUDE_MODELS.sonnet;
  }
}

// Cost per million tokens (Feb 2026 pricing)
const MODEL_COSTS: Record<string, { input: number; output: number }> = {
  [CLAUDE_MODELS.haiku]: { input: 1.0, output: 5.0 },
  [CLAUDE_MODELS.sonnet]: { input: 3.0, output: 15.0 },
  [CLAUDE_MODELS.opus]: { input: 15.0, output: 75.0 },
};

export function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const costs = MODEL_COSTS[model];
  if (!costs) return 0;
  return (inputTokens * costs.input + outputTokens * costs.output) / 1_000_000;
}

// ---------- Types ----------

export interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string | ContentBlock[];
}

export interface ContentBlock {
  type: 'text' | 'tool_use' | 'tool_result';
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: string;
  is_error?: boolean;
}

export interface ClaudeTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface ClaudeCallOptions {
  model: string;
  maxTokens: number;
  systemPrompt: string;
  messages: ClaudeMessage[];
  tools?: ClaudeTool[];
  timeoutMs?: number;
  rateLimitConfig?: RateLimitConfig;
}

export interface ClaudeResponse {
  content: ContentBlock[];
  stop_reason: string;
  usage: { input_tokens: number; output_tokens: number };
}

// ---------- Non-streaming call (for router) ----------

export async function callClaude(options: ClaudeCallOptions): Promise<ClaudeResponse> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');

  // Wait for rate limiter slot if configured
  if (options.rateLimitConfig?.supabase) {
    await waitForProviderSlot(options.rateLimitConfig.supabase, 'anthropic');
  }

  const doFetch = async () => {
    const response = await fetchWithAutoRetry(
      ANTHROPIC_API_URL,
      {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-beta': 'prompt-caching-2024-07-31',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: options.model,
          max_tokens: options.maxTokens,
          system: [
            { type: 'text', text: options.systemPrompt, cache_control: { type: 'ephemeral' } },
          ],
          messages: options.messages,
          tools: options.tools,
          stream: false,
        }),
        signal: AbortSignal.timeout(options.timeoutMs || 30000),
      },
      { maxRetries: 1, baseDelayMs: 1000, callerName: `Claude/${options.model}` },
    );

    if (response.status === 429 && options.rateLimitConfig?.supabase) {
      await reportRateLimit(options.rateLimitConfig.supabase, 'anthropic');
    }

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Claude API error ${response.status}: ${errorBody}`);
    }

    return await response.json();
  };

  try {
    // Wrap with concurrency tracking if rate limiter is configured
    if (options.rateLimitConfig?.supabase) {
      return await withConcurrencyTracking(options.rateLimitConfig.supabase, 'anthropic', doFetch);
    }
    return await doFetch();
  } catch (err) {
    // Re-throw timeout/abort errors with model context for better diagnostics
    if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
      const timeoutSec = Math.round((options.timeoutMs || 30000) / 1000);
      throw new Error(
        `Claude ${options.model} timed out after ${timeoutSec}s. ` +
        'The AI model took too long to respond.'
      );
    }
    throw err;
  }
}

// ---------- Streaming call (for orchestrator) ----------

export interface StreamCallbacks {
  onText: (text: string) => Promise<void>;
  onToolUse: (id: string, name: string, input: Record<string, unknown>) => Promise<void>;
  onComplete: (
    usage: { input_tokens: number; output_tokens: number },
    stopReason: string,
  ) => Promise<void>;
  onError: (error: Error) => Promise<void>;
}

export async function streamClaude(
  options: ClaudeCallOptions,
  callbacks: StreamCallbacks,
): Promise<ClaudeResponse> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');

  const response = await fetchWithAutoRetry(
    ANTHROPIC_API_URL,
    {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'prompt-caching-2024-07-31',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: options.model,
        max_tokens: options.maxTokens,
        system: [
          { type: 'text', text: options.systemPrompt, cache_control: { type: 'ephemeral' } },
        ],
        messages: options.messages,
        tools: options.tools,
        stream: true,
      }),
      signal: AbortSignal.timeout(options.timeoutMs || 60000),
    },
    { maxRetries: 1, baseDelayMs: 1000, callerName: `Claude/${options.model}` },
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Claude API error ${response.status}: ${errorBody}`);
  }

  // Parse SSE stream
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();

  const contentBlocks: ContentBlock[] = [];
  let currentToolUse: { id: string; name: string; inputJson: string } | null = null;
  let fullText = '';
  const usage = { input_tokens: 0, output_tokens: 0 };
  let stopReason = 'end_turn';
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (!data || data === '[DONE]') continue;

        try {
          const event = JSON.parse(data);

          switch (event.type) {
            case 'content_block_start': {
              const block = event.content_block;
              if (block.type === 'tool_use') {
                currentToolUse = { id: block.id, name: block.name, inputJson: '' };
              }
              break;
            }

            case 'content_block_delta': {
              const delta = event.delta;
              if (delta.type === 'text_delta') {
                fullText += delta.text;
                await callbacks.onText(delta.text);
              } else if (delta.type === 'input_json_delta' && currentToolUse) {
                currentToolUse.inputJson += delta.partial_json;
              }
              break;
            }

            case 'content_block_stop': {
              if (currentToolUse) {
                const input = currentToolUse.inputJson ? JSON.parse(currentToolUse.inputJson) : {};
                contentBlocks.push({
                  type: 'tool_use',
                  id: currentToolUse.id,
                  name: currentToolUse.name,
                  input,
                });
                await callbacks.onToolUse(currentToolUse.id, currentToolUse.name, input);
                currentToolUse = null;
              } else if (fullText) {
                contentBlocks.push({ type: 'text', text: fullText });
              }
              break;
            }

            case 'message_delta': {
              if (event.delta?.stop_reason) stopReason = event.delta.stop_reason;
              if (event.usage) {
                usage.output_tokens = event.usage.output_tokens;
              }
              break;
            }

            case 'message_start': {
              if (event.message?.usage) {
                usage.input_tokens = event.message.usage.input_tokens;
              }
              break;
            }
          }
        } catch {
          // Skip malformed JSON lines
        }
      }
    }
  } catch (err) {
    await callbacks.onError(err instanceof Error ? err : new Error(String(err)));
    throw err;
  }

  await callbacks.onComplete(usage, stopReason);

  // Ensure text block is captured if stream ended without content_block_stop for text
  if (fullText && !contentBlocks.some((b) => b.type === 'text')) {
    contentBlocks.push({ type: 'text', text: fullText });
  }

  return { content: contentBlocks, stop_reason: stopReason, usage };
}
