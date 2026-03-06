/**
 * EDGE FUNCTION: process-enrichment-queue
 *
 * PURPOSE:
 *   Background queue worker that processes pending deal enrichment jobs from the
 *   enrichment_queue table. Claims items atomically (via RPC or fallback),
 *   processes them in parallel batches with configurable concurrency, handles
 *   retries (up to 3 attempts), stale job recovery, and self-continuation for
 *   large queues. Delegates actual enrichment to the enrich-deal function.
 *
 * TRIGGERS:
 *   HTTP POST request (scheduled via cron or manual invocation)
 *   Body: { action?: 'cancel_pending', before?: ISO string } for cancellation
 *
 * DATABASE TABLES TOUCHED:
 *   READ:  enrichment_queue, rate_limit_config
 *   WRITE: enrichment_queue, enrichment_events, global_activity_queue
 *
 * EXTERNAL APIS:
 *   Calls enrich-deal edge function internally for each queued item
 *
 * LAST UPDATED: 2026-02-26
 * AUDIT REF: CTO Audit February 2026
 */
import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { runListingEnrichmentPipeline } from './enrichmentPipeline.ts';
import {
  updateGlobalQueueProgress,
  completeGlobalQueueOperation,
  isOperationPaused,
} from '../_shared/global-activity-queue.ts';
import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';
import { checkProviderAvailability } from '../_shared/rate-limiter.ts';
import { logEnrichmentEvent } from '../_shared/enrichment-events.ts';

// Configuration - RELIABILITY-FIRST
// Moderate parallelism to avoid rate limits across concurrent queue processors.
// Each deal enrichment makes 1 Firecrawl + 1 Gemini + optional LinkedIn/Google calls.
const BATCH_SIZE = 10; // Fetch 10 items per run
const CONCURRENCY_LIMIT = 3; // Process 3 items in parallel — enrich-deal now includes notes analysis (30s+)
const MAX_ATTEMPTS = 3; // Maximum retry attempts
const PROCESSING_TIMEOUT_MS = 120000; // 120s per item — enrich-deal processes transcripts + notes + website
const INTER_CHUNK_DELAY_MS = 1000; // 1s between parallel chunks

// Stop early to avoid the platform killing the function mid-item.
// enrich-deal uses 140s budget internally, so this worker needs at least that long.
const MAX_FUNCTION_RUNTIME_MS = 140000; // 140s — matches enrich-deal's internal budget

// N06 FIX: Maximum number of self-continuations to prevent infinite loops.
// Each invocation processes BATCH_SIZE items, so 50 continuations = up to 500 items.
const MAX_CONTINUATIONS = 50;

