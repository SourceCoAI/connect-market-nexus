/**
 * Provider-level Rate Limit Coordinator
 *
 * Lightweight DB-backed coordination that prevents concurrent edge function
 * invocations from overwhelming AI provider rate limits.
 *
 * Design principles:
 * - FAST: single DB read before each AI call (~5ms), no blocking locks
 * - ADAPTIVE: learns from 429 responses and shares cooldown across all functions
 * - NON-BLOCKING: if the DB check fails, the AI call proceeds anyway
 * - INTERNAL-OPTIMIZED: tuned for internal tool with 5-10 concurrent users
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export type AIProviderName = 'anthropic' | 'gemini' | 'firecrawl' | 'apify' | 'serper';

// Per-provider concurrency limits (requests per minute we target staying under)
const PROVIDER_LIMITS: Record<
  AIProviderName,
  { maxConcurrent: number; cooldownMs: number; softLimitRpm: number }
> = {
  anthropic: { maxConcurrent: 8, cooldownMs: 15000, softLimitRpm: 40 },
  gemini: { maxConcurrent: 5, cooldownMs: 30000, softLimitRpm: 15 },
  firecrawl: { maxConcurrent: 5, cooldownMs: 10000, softLimitRpm: 20 },
  apify: { maxConcurrent: 3, cooldownMs: 30000, softLimitRpm: 10 },
  serper: { maxConcurrent: 10, cooldownMs: 5000, softLimitRpm: 50 },
};

/**
 * In-memory rate limit state (per edge function invocation).
 * Since Deno edge functions are short-lived, this resets on each invocation.
 * The DB table provides cross-invocation coordination.
 */
const localState: Record<string, { lastRateLimited: number; backoffUntil: number }> = {};

/**
 * Check if a provider is currently in cooldown (from a recent 429).
 * Returns { ok: true } if safe to proceed, or { ok: false, retryAfterMs } if in cooldown.
 *
 * This is a FAST, NON-BLOCKING check. If the DB is slow or errors, it returns ok: true.
 */
export async function checkProviderAvailability(
  supabase: SupabaseClient,
  provider: AIProviderName,
): Promise<{ ok: boolean; retryAfterMs?: number; waitRecommended?: boolean }> {
  try {
    // 1. Check local in-memory state first (fastest)
    const local = localState[provider];
    if (local && Date.now() < local.backoffUntil) {
      const remaining = local.backoffUntil - Date.now();
      return { ok: false, retryAfterMs: remaining };
    }

    // 2. Check DB for cross-invocation rate limit state
    const { data } = await supabase
      .from('enrichment_rate_limits')
      .select('backoff_until, concurrent_requests, updated_at')
      .eq('provider', provider)
      .maybeSingle();

    if (!data) return { ok: true }; // No record = no known limits

    // Check if provider is in cooldown
    if (data.backoff_until) {
      const backoffUntil = new Date(data.backoff_until).getTime();
      if (Date.now() < backoffUntil) {
        const remaining = backoffUntil - Date.now();
        // Cache locally to avoid repeated DB reads
        localState[provider] = { lastRateLimited: Date.now(), backoffUntil };
        return { ok: false, retryAfterMs: remaining };
      }
    }

    // Check if near concurrent limit (soft warning, don't block)
    const limits = PROVIDER_LIMITS[provider];
    if (data.concurrent_requests >= limits.maxConcurrent) {
      return { ok: true, waitRecommended: true };
    }

    return { ok: true };
  } catch (err) {
    // Non-blocking — if DB check fails, allow the call
    console.warn(`[rate-limiter] DB check failed for ${provider}, proceeding:`, err);
    return { ok: true };
  }
}

/**
 * Report a rate limit (429) to coordinate cooldown across all edge functions.
 * Call this whenever an AI API returns 429.
 */
export async function reportRateLimit(
  supabase: SupabaseClient,
  provider: AIProviderName,
  retryAfterSeconds?: number,
): Promise<void> {
  const baseCooldownMs = retryAfterSeconds
    ? retryAfterSeconds * 1000
    : PROVIDER_LIMITS[provider].cooldownMs;

  // Add 10-20% jitter to the cooldown to spread recovery across concurrent functions
  const jitterMs = baseCooldownMs * (0.1 + Math.random() * 0.1);
  const cooldownMs = baseCooldownMs + jitterMs;

  const backoffUntil = new Date(Date.now() + cooldownMs).toISOString();

  // Update local state immediately
  localState[provider] = {
    lastRateLimited: Date.now(),
    backoffUntil: Date.now() + cooldownMs,
  };

  try {
    await supabase.from('enrichment_rate_limits').upsert(
      {
        provider,
        backoff_until: backoffUntil,
        last_429_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'provider' },
    );

    console.log(`[rate-limiter] ${provider} rate limited — cooldown until ${backoffUntil}`);
  } catch (err) {
    console.warn(`[rate-limiter] Failed to persist rate limit for ${provider}:`, err);
  }
}

