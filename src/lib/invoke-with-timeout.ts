import { supabase } from '@/integrations/supabase/client';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from '@/integrations/supabase/client';

const DEFAULT_TIMEOUT_MS = 90_000; // 90 seconds — longer than Supabase 60s edge limit
const SESSION_TIMEOUT_MS = 5_000; // 5 seconds max for session retrieval

interface InvokeOptions {
  body?: Record<string, unknown>;
  timeoutMs?: number;
}

interface InvokeResult<T = unknown> {
  data: T | null;
  error: Error | null;
}

/**
 * Retrieve the access token with a hard timeout so getSession()
 * can never hang the entire request flow (known Supabase auth deadlock risk).
 */
async function getAccessTokenWithTimeout(): Promise<string | null> {
  console.log('[invoke-with-timeout] Starting session lookup…');
  try {
    const result = await Promise.race([
      supabase.auth.getSession(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Session retrieval timed out after 5 s')), SESSION_TIMEOUT_MS),
      ),
    ]);
    const token = result.data?.session?.access_token ?? null;
    console.log('[invoke-with-timeout] Session lookup done, token present:', !!token);
    return token;
  } catch (err) {
    console.error('[invoke-with-timeout] Session lookup failed:', err);
    throw err;
  }
}

/**
 * Invoke a Supabase edge function using direct fetch() with a configurable
 * timeout via AbortController.
 *
 * Why direct fetch instead of supabase.functions.invoke()?
 * 1. supabase-js wraps ALL fetch failures into a generic
 *    "Failed to send a request to the Edge Function" message, hiding the
 *    real cause (CORS, DNS, boot crash, etc.).
 * 2. supabase-js does NOT pass AbortController.signal to the underlying
 *    fetch, so the timeout mechanism was silently broken.
 * 3. Direct fetch gives us the actual HTTP status and error body for
 *    better diagnostics and retry decisions.
 */
export async function invokeWithTimeout<T = unknown>(
  functionName: string,
  options: InvokeOptions = {}
): Promise<InvokeResult<T>> {
  const { body, timeoutMs = DEFAULT_TIMEOUT_MS } = options;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    // Get the current user's JWT with a hard 5s timeout
    let accessToken: string | null;
    try {
      accessToken = await getAccessTokenWithTimeout();
    } catch (sessionErr) {
      return {
        data: null,
        error: sessionErr instanceof Error
          ? sessionErr
          : new Error('Session retrieval failed'),
      };
    }

    if (!accessToken) {
      return { data: null, error: new Error('No active session — please sign in again') };
    }

    const url = `${SUPABASE_URL}/functions/v1/${functionName}`;
    console.log('[invoke-with-timeout] Starting fetch to', functionName);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
        'apikey': SUPABASE_PUBLISHABLE_KEY,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    if (!response.ok) {
      // Try to extract a meaningful error from the response body
      let errorMessage: string;
      try {
        const errorBody = await response.json();
        // If the server returned a categorized error code, use just the user-friendly
        // message without appending raw details (which are meant for logging).
        if (errorBody?.error && errorBody?.code) {
          errorMessage = errorBody.error;
        } else {
          errorMessage = errorBody?.error
            ? errorBody.error + (errorBody.details ? `: ${errorBody.details}` : '')
            : `Edge function "${functionName}" returned HTTP ${response.status}`;
        }
      } catch {
        const text = await response.text().catch(() => '');
        errorMessage = text || `Edge function "${functionName}" returned HTTP ${response.status}`;
      }

      // Attach the status code so callers can distinguish 4xx vs 5xx
      const error = new Error(errorMessage);
      (error as Error & { status?: number }).status = response.status;
      return { data: null, error };
    }

    const data = await response.json();
    return { data: data as T, error: null };
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return {
        data: null,
        error: new Error(`Edge function "${functionName}" timed out after ${timeoutMs}ms`),
      };
    }

    // Provide a more descriptive message for network-level failures
    if (err instanceof TypeError) {
      // TypeError from fetch = network failure (DNS, CORS preflight, connection refused)
      return {
        data: null,
        error: new Error(
          `Network error calling "${functionName}": ${(err as Error).message}. ` +
          'This may indicate the edge function is not deployed, or a CORS/network issue.'
        ),
      };
    }

    return {
      data: null,
      error: err instanceof Error ? err : new Error(String(err)),
    };
  } finally {
    clearTimeout(timer);
  }
}
