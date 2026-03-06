/* eslint-disable no-console */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  updateGlobalQueueProgress,
  completeGlobalQueueOperation,
  isOperationPaused,
  recoverStaleOperations,
} from '../_shared/global-activity-queue.ts';
import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';
import { checkProviderAvailability, reportRateLimit } from '../_shared/rate-limiter.ts';
import { logEnrichmentEvent } from '../_shared/enrichment-events.ts';

// Configuration
const MAX_ATTEMPTS = 3;
const PROCESSING_TIMEOUT_MS = 45000; // 45s per buyer — must complete within the function's runtime budget
const RATE_LIMIT_BACKOFF_MS = 60000; // 60s backoff on rate limit
const STALE_PROCESSING_MINUTES = 2; // Recovery timeout for stuck items (reduced from 5 to prevent long freezes)
const MAX_FUNCTION_RUNTIME_MS = 110000; // 110s — allows processing a small batch before self-continuing
const CONCURRENCY_LIMIT = 3; // Process 3 buyers in parallel (up from 1) — 3x faster bulk enrichment
const INTER_BATCH_DELAY_MS = 1000; // 1s breathing room between parallel batches
const MAX_CONTINUATIONS = 50; // Prevent infinite self-continuation loops
const CIRCUIT_BREAKER_THRESHOLD = 3; // Stop after 3 consecutive failures (API probably down)

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(req);
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse request body for continuation tracking
    let body: Record<string, unknown> = {};
    try {
      body = await req.json();
    } catch {
      /* empty body ok */
    }

    const continuationCount =
      typeof body.continuationCount === 'number' ? body.continuationCount : 0;
    console.log(
      `Processing buyer enrichment queue (self-looping)... [continuation ${continuationCount}/${MAX_CONTINUATIONS}]`,
    );

    // Auto-recover any stale global operations (prevents deadlocks)
    const recovered = await recoverStaleOperations(supabase);
    if (recovered > 0) {
      console.log(`Recovered ${recovered} stale global operations`);
    }

    // Recovery: reset stale processing items (stuck for 5+ minutes)
    const staleCutoffIso = new Date(
      Date.now() - STALE_PROCESSING_MINUTES * 60 * 1000,
    ).toISOString();
    const { data: staleItems } = await supabase
      .from('buyer_enrichment_queue')
      .update({
        status: 'pending',
        started_at: null,
        updated_at: new Date().toISOString(),
        last_error: 'Recovered from stale processing state',
      })
      .eq('status', 'processing')
      .lt('started_at', staleCutoffIso)
      .select('id');

    if (staleItems && staleItems.length > 0) {
      console.log(`Recovered ${staleItems.length} stale processing items`);
    }

    // Advisory lock (best-effort): do NOT hard-stop on lock contention.
    // Session-level advisory locks can linger with pooled connections and stall the queue.
    // We still attempt the lock for observability, but rely on atomic row-claiming below
    // to safely prevent duplicate processing.
    const { data: lockAcquired, error: lockError } = await supabase.rpc(
      'try_acquire_queue_processor_lock',
      { p_queue_name: 'buyer_enrichment' },
    );

    if (lockError && lockError.code !== 'PGRST202' && lockError.code !== '42883') {
      console.warn('Queue lock RPC error (continuing with atomic claims):', lockError);
    }

    if (lockAcquired === false) {
      console.warn(
        'Queue lock is currently held; continuing with atomic claim strategy to avoid lock-induced stalls',
      );
    }

    // Resume rate-limited items whose reset time has passed
    const now = new Date().toISOString();
    await supabase
      .from('buyer_enrichment_queue')
      .update({
        status: 'pending',
        rate_limit_reset_at: null,
        updated_at: now,
      })
      .eq('status', 'rate_limited')
      .lt('rate_limit_reset_at', now);

    // Mark items that have exhausted attempts as failed
    const { data: exhaustedItems } = await supabase
      .from('buyer_enrichment_queue')
      .update({
        status: 'failed',
        last_error: 'Max attempts reached',
        updated_at: new Date().toISOString(),
      })
      .eq('status', 'pending')
      .gte('attempts', MAX_ATTEMPTS)
      .select('id');

    if (exhaustedItems && exhaustedItems.length > 0) {
      console.log(`Marked ${exhaustedItems.length} exhausted items as failed`);
    }

    // Create enrichment job for observability tracking (non-blocking on failure)
    let enrichmentJobId: string | null = null;
    try {
      // Get count of pending buyers for total_records
      const { count: pendingCount } = await supabase
        .from('buyer_enrichment_queue')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending')
        .lt('attempts', MAX_ATTEMPTS);

      const { data: jobData } = await supabase.rpc('upsert_enrichment_job', {
        p_job_type: 'buyer_enrichment',
        p_total_records: pendingCount || 0,
        p_source: 'scheduled',
      });
      enrichmentJobId = jobData;
      if (enrichmentJobId) console.log(`[enrichment-jobs] Created job ${enrichmentJobId}`);
    } catch (err) {
      console.warn('[enrichment-jobs] Failed to create job (non-blocking):', err);
    }

    // Helper: process a single buyer item (used by parallel batch below)
    async function processOneItem(
      item: { id: string; buyer_id: string; universe_id: string | null; status: string; attempts: number; queued_at: string; force: boolean | null },
    ): Promise<'success' | 'failed' | 'rate_limited' | 'skipped'> {
      const itemForce = item.force === true;

      // BUG-7 FIX: Improved freshness check — only skip if the ENRICHMENT PROCESS itself
      // updated the buyer recently, not just any edit.
      if (!itemForce) {
        const { data: buyerData } = await supabase
          .from('buyers')
          .select('data_last_updated, extraction_sources')
          .eq('id', item.buyer_id)
          .single();

        if (buyerData?.data_last_updated) {
          const lastUpdatedMs = new Date(buyerData.data_last_updated).getTime();
          const freshnessWindowMs = STALE_PROCESSING_MINUTES * 60 * 1000;
          const sources = Array.isArray(buyerData.extraction_sources)
            ? buyerData.extraction_sources
            : [];
          const hasRecentEnrichmentSource = sources.some((src: Record<string, unknown>) => {
            const srcType = (src.type as string) || (src.source_type as string);
            const isEnrichmentSource =
              srcType === 'platform_website' ||
              srcType === 'pe_firm_website' ||
              srcType === 'transcript';
            if (!isEnrichmentSource) return false;
            const srcTimestamp = (src.extracted_at as string) || (src.timestamp as string);
            if (!srcTimestamp) return false;
            return Date.now() - new Date(srcTimestamp).getTime() < freshnessWindowMs;
          });

          if (Date.now() - lastUpdatedMs < freshnessWindowMs && hasRecentEnrichmentSource) {
            console.log(`Skipping buyer ${item.buyer_id} — enrichment data is fresh, marking completed`);
            await supabase
              .from('buyer_enrichment_queue')
              .update({ status: 'completed', completed_at: new Date().toISOString(), last_error: 'Skipped: buyer enrichment data already fresh', updated_at: new Date().toISOString() })
              .eq('id', item.id);
            await updateGlobalQueueProgress(supabase, 'buyer_enrichment', { completedDelta: 1 });
            return 'skipped';
          }
        }
      }

      // Atomically claim this item
      const { data: claimedItem, error: claimError } = await supabase
        .from('buyer_enrichment_queue')
        .update({ status: 'processing', attempts: item.attempts + 1, started_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', item.id)
        .eq('status', 'pending')
        .select('id')
        .maybeSingle();

      if (claimError || !claimedItem) {
        console.log(`Buyer ${item.buyer_id} was claimed by another worker, skipping`);
        return 'skipped';
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), PROCESSING_TIMEOUT_MS);

      try {
        const response = await fetch(`${supabaseUrl}/functions/v1/enrich-buyer`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: supabaseAnonKey, Authorization: `Bearer ${supabaseServiceKey}` },
          body: JSON.stringify({ buyerId: item.buyer_id, skipLock: true, forceReExtract: itemForce }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);
        const data = await response.json().catch(() => ({}));

        if (response.status === 429 || data.error_code === 'rate_limited') {
          const resetAt = data.resetTime || new Date(Date.now() + RATE_LIMIT_BACKOFF_MS).toISOString();
          await reportRateLimit(supabase, 'gemini', RATE_LIMIT_BACKOFF_MS / 1000);
          await supabase
            .from('buyer_enrichment_queue')
            .update({ status: 'rate_limited', rate_limit_reset_at: resetAt, last_error: 'Rate limited - will retry after reset', updated_at: new Date().toISOString() })
            .eq('id', item.id);
          console.log(`Rate limited at buyer ${item.buyer_id}`);
          if (enrichmentJobId) {
            Promise.resolve(supabase.rpc('update_enrichment_job_progress', { p_job_id: enrichmentJobId, p_rate_limited: true })).catch(() => {});
          }
          logEnrichmentEvent(supabase, { entityType: 'buyer', entityId: item.buyer_id, provider: 'gemini', functionName: 'process-buyer-enrichment-queue', stepName: 'enrich-buyer', status: 'rate_limited', jobId: enrichmentJobId || undefined });
          return 'rate_limited';
        }

        if (!response.ok || !data.success) {
          const errorMsg = data.details ? `${data.error}: ${data.details}` : data.error || `HTTP ${response.status}`;
          throw new Error(errorMsg);
        }

        const wasPartial = data.extractionDetails?.rateLimited === true;
        if (wasPartial && item.attempts < MAX_ATTEMPTS - 1) {
          await supabase.from('buyer_enrichment_queue').update({ status: 'pending', started_at: null, last_error: `Partial: ${data.extractionDetails?.promptsSuccessful}/${data.extractionDetails?.promptsRun} prompts completed`, updated_at: new Date().toISOString() }).eq('id', item.id);
        } else {
          await supabase.from('buyer_enrichment_queue').update({ status: 'completed', completed_at: new Date().toISOString(), force: false, last_error: wasPartial ? `Partial: ${data.extractionDetails?.promptsSuccessful}/${data.extractionDetails?.promptsRun} prompts` : null, updated_at: new Date().toISOString() }).eq('id', item.id);
        }

        await updateGlobalQueueProgress(supabase, 'buyer_enrichment', { completedDelta: 1 });
        if (enrichmentJobId) {
          Promise.resolve(supabase.rpc('update_enrichment_job_progress', { p_job_id: enrichmentJobId, p_succeeded_delta: 1, p_last_processed_id: item.buyer_id })).catch(() => {});
        }
        logEnrichmentEvent(supabase, { entityType: 'buyer', entityId: item.buyer_id, provider: 'pipeline', functionName: 'process-buyer-enrichment-queue', stepName: 'enrich-buyer', status: 'success', jobId: enrichmentJobId || undefined });
        return 'success';
      } catch (error) {
        clearTimeout(timeoutId);
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        const currentAttempts = item.attempts + 1;
        const newStatus = currentAttempts >= MAX_ATTEMPTS ? 'failed' : 'pending';

        await supabase.from('buyer_enrichment_queue').update({ status: newStatus, last_error: errorMsg, started_at: null, updated_at: new Date().toISOString() }).eq('id', item.id);
        console.error(`Failed to enrich buyer ${item.buyer_id}:`, errorMsg);
        await updateGlobalQueueProgress(supabase, 'buyer_enrichment', { failedDelta: 1, errorEntry: { itemId: item.buyer_id, error: errorMsg } });

        if (enrichmentJobId) {
          Promise.resolve(supabase.rpc('update_enrichment_job_progress', { p_job_id: enrichmentJobId, p_failed_delta: 1, p_last_processed_id: item.buyer_id, p_error_message: errorMsg })).catch(() => {});
        }
        logEnrichmentEvent(supabase, { entityType: 'buyer', entityId: item.buyer_id, provider: 'pipeline', functionName: 'process-buyer-enrichment-queue', stepName: 'enrich-buyer', status: 'failure', errorMessage: errorMsg, jobId: enrichmentJobId || undefined });
        return 'failed';
      }
    }

    // MAIN LOOP: Process buyers in parallel batches until queue is empty or time runs out
    const functionStartTime = Date.now();
    let totalProcessed = 0;
    let totalSucceeded = 0;
    let totalFailed = 0;
    let totalRateLimited = 0;
    let consecutiveFailures = 0;

    while (true) {
      // Time guard: stop before Deno's execution limit
      if (Date.now() - functionStartTime > MAX_FUNCTION_RUNTIME_MS) {
        console.log(`Time limit reached after ${totalProcessed} buyers, will continue on next invocation`);
        break;
      }

      // Circuit breaker: stop if API appears down
      if (consecutiveFailures >= CIRCUIT_BREAKER_THRESHOLD) {
        console.error(`Circuit breaker tripped after ${consecutiveFailures} consecutive failures — stopping to prevent wasted retries`);
        break;
      }

      // Check if operation was paused by user
      if (await isOperationPaused(supabase, 'buyer_enrichment')) {
        console.log('Buyer enrichment paused by user — stopping');
        break;
      }

      // Check rate limiters before dispatching
      let rateLimitBlocked = false;
      for (const provider of ['gemini', 'firecrawl'] as const) {
        const availability = await checkProviderAvailability(supabase, provider);
        if (!availability.ok) {
          const waitMs = availability.retryAfterMs || RATE_LIMIT_BACKOFF_MS;
          if (waitMs > 30000) {
            console.log(`${provider} rate limited for ${Math.round(waitMs / 1000)}s — stopping queue processing`);
            totalRateLimited++;
            rateLimitBlocked = true;
            break;
          }
          console.log(`${provider} rate limited — waiting ${Math.round(waitMs / 1000)}s before processing`);
          await new Promise((r) => setTimeout(r, waitMs));
        }
      }
      if (rateLimitBlocked) break;

      // Fetch next batch of pending items (CONCURRENCY_LIMIT at a time)
      const { data: queueItems, error: fetchError } = await supabase
        .from('buyer_enrichment_queue')
        .select('id, buyer_id, universe_id, status, attempts, queued_at, force')
        .eq('status', 'pending')
        .lt('attempts', MAX_ATTEMPTS)
        .order('queued_at', { ascending: true })
        .limit(CONCURRENCY_LIMIT);

      if (fetchError) {
        console.error('Error fetching queue items:', fetchError);
        break;
      }

      if (!queueItems || queueItems.length === 0) {
        // Before declaring completion, check if any items are still being processed
        // by concurrent workers — if so, DON'T complete the global operation yet.
        const { count: processingCount } = await supabase
          .from('buyer_enrichment_queue')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'processing');

        if ((processingCount ?? 0) > 0) {
          console.log(`No pending items, but ${processingCount} still processing — skipping completion`);
        } else {
          console.log(`No more pending items. Processed ${totalProcessed} buyers this run.`);
          await completeGlobalQueueOperation(supabase, 'buyer_enrichment');
        }
        break;
      }

      console.log(`Processing batch of ${queueItems.length} buyers [#${totalProcessed + 1}-${totalProcessed + queueItems.length} this run]`);

      // Process batch in parallel
      const results = await Promise.allSettled(
        queueItems.map((item) => processOneItem(item)),
      );

      let batchFailed = 0;
      for (const result of results) {
        const outcome = result.status === 'fulfilled' ? result.value : 'failed';
        if (outcome === 'success' || outcome === 'skipped') {
          totalSucceeded++;
          consecutiveFailures = 0;
        } else if (outcome === 'rate_limited') {
          totalRateLimited++;
        } else {
          totalFailed++;
          batchFailed++;
          consecutiveFailures++;
        }
        totalProcessed++;
      }

      // If entire batch was rate limited, stop
      if (totalRateLimited > 0) break;

      // Brief delay between batches to avoid overwhelming APIs
      if (Date.now() - functionStartTime < MAX_FUNCTION_RUNTIME_MS) {
        await new Promise((r) => setTimeout(r, INTER_BATCH_DELAY_MS));
      }
    }

    // Complete enrichment job (non-blocking)
    if (enrichmentJobId) {
      const jobStatus = totalRateLimited > 0 ? 'paused' : totalFailed > 0 ? 'failed' : 'completed';
      Promise.resolve(
        supabase.rpc('complete_enrichment_job', { p_job_id: enrichmentJobId, p_status: jobStatus }),
      ).catch((err: unknown) => {
        console.warn('[buyer-enrichment-jobs] Progress update failed:', err);
      });
    }

    // If we processed some but queue isn't empty, trigger another invocation.
    // When rate limited, schedule a DELAYED continuation after the cooldown period
    // instead of stopping entirely (which left the queue permanently stalled).
    const { count: remaining } = await supabase
      .from('buyer_enrichment_queue')
      .select('id', { count: 'exact', head: true })
      .in('status', ['pending']);

    // Also check for rate-limited items that will become pending soon
    const { count: rateLimitedRemaining } = await supabase
      .from('buyer_enrichment_queue')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'rate_limited');

    const totalRemaining = (remaining || 0) + (rateLimitedRemaining || 0);

    if (totalRemaining > 0) {
      // BUG-4 FIX: Guard against infinite self-continuation loops
      if (continuationCount >= MAX_CONTINUATIONS) {
        console.error(
          `MAX_CONTINUATIONS (${MAX_CONTINUATIONS}) reached — stopping self-continuation to prevent infinite loop. ${totalRemaining} items still pending.`,
        );
        await completeGlobalQueueOperation(supabase, 'buyer_enrichment', 'failed');
      } else {
        // Determine delay: if rate limited, wait for cooldown + jitter before continuing
        const continuationDelayMs =
          totalRateLimited > 0 ? RATE_LIMIT_BACKOFF_MS + Math.random() * 5000 : 0;

        if (continuationDelayMs > 0) {
          console.log(
            `${totalRemaining} buyers remaining (${rateLimitedRemaining} rate-limited). Scheduling continuation ${continuationCount + 1}/${MAX_CONTINUATIONS} in ${Math.round(continuationDelayMs / 1000)}s...`,
          );
        } else {
          console.log(
            `${remaining} buyers still pending, triggering continuation ${continuationCount + 1}/${MAX_CONTINUATIONS}...`,
          );
        }

        // Self-continuation with optional delay for rate-limit recovery.
        // Retry up to 3 times with exponential backoff if the trigger itself fails.
        const triggerContinuation = async () => {
          if (continuationDelayMs > 0) {
            await new Promise((r) => setTimeout(r, continuationDelayMs));
          }
          for (let attempt = 0; attempt < 3; attempt++) {
            try {
              await fetch(`${supabaseUrl}/functions/v1/process-buyer-enrichment-queue`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  apikey: supabaseAnonKey,
                  Authorization: `Bearer ${supabaseServiceKey}`,
                },
                body: JSON.stringify({
                  continuation: true,
                  continuationCount: continuationCount + 1,
                }),
                signal: AbortSignal.timeout(30_000),
              });
              return; // success
            } catch (err) {
              console.warn(`Self-continuation trigger attempt ${attempt + 1} failed:`, err);
              if (attempt < 2) await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
            }
          }
          console.error(
            'Self-continuation failed after 3 attempts — queue may stall. Items will recover on next manual trigger.',
          );
        };
        triggerContinuation().catch((err: unknown) => {
          console.warn('[process-buyer-enrichment-queue] Continuation trigger failed:', err);
        });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        processed: totalProcessed,
        succeeded: totalSucceeded,
        failed: totalFailed,
        rateLimited: totalRateLimited,
        remaining: remaining || 0,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('Error in process-buyer-enrichment-queue:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ success: false, error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