/**
 * Increment concurrent request count for a provider.
 * Call before making an AI API call.
 */
export async function incrementConcurrent(
  supabase: SupabaseClient,
  provider: AIProviderName,
): Promise<void> {
  try {
    await supabase.rpc('increment_provider_concurrent', { p_provider: provider });
  } catch {
    // RPC not available — log warning but do NOT attempt racy read-then-write fallback.
    // The read-then-write pattern has a race condition under concurrent load.
    console.warn(
      `[rate-limiter] increment_provider_concurrent RPC not available for ${provider} — skipping concurrency tracking`,
    );
  }
}

/**
 * Decrement concurrent request count for a provider.
 * Call after an AI API call completes (success or failure).
 */
export async function decrementConcurrent(
  supabase: SupabaseClient,
  provider: AIProviderName,
): Promise<void> {
  try {
    await supabase.rpc('decrement_provider_concurrent', { p_provider: provider });
  } catch {
    // RPC not available — log warning but do NOT attempt racy read-then-write fallback.
    console.warn(
      `[rate-limiter] decrement_provider_concurrent RPC not available for ${provider} — skipping concurrency tracking`,
    );
  }
}

/**
 * Wrap an async operation with concurrency tracking.
 * Guarantees decrement is always called, even on crash/timeout.
 */
export async function withConcurrencyTracking<T>(
  supabase: SupabaseClient,
  provider: AIProviderName,
  fn: () => Promise<T>,
): Promise<T> {
  await incrementConcurrent(supabase, provider);
  try {
    return await fn();
  } finally {
    await decrementConcurrent(supabase, provider);
  }
}

/**
 * Smart delay based on provider load.
 * Returns a recommended delay (ms) before the next API call.
 * Returns 0 if no delay needed.
 */
export function getAdaptiveDelay(provider: AIProviderName, recentErrors: number = 0): number {
  if (recentErrors === 0) return 0;

  const limits = PROVIDER_LIMITS[provider];
  // Base delay: 60s / soft_limit_rpm gives us the ideal spacing
  const idealSpacing = (60 * 1000) / limits.softLimitRpm;

  // Scale up delay with error count
  return Math.min(idealSpacing * (1 + recentErrors), limits.cooldownMs);
}

/**
 * Wait if provider is in cooldown, then proceed.
 * This is the main function to call before making an AI request.
 * It will wait (up to maxWaitMs) if the provider is rate-limited, or proceed immediately if clear.
 */
export async function waitForProviderSlot(
  supabase: SupabaseClient,
  provider: AIProviderName,
  maxWaitMs: number = 30000,
): Promise<{ proceeded: boolean; waitedMs: number; rateLimited: boolean }> {
  const start = Date.now();

  const availability = await checkProviderAvailability(supabase, provider);

  if (availability.ok) {
    // If concurrent limit is close, add a small jitter delay to spread requests
    if (availability.waitRecommended) {
      const jitter = Math.random() * 2000;
      await new Promise((r) => setTimeout(r, jitter));
      return { proceeded: true, waitedMs: jitter, rateLimited: false };
    }
    return { proceeded: true, waitedMs: 0, rateLimited: false };
  }

  // Provider is in cooldown — wait if within our budget
  const retryAfter = availability.retryAfterMs || PROVIDER_LIMITS[provider].cooldownMs;

  if (retryAfter > maxWaitMs) {
    // Signal that we're rate limited and couldn't wait long enough.
    // Callers should NOT proceed — they should schedule delayed retry instead.
    console.log(
      `[rate-limiter] ${provider} cooldown (${retryAfter}ms) exceeds max wait (${maxWaitMs}ms) — signaling rate limited`,
    );
    return { proceeded: false, waitedMs: 0, rateLimited: true };
  }

  // Add jitter (0-2s) to prevent thundering herd when multiple functions
  // wake up simultaneously after the same cooldown period
  const jitter = Math.random() * 2000;
  const totalWait = retryAfter + jitter;
  console.log(
    `[rate-limiter] Waiting ${Math.round(totalWait)}ms for ${provider} cooldown (${retryAfter}ms + ${Math.round(jitter)}ms jitter)...`,
  );
  await new Promise((r) => setTimeout(r, totalWait));

  return { proceeded: true, waitedMs: Date.now() - start, rateLimited: false };
}
