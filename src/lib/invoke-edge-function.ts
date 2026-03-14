/**
 * Reliable edge function invocation with retry + timeout.
 *
 * Combines `invokeWithTimeout` (prevents hung requests) with
 * `retryWithBackoff` (retries transient network / 5xx failures).
 *
 * Use this for any user-facing edge function call that should
 * survive intermittent "Failed to send a request to the Edge Function"
 * errors from the Supabase client.
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
 * Whether an error from `supabase.functions.invoke` looks transient
 * (network failure, timeout, 5xx) vs permanent (4xx, auth, validation).
 */
function isTransientError(error: Error): boolean {
  const msg = error.message.toLowerCase();
  return (
    msg.includes('failed to send a request') ||
    msg.includes('failed to fetch') ||
    msg.includes('network') ||
    msg.includes('timed out') ||
    msg.includes('timeout') ||
    msg.includes('econnrefused') ||
    msg.includes('econnreset') ||
    msg.includes('socket hang up') ||
    msg.includes('502') ||
    msg.includes('503') ||
    msg.includes('504') ||
    msg.includes('bad gateway') ||
    msg.includes('service unavailable') ||
    msg.includes('gateway timeout') ||
    error.name === 'TypeError' // fetch throws TypeError on network failure
  );
}

/** Extract the real error message from a Supabase FunctionsHttpError */
export async function extractEdgeFunctionError(error: unknown): Promise<string> {
  if (error && typeof error === 'object' && 'context' in error) {
    try {
      const ctx = (error as { context: Response }).context;
      if (ctx && typeof ctx.json === 'function') {
        const body = await ctx.json();
        if (body?.error) return body.error + (body.details ? `: ${body.details}` : '');
        return JSON.stringify(body);
      }
    } catch {
      // Fall through
    }
  }
  if (error instanceof Error) return error.message;
  return String(error);
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
        // Extract a meaningful message before deciding whether to retry
        const msg = await extractEdgeFunctionError(error);
        const richError = new Error(msg);
        // Preserve transient-ness check on the original error too
        if (!isTransientError(error) && !isTransientError(richError)) {
          // Non-transient: mark so retry predicate can stop
          (richError as { _permanent?: boolean })._permanent = true;
        }
        throw richError;
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