// Helper to chunk array into smaller arrays
function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(req);
  }

  try {
    const startedAt = Date.now();
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Use service role for background processing
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse request body
    let body: Record<string, unknown> = {};
    try {
      body = await req.json();
    } catch {
      /* empty body ok */
    }

    // Action: cancel all pending items (optionally before a cutoff)
    if (body.action === 'cancel_pending') {
      const cutoffIso = (body.before as string) || new Date().toISOString();
      const { data: cancelled, error: cancelErr } = await supabase
        .from('enrichment_queue')
        .update({
          status: 'failed',
          completed_at: new Date().toISOString(),
          last_error: 'Cancelled by user',
        })
        .eq('status', 'pending')
        .lt('queued_at', cutoffIso)
        .select('id');

      if (cancelErr) {
        console.error('Cancel error:', cancelErr);
        return new Response(JSON.stringify({ error: cancelErr.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const count = cancelled?.length || 0;
      console.log(`Cancelled ${count} pending items before ${cutoffIso}`);
      return new Response(JSON.stringify({ cancelled: count }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Processing enrichment queue (PARALLEL MODE)...');

    // Recovery: reset any items that were left in `processing` due to timeouts/crashes.
    // This prevents the UI from showing a stuck "processing" count forever.
    const staleCutoffIso = new Date(Date.now() - 10 * 60 * 1000).toISOString(); // 10 min
    const { error: staleResetError } = await supabase
      .from('enrichment_queue')
      .update({
        status: 'pending',
        started_at: null,
        updated_at: new Date().toISOString(),
        last_error: 'Recovered from stale processing state',
      })
      .eq('status', 'processing')
      .lt('started_at', staleCutoffIso);

    if (staleResetError) {
      console.warn('Failed to reset stale processing items:', staleResetError);
    }

    // Use RPC to atomically claim items (prevents race conditions)
    // BUG-1 FIX: Both RPC and fallback now return items with post-increment `attempts`
    // values, so the result handler can use `item.attempts` uniformly without branching.
    const { data: claimedItems, error: claimError } = await supabase.rpc(
      'claim_enrichment_queue_items',
      { batch_size: BATCH_SIZE, max_attempts: MAX_ATTEMPTS },
    );

    // Define type for queue items
    // `attempts` is always the POST-INCREMENT value (after claiming), regardless of RPC vs fallback.
    type QueueItem = {
      id: string;
      listing_id: string;
      status: string;
      attempts: number;
      queued_at: string;
      force?: boolean;
    };

    // Fallback to regular query if RPC doesn't exist yet
    let queueItems: QueueItem[] = (claimedItems as QueueItem[]) || [];
    if (claimError?.code === 'PGRST202') {
      console.log('Using fallback queue fetch (RPC not available)');

      const { data: pendingItems, error: fetchError } = await supabase
        .from('enrichment_queue')
        .select(`id, listing_id, status, attempts, queued_at, force`)
        .eq('status', 'pending')
        .lt('attempts', MAX_ATTEMPTS)
        .order('queued_at', { ascending: true })
        .limit(BATCH_SIZE);

      if (fetchError) {
        console.error('Error fetching queue items:', fetchError);
        throw fetchError;
      }

      // Atomically claim these items to prevent race conditions with concurrent workers.
      // Mark them as 'processing' immediately; items that were already claimed by another
      // worker will fail the status='pending' check and be filtered out.
      // The .select() returns the row AFTER the update, so `attempts` is post-increment.
      if (pendingItems && pendingItems.length > 0) {
        const claimed: QueueItem[] = [];
        await Promise.all(
          pendingItems.map(async (item) => {
            const { data: updated } = await supabase
              .from('enrichment_queue')
              .update({
                status: 'processing',
                attempts: item.attempts + 1,
                started_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              })
              .eq('id', item.id)
              .eq('status', 'pending') // Only succeeds if still pending (atomic check)
              .select('id, listing_id, status, attempts, queued_at, force')
              .maybeSingle();

            if (updated) {
              claimed.push(updated as QueueItem);
            }
          }),
        );
        queueItems = claimed;
        console.log(
          `Fallback: claimed ${claimed.length} of ${pendingItems.length} items atomically`,
        );
      } else {
        queueItems = [];
      }
    } else if (claimError) {
      console.error('Error claiming queue items:', claimError);
      throw claimError;
    }

    if (!queueItems || queueItems.length === 0) {
      console.log('No pending enrichment items in queue');
      // Complete any running global queue operation that has no more work
      await completeGlobalQueueOperation(supabase, 'deal_enrichment');
      return new Response(
        JSON.stringify({ success: true, message: 'No pending items', processed: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    console.log(`Found ${queueItems.length} items to process`);

    // Create enrichment job for observability tracking (non-blocking on failure)
    let enrichmentJobId: string | null = null;
    try {
      const { data: jobData } = await supabase.rpc('upsert_enrichment_job', {
        p_job_type: 'deal_enrichment',
        p_total_records: queueItems.length,
        p_source: body.source === 'self-continuation' ? 'scheduled' : 'manual',
      });
      enrichmentJobId = jobData;
      if (enrichmentJobId) console.log(`[enrichment-jobs] Created job ${enrichmentJobId}`);
    } catch (err) {
      console.warn('[enrichment-jobs] Failed to create job (non-blocking):', err);
    }

    // PRE-CHECK: Mark batch items as completed if their listings are already well-enriched.
    // BUG-8 FIX: Previously only checked `enriched_at IS NOT NULL`, but enriched_at can be
    // set even after partial failures (e.g., website scrape failed but timestamp was set).
    // Now requires enriched_at + at least one quality indicator (executive_summary or industry).
    // Items with force=true bypass this check (explicit re-enrichment request).
    const forceItems = queueItems.filter((item: { force?: boolean }) => item.force === true);
    const nonForceItems = queueItems.filter((item: { force?: boolean }) => item.force !== true);

    if (forceItems.length > 0) {
      console.log(
        `${forceItems.length} item(s) have force=true — will re-enrich regardless of enriched_at`,
      );
    }

    if (nonForceItems.length > 0) {
      const nonForceListingIds = nonForceItems.map(
        (item: { listing_id: string }) => item.listing_id,
      );
      const { data: enrichedListings } = await supabase
        .from('listings')
        .select('id, enriched_at, executive_summary, industry')
        .in('id', nonForceListingIds)
        .not('enriched_at', 'is', null);

      // Only consider a listing "already enriched" if it has enriched_at AND
      // meaningful data (executive_summary or industry populated).
      const alreadyEnrichedIds = new Set(
        (enrichedListings || []).filter((l) => l.executive_summary || l.industry).map((l) => l.id),
      );

      const partiallyEnrichedCount = (enrichedListings || []).length - alreadyEnrichedIds.size;
      if (partiallyEnrichedCount > 0) {
        console.log(
          `${partiallyEnrichedCount} listings have enriched_at but lack quality data — will re-enrich`,
        );
      }

      if (alreadyEnrichedIds.size > 0) {
        console.log(
          `Found ${alreadyEnrichedIds.size} listings with quality enrichment data — marking non-force queue items as completed`,
        );

        const itemsToComplete = nonForceItems.filter((item: { listing_id: string }) =>
          alreadyEnrichedIds.has(item.listing_id),
        );
        const completionResults = await Promise.allSettled(
          itemsToComplete.map((item: { id: string; listing_id: string }) =>
            supabase
              .from('enrichment_queue')
              .update({
                status: 'completed',
                completed_at: new Date().toISOString(),
                last_error: null,
                updated_at: new Date().toISOString(),
              })
              .eq('id', item.id),
          ),
        );
        for (const cr of completionResults) {
          if (cr.status === 'rejected') {
            console.error('Failed to mark enriched item as completed:', cr.reason);
          }
        }

        // BUG-9 FIX: Update global queue progress for auto-completed items.
        // Previously this was skipped, causing the global queue to show incorrect counts.
        if (itemsToComplete.length > 0) {
          await updateGlobalQueueProgress(supabase, 'deal_enrichment', {
            completedDelta: itemsToComplete.length,
          });
        }

        // Remove completed non-force items, keep force items
        const nonForceRemaining = nonForceItems.filter(
          (item: { listing_id: string }) => !alreadyEnrichedIds.has(item.listing_id),
        );
        queueItems = [...forceItems, ...nonForceRemaining];

        if (queueItems.length === 0) {
          console.log(
            `All ${alreadyEnrichedIds.size} items in this batch were already enriched — checking for remaining queue items`,
          );

          // BUG-9 FIX: Don't return early! Check for remaining pending items
          // and trigger self-continuation so the full queue gets processed.
          const { count: remainingPendingCount } = await supabase
            .from('enrichment_queue')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'pending');

          const remainingPending = remainingPendingCount ?? 0;

          if (remainingPending > 0) {
            const continuationCount =
              typeof body.continuationCount === 'number' ? body.continuationCount : 0;

            if (continuationCount < MAX_CONTINUATIONS) {
              console.log(
                `${remainingPending} items still pending — triggering continuation ${continuationCount + 1}/${MAX_CONTINUATIONS}...`,
              );
              const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
              // Fire-and-forget self-continuation
              fetch(`${supabaseUrl}/functions/v1/process-enrichment-queue`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${supabaseServiceKey}`,
                  apikey: anonKey,
                },
                body: JSON.stringify({
                  source: 'self-continuation',
                  continuationCount: continuationCount + 1,
                }),
                signal: AbortSignal.timeout(30_000),
              }).catch((err: unknown) => {
                console.warn('[process-enrichment-queue] Continuation trigger failed:', err);
              });
            } else {
              console.error(
                `MAX_CONTINUATIONS reached — ${remainingPending} items still pending`,
              );
              await completeGlobalQueueOperation(supabase, 'deal_enrichment', 'failed');
            }
          } else {
            await completeGlobalQueueOperation(supabase, 'deal_enrichment');
          }

          return new Response(
            JSON.stringify({
              success: true,
              message: `Synced ${alreadyEnrichedIds.size} already-enriched items to completed`,
              processed: 0,
              synced: alreadyEnrichedIds.size,
              remaining: remainingPending,
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
          );
        }

        console.log(`${queueItems.length} items still need enrichment — proceeding with pipeline`);
      }
    }

    const results = {
      processed: 0,
      succeeded: 0,
      failed: 0,
      errors: [] as string[],
    };

    // Circuit breaker: if consecutive failures exceed threshold, stop processing.
    // This prevents burning through all attempts when the AI provider is down.
    const CIRCUIT_BREAKER_THRESHOLD = 3; // 3 consecutive failures → trip
    let consecutiveFailures = 0;
    let circuitBroken = false;

    // Process items in PARALLEL chunks with inter-chunk delays
    // Moderate parallelism (3 at a time) balances speed vs. API rate limit safety
    const chunks = chunkArray(queueItems, CONCURRENCY_LIMIT);
    let chunkIndex = 0;

    for (const chunk of chunks) {
      // Safety cutoff - check before each chunk
      if (Date.now() - startedAt > MAX_FUNCTION_RUNTIME_MS) {
        console.log('Stopping early to avoid function timeout');
        break;
      }

      // Circuit breaker: stop if we've hit too many consecutive failures
      if (consecutiveFailures >= CIRCUIT_BREAKER_THRESHOLD) {
        console.warn(
          `[CIRCUIT BREAKER] ${consecutiveFailures} consecutive failures — stopping to prevent attempt exhaustion. Remaining items will retry on next invocation.`,
        );
        circuitBroken = true;
        break;
      }

      // Check if operation was paused by user
      if (await isOperationPaused(supabase, 'deal_enrichment')) {
        console.log('Operation paused by user — stopping processing');
        break;
      }

      // Add delay between chunks to spread API load (not before first chunk)
      if (chunkIndex > 0 && INTER_CHUNK_DELAY_MS > 0) {
        // Check if Gemini is in cooldown before starting next chunk
        const availability = await checkProviderAvailability(supabase, 'gemini');
        if (!availability.ok && availability.retryAfterMs) {
          // If cooldown exceeds our remaining runtime budget, break and let
          // self-continuation handle it after the cooldown passes.
          const timeRemaining = MAX_FUNCTION_RUNTIME_MS - (Date.now() - startedAt);
          if (availability.retryAfterMs > timeRemaining) {
            console.log(
              `Gemini cooldown (${Math.round(availability.retryAfterMs / 1000)}s) exceeds remaining runtime (${Math.round(timeRemaining / 1000)}s) — breaking for delayed continuation`,
            );
            circuitBroken = true; // Use circuit breaker path for delayed continuation
            break;
          }
          const cooldownWait = availability.retryAfterMs + Math.random() * 2000; // Add jitter
          console.log(
            `Gemini in cooldown — waiting ${Math.round(cooldownWait / 1000)}s before next chunk`,
          );
          await new Promise((r) => setTimeout(r, cooldownWait));
        } else {
          console.log(`Waiting ${INTER_CHUNK_DELAY_MS}ms between chunks to avoid rate limits...`);
          await new Promise((r) => setTimeout(r, INTER_CHUNK_DELAY_MS));
        }
      }
      chunkIndex++;

      console.log(`Processing chunk of ${chunk.length} items in parallel...`);

      // Items are already marked as 'processing' by either:
      // - The RPC claim_enrichment_queue_items call
      // - The fallback atomic claim loop above
      // No additional status update needed here.

      // Process entire chunk in parallel
      const chunkResults = await Promise.allSettled(
        chunk.map(async (item: { id: string; listing_id: string; attempts: number }) => {
          try {
            console.log(`Processing queue item ${item.id} for listing ${item.listing_id}`);

            // Fetch listing context
            const { data: listing, error: listingError } = await supabase
              .from('listings')
              .select(
                'internal_company_name, title, address_city, address_state, address, linkedin_url, website',
              )
              .eq('id', item.listing_id)
              .single();

            if (listingError || !listing) {
              throw new Error(
                `Failed to fetch listing context: ${listingError?.message || 'not found'}`,
              );
            }

            const pipeline = await runListingEnrichmentPipeline(
              {
                supabaseUrl,
                serviceRoleKey: supabaseServiceKey,
                listingId: item.listing_id,
                timeoutMs: PROCESSING_TIMEOUT_MS,
                force: (item as { force?: boolean }).force === true,
              },
              listing,
            );

            return { item, pipeline };
          } catch (error) {
            // Re-throw with item context so the allSettled rejected branch can still update the row.
            throw { item, error };
          }
        }),
      );

      // Process results from this chunk
      for (const result of chunkResults) {
        results.processed++;

        if (result.status === 'fulfilled') {
          const { item, pipeline } = result.value;
          // BUG-1 FIX: `item.attempts` is always the post-increment value (set during claim).
          // Both RPC and fallback paths return the row after the UPDATE, so no branching needed.
          const currentAttempts = item.attempts;

          if (pipeline.ok) {
            // Success
            await supabase
              .from('enrichment_queue')
              .update({
                status: 'completed',
                completed_at: new Date().toISOString(),
                last_error: null,
                force: false,
                updated_at: new Date().toISOString(),
              })
              .eq('id', item.id);

            console.log(
              `Successfully enriched listing ${item.listing_id}: ${pipeline.fieldsUpdated.length} fields`,
            );
            results.succeeded++;
            consecutiveFailures = 0; // Reset circuit breaker on success
            await updateGlobalQueueProgress(supabase, 'deal_enrichment', { completedDelta: 1 });

            // Enrichment job progress (non-blocking)
            if (enrichmentJobId) {
              Promise.resolve(
                supabase.rpc('update_enrichment_job_progress', {
                  p_job_id: enrichmentJobId,
                  p_succeeded_delta: 1,
                  p_last_processed_id: item.listing_id,
                }),
              ).catch((err: unknown) => {
                console.warn('[enrichment-jobs] Progress update failed:', err);
              });
            }
            // Enrichment event (non-blocking)
            logEnrichmentEvent(supabase, {
              entityType: 'deal',
              entityId: item.listing_id,
              provider: 'pipeline',
              functionName: 'process-enrichment-queue',
              stepName: 'enrich-deal',
              status: 'success',
              fieldsUpdated: pipeline.fieldsUpdated.length,
              jobId: enrichmentJobId || undefined,
            });
          } else {
            // Pipeline error
            const newStatus = currentAttempts >= MAX_ATTEMPTS ? 'failed' : 'pending';
            await supabase
              .from('enrichment_queue')
              .update({
                status: newStatus,
                last_error: pipeline.error,
                updated_at: new Date().toISOString(),
              })
              .eq('id', item.id);

            console.error(`Enrichment failed for listing ${item.listing_id}: ${pipeline.error}`);
            results.failed++;
            consecutiveFailures++;
            results.errors.push(`${item.listing_id}: ${pipeline.error}`);
            await updateGlobalQueueProgress(supabase, 'deal_enrichment', {
              failedDelta: 1,
              errorEntry: { itemId: item.listing_id, error: pipeline.error || 'Unknown error' },
            });

            // Enrichment job progress (non-blocking)
            if (enrichmentJobId) {
              Promise.resolve(
                supabase.rpc('update_enrichment_job_progress', {
                  p_job_id: enrichmentJobId,
                  p_failed_delta: 1,
                  p_last_processed_id: item.listing_id,
                  p_error_message: pipeline.error,
                }),
              ).catch((err: unknown) => {
                console.warn('[enrichment-jobs] Progress update failed:', err);
              });
            }
            // Enrichment event (non-blocking)
            logEnrichmentEvent(supabase, {
              entityType: 'deal',
              entityId: item.listing_id,
              provider: 'pipeline',
              functionName: 'process-enrichment-queue',
              stepName: 'enrich-deal',
              status: 'failure',
              errorMessage: pipeline.error,
              jobId: enrichmentJobId || undefined,
            });
          }
        } else {
          // Promise rejected - network/timeout/uncaught error.
          // IMPORTANT: still update the queue row so it doesn't get stuck in `processing`.
          const reason = result.reason as { item?: { id: string; listing_id: string; attempts: number }; error?: unknown } | undefined;
          const item = reason?.item;
          const underlying = reason?.error;

          const errorMsg =
            underlying instanceof Error
              ? underlying.message
              : typeof underlying === 'string'
                ? underlying
                : result.reason instanceof Error
                  ? result.reason.message
                  : 'Unknown error';

          console.error('Processing error:', result.reason);

          if (item?.id) {
            // BUG-1 FIX: item.attempts is always post-increment from the claim step
            const currentAttempts = item.attempts;
            const newStatus = currentAttempts >= MAX_ATTEMPTS ? 'failed' : 'pending';
            await supabase
              .from('enrichment_queue')
              .update({
                status: newStatus,
                last_error: `worker_error: ${errorMsg}`,
                // Clear started_at so it can be re-claimed
                started_at: null,
                updated_at: new Date().toISOString(),
              })
              .eq('id', item.id);

            results.errors.push(`${item.listing_id}: ${errorMsg}`);
          } else {
            results.errors.push(`chunk item: ${errorMsg}`);
          }

          results.failed++;
          consecutiveFailures++;
          await updateGlobalQueueProgress(supabase, 'deal_enrichment', {
            failedDelta: 1,
            errorEntry: { itemId: item?.listing_id || 'unknown', error: errorMsg },
          });
        }
      }
    }

    console.log(
      `Queue processing complete: ${results.succeeded} succeeded, ${results.failed} failed out of ${results.processed} processed${circuitBroken ? ' [CIRCUIT BREAKER TRIPPED]' : ''}`,
    );

    // Complete enrichment job (non-blocking)
    if (enrichmentJobId) {
      const jobStatus = circuitBroken ? 'paused' : results.failed > 0 ? 'failed' : 'completed';
      Promise.resolve(
        supabase.rpc('complete_enrichment_job', { p_job_id: enrichmentJobId, p_status: jobStatus }),
      ).catch((err: unknown) => {
        console.warn('[enrichment-jobs] Progress update failed:', err);
      });
      if (circuitBroken) {
        Promise.resolve(
          supabase.rpc('update_enrichment_job_progress', {
            p_job_id: enrichmentJobId,
            p_circuit_breaker: true,
          }),
        ).catch((err: unknown) => {
          console.warn('[enrichment-jobs] Progress update failed:', err);
        });
      }
    }

    // Check if all items in the enrichment_queue are done (no more pending)
    const { count: remainingPendingCount } = await supabase
      .from('enrichment_queue')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending');

    const { count: remainingProcessingCount } = await supabase
      .from('enrichment_queue')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'processing');

    const remainingPending = (remainingPendingCount ?? 0) + (remainingProcessingCount ?? 0);

    if (remainingPending === 0) {
      await completeGlobalQueueOperation(supabase, 'deal_enrichment');
    } else if (remainingPendingCount === 0 && (remainingProcessingCount ?? 0) > 0) {
      // No pending items, but some still in 'processing' — don't complete yet,
      // they may finish and trigger self-continuation. Only log for observability.
      console.log(
        `No pending items but ${remainingProcessingCount} items still processing — skipping completion, will resolve on next invocation.`,
      );
    } else if (remainingPending > 0) {
      // N06 FIX: Track continuation count to prevent infinite loops
      const continuationCount =
        typeof body.continuationCount === 'number' ? body.continuationCount : 0;

      if (continuationCount >= MAX_CONTINUATIONS) {
        console.error(
          `MAX_CONTINUATIONS (${MAX_CONTINUATIONS}) reached — stopping self-continuation to prevent infinite loop. ${remainingPending} items still pending.`,
        );
        await completeGlobalQueueOperation(supabase, 'deal_enrichment', 'failed');
      } else {
        // When circuit breaker tripped, delay continuation to let the provider recover.
        // Otherwise continue immediately. Retry self-invocation up to 3 times on failure.
        const continuationDelayMs = circuitBroken ? 30000 + Math.random() * 10000 : 0;
        if (circuitBroken) {
          console.log(
            `${remainingPending} items remaining — scheduling delayed continuation ${continuationCount + 1}/${MAX_CONTINUATIONS} in ${Math.round(continuationDelayMs / 1000)}s (circuit breaker recovery)...`,
          );
        } else {
          console.log(
            `${remainingPending} items remaining — triggering continuation ${continuationCount + 1}/${MAX_CONTINUATIONS}...`,
          );
        }

        const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
        const triggerContinuation = async () => {
          if (continuationDelayMs > 0) {
            await new Promise((r) => setTimeout(r, continuationDelayMs));
          }
          for (let attempt = 0; attempt < 3; attempt++) {
            try {
              await fetch(`${supabaseUrl}/functions/v1/process-enrichment-queue`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${supabaseServiceKey}`,
                  apikey: anonKey,
                },
                body: JSON.stringify({
                  source: 'self-continuation',
                  continuationCount: continuationCount + 1,
                }),
                signal: AbortSignal.timeout(30_000),
              });
              return; // success
            } catch (err) {
              console.warn(`Self-continuation attempt ${attempt + 1} failed:`, err);
              if (attempt < 2) await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
            }
          }
          console.error(
            'Self-continuation failed after 3 attempts — queue may stall until next manual trigger.',
          );
        };
        triggerContinuation().catch((err: unknown) => {
          console.warn('[process-enrichment-queue] Continuation trigger failed:', err);
        });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Processed ${results.processed} items (parallel mode)`,
        remaining: remainingPending ?? 0,
        ...results,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('Error in process-enrichment-queue:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ success: false, error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
