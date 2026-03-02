/**
 * AI Provider Configuration
 *
 * Centralized module for direct API calls to Gemini.
 * All AI operations standardized on Gemini 2.0 Flash.
 */

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { waitForProviderSlot, withConcurrencyTracking, reportRateLimit } from './rate-limiter.ts';

/** Optional rate limit coordination config. When provided, AI calls coordinate with the shared rate limiter. */
export interface RateLimitConfig {
  supabase: SupabaseClient;
}

// API Endpoints
export const GEMINI_API_URL =
  'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
export const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
export const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

// Default models
export const DEFAULT_GEMINI_MODEL = 'gemini-2.0-flash';
export const GEMINI_25_FLASH_MODEL = 'gemini-2.5-flash';
export const DEFAULT_CLAUDE_MODEL = 'claude-sonnet-4-6';

/**
 * Build Gemini API request headers
 * Gemini OpenAI-compatible endpoint expects Authorization: Bearer <API_KEY>
 */
export function getGeminiHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };
}

/**
 * Build Anthropic API request headers
 * Anthropic Messages API expects x-api-key header
 */
export function getAnthropicHeaders(apiKey: string): Record<string, string> {
  return {
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
    'Content-Type': 'application/json',
  };
}

/**
 * Standard error response interface
 */
export interface AIErrorResponse {
  error: string;
  code?: string;
  recoverable?: boolean;
}

/**
 * Parse AI API error responses and return standardized error info
 */
export function parseAIError(status: number, responseText?: string): AIErrorResponse {
  switch (status) {
    case 401:
      return {
        error: 'Invalid API key',
        code: 'invalid_api_key',
        recoverable: false,
      };
    case 402:
      return {
        error: 'Payment required - please add credits',
        code: 'payment_required',
        recoverable: false,
      };
    case 429:
      return {
        error: 'Rate limit exceeded - please try again later',
        code: 'rate_limited',
        recoverable: true,
      };
    case 500:
    case 502:
    case 503:
      return {
        error: 'AI service temporarily unavailable',
        code: 'service_unavailable',
        recoverable: true,
      };
    default:
      return {
        error: responseText || `AI API error: ${status}`,
        code: 'unknown_error',
        recoverable: false,
      };
  }
}

// ============================================================================
// RETRY-AWARE AI CALL HELPERS
// ============================================================================

/**
 * Parse Retry-After header value into milliseconds.
 */
function parseRetryAfter(response: Response): number | null {
  const header = response.headers.get('retry-after');
  if (!header) return null;
  const seconds = parseInt(header, 10);
  if (!isNaN(seconds)) return seconds * 1000;
  const date = new Date(header);
  if (!isNaN(date.getTime())) return Math.max(0, date.getTime() - Date.now());
  return null;
}

/**
 * Fetch with automatic retry on rate limits (429) and server errors (5xx).
 * Exported for use by edge functions that need retry-aware fetch.
 */
export async function fetchWithAutoRetry(
  url: string,
  options: RequestInit & { signal?: AbortSignal },
  config: {
    maxRetries?: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
    callerName?: string;
  } = {},
): Promise<Response> {
  const { maxRetries = 3, baseDelayMs = 2000, maxDelayMs = 60000, callerName = 'AI' } = config;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);

      if (response.ok || (response.status >= 400 && response.status < 429)) {
        return response;
      }

      if (response.status === 429) {
        if (attempt === maxRetries) return response;
        // Drain response body to prevent connection leak before retry
        await response.body?.cancel();
        const retryAfterMs = parseRetryAfter(response) || baseDelayMs * Math.pow(2, attempt);
        const waitMs = Math.min(retryAfterMs, maxDelayMs);
        const jitter = Math.random() * 1000;
        console.warn(
          `[${callerName}] Rate limited (429), waiting ${Math.round(waitMs + jitter)}ms before retry ${attempt + 1}/${maxRetries}...`,
        );
        await new Promise((r) => setTimeout(r, waitMs + jitter));
        continue;
      }

      if (response.status >= 500) {
        if (attempt === maxRetries) return response;
        // Drain response body to prevent connection leak before retry
        await response.body?.cancel();
        const delay = Math.min(baseDelayMs * Math.pow(2, attempt), maxDelayMs);
        const jitter = Math.random() * delay * 0.3;
        console.warn(
          `[${callerName}] Server error (${response.status}), retrying in ${Math.round(delay + jitter)}ms...`,
        );
        await new Promise((r) => setTimeout(r, delay + jitter));
        continue;
      }

      return response;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (lastError.name === 'TimeoutError' || lastError.name === 'AbortError') {
        throw lastError;
      }

      if (attempt < maxRetries) {
        const delay = Math.min(baseDelayMs * Math.pow(2, attempt), maxDelayMs);
        const jitter = Math.random() * delay * 0.3;
        console.warn(
          `[${callerName}] Network error, retrying in ${Math.round(delay + jitter)}ms: ${lastError.message}`,
        );
        await new Promise((r) => setTimeout(r, delay + jitter));
        continue;
      }
    }
  }

  throw lastError || new Error(`${callerName}: all retry attempts exhausted`);
}

