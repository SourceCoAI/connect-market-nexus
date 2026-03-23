/**
 * Reliable edge function invocation with retry + timeout.
 *
 * Combines `invokeWithTimeout` (direct fetch with AbortController) with
 * `retryWithBackoff` (retries transient network / 5xx failures).
 *
 * Uses direct fetch() instead of supabase.functions.invoke() so that:
 * - AbortController signal actually works for timeouts
 * - Real error messages are preserved (not wrapped in generic
 *   "Failed to send a request to the Edge Function")
 * - HTTP status codes are available for retry decisions
 */
import { invokeWithTimeout } from './invoke-with-timeout';
import { retryWithBackoff } from './retry';

export interface InvokeEdgeFunctionOptions {
  body?: Record<string, unknown>;
  /** Timeout per attempt in ms (default: 90 000). */
  timeoutMs?: number;
  /** Max retry attempts on transient failures (default: 2). */
  maxRetries?: number;
}

/**
 * Whether an error looks transient (network failure, timeout, 5xx)
 * vs permanent (4xx, auth, validation).
 */
function isTransientError(error: Error): boolean {
  // Check HTTP status if attached by invokeWithTimeout
  const status = (error as Error & { status?: number }).status;
  if (status !== undefined) {
    // 4xx errors (except 429) are permanent — don't retry
    if (status >= 400 && status < 500 && status !== 429) return false;
    // 429 and 5xx are transient
    if (status === 429 || status >= 500) return true;
  }

  const msg = error.message.toLowerCase();
  return (
    msg.includes('network error') ||
    msg.includes('failed to fetch') ||
    msg.includes('timed out') ||
    msg.includes('timeout') ||
    msg.includes('econnrefused') ||
    msg.includes('econnreset') ||
    msg.includes('socket hang up') ||
    msg.includes('not deployed') ||
    msg.includes('http 502') ||
    msg.includes('http 503') ||
    msg.includes('http 504') ||
    msg.includes('bad gateway') ||
    msg.includes('service unavailable') ||
    msg.includes('gateway timeout') ||
    error.name === 'TypeError' // fetch throws TypeError on network failure
  );
}

/**
 * Invoke a Supabase edge function with timeout and automatic retry
 * on transient failures.
 *
 * @returns The parsed response data.
 * @throws  Error with a descriptive message on permanent failure.
 */
export async function invokeEdgeFunction<T = unknown>(
  functionName: string,
  options: InvokeEdgeFunctionOptions = {},
): Promise<T> {
  const { body, timeoutMs = 90_000, maxRetries = 2 } = options;

  return retryWithBackoff(
    async () => {
      const { data, error } = await invokeWithTimeout<T>(functionName, {
        body,
        timeoutMs,
      });

      if (error) {
        // Preserve the status code on the re-thrown error for retry decisions
        const status = (error as Error & { status?: number }).status;
        if (!isTransientError(error)) {
          (error as Error & { _permanent?: boolean })._permanent = true;
        }
        if (status !== undefined) {
          (error as Error & { status?: number }).status = status;
        }
        throw error;
      }

      return data as T;
    },
    {
      maxRetries,
      initialDelay: 2_000,
      backoffFactor: 2,
      operationName: functionName,
      shouldRetry: (err) => {
        if (err && typeof err === 'object' && '_permanent' in err) return false;
        return true;
      },
    },
  );
}