/**
 * Call Gemini API with tool use (function calling) via OpenAI-compatible endpoint.
 * Accepts OpenAI-style tool format natively.
 */
export async function callGeminiWithTool(
  systemPrompt: string,
  userPrompt: string,
  tool: Record<string, unknown>,
  apiKey: string,
  model: string = DEFAULT_GEMINI_MODEL,
  timeoutMs: number = 45000,
  maxTokens: number = 8192,
  rateLimitConfig?: RateLimitConfig,
): Promise<{
  data: Record<string, unknown> | null;
  error?: { code: string; message: string };
  usage?: { input_tokens: number; output_tokens: number };
}> {
  try {
    // Normalize tool format — accept both OpenAI and legacy formats
    let openAITool: Record<string, unknown>;
    if (tool.type === 'function' && tool.function) {
      openAITool = tool;
    } else if (tool.name && tool.input_schema) {
      openAITool = {
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description || '',
          parameters: tool.input_schema,
        },
      };
    } else {
      openAITool = tool;
    }

    const fnObj = openAITool.function as Record<string, unknown> | undefined;
    const toolName = (fnObj?.name as string) || (openAITool.name as string) || 'unknown';

    // Wait for rate limiter slot if configured
    if (rateLimitConfig?.supabase) {
      await waitForProviderSlot(rateLimitConfig.supabase, 'gemini');
    }

    const startTime = Date.now();

    const doFetch = async () => {
      const response = await fetchWithAutoRetry(
        GEMINI_API_URL,
        {
          method: 'POST',
          headers: getGeminiHeaders(apiKey),
          body: JSON.stringify({
            model,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt },
            ],
            tools: [openAITool],
            tool_choice: { type: 'function', function: { name: toolName } },
            temperature: 0,
            max_tokens: maxTokens,
          }),
          signal: AbortSignal.timeout(timeoutMs),
        },
        { maxRetries: 3, baseDelayMs: 2000, callerName: `Gemini/${model}` },
      );

      const durationMs = Date.now() - startTime;

      if (response.status === 402) {
        return { data: null, error: { code: 'payment_required', message: 'AI credits depleted' } };
      }
      if (response.status === 429) {
        // Report rate limit to shared coordinator
        if (rateLimitConfig?.supabase) {
          await reportRateLimit(rateLimitConfig.supabase, 'gemini');
        }
        return {
          data: null,
          error: { code: 'rate_limited', message: 'Rate limit exceeded after retries' },
        };
      }
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Gemini API call failed: ${response.status}`, errorText.substring(0, 500));
        return {
          data: null,
          error: {
            code: `http_${response.status}`,
            message: `Gemini API returned ${response.status}: ${errorText.substring(0, 200)}`,
          },
        };
      }

      const responseData = await response.json();
      const usage = responseData.usage
        ? {
            input_tokens: responseData.usage.prompt_tokens || 0,
            output_tokens: responseData.usage.completion_tokens || 0,
          }
        : undefined;

      if (usage) {
        console.log(
          `[Gemini/${model}] ${usage.input_tokens}in/${usage.output_tokens}out tokens, ${durationMs}ms`,
        );
      }

      const toolCall = responseData.choices?.[0]?.message?.tool_calls?.[0];
      if (!toolCall?.function?.arguments) {
        console.warn('No tool_call in Gemini response');
        return {
          data: null,
          error: { code: 'no_tool_use', message: 'Gemini did not return tool use' },
          usage,
        };
      }

      const parsed =
        typeof toolCall.function.arguments === 'string'
          ? JSON.parse(toolCall.function.arguments)
          : toolCall.function.arguments;

      return { data: parsed, usage };
    };

    // Wrap with concurrency tracking if rate limiter is configured
    if (rateLimitConfig?.supabase) {
      return await withConcurrencyTracking(rateLimitConfig.supabase, 'gemini', doFetch);
    }
    return await doFetch();
  } catch (error) {
    if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
      console.error(`Gemini API timeout after ${timeoutMs}ms`);
      return {
        data: null,
        error: { code: 'timeout', message: `Gemini API timeout after ${timeoutMs}ms` },
      };
    }
    console.error('Gemini API error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      data: null,
      error: { code: 'unknown_error', message: `Gemini API error: ${message}` },
    };
  }
}

/**
 * Call Gemini API with automatic retry on rate limits.
 * Uses OpenAI-compatible endpoint. Waits and retries on 429.
 */
export async function callGeminiWithRetry(
  url: string,
  headers: Record<string, string>,
  body: Record<string, unknown>,
  timeoutMs: number = 45000,
  callerName: string = 'Gemini',
): Promise<Response> {
  return fetchWithAutoRetry(
    url,
    {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    },
    { maxRetries: 3, baseDelayMs: 2000, callerName },
  );
}
