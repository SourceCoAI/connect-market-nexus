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
const PROCESSING_TIMEOUT_MS = 45000; // 45s per buyer — must complete within the function's 50s runtime budget
const RATE_LIMIT_BACKOFF_MS = 60000; // 60s backoff on rate limit
const STALE_PROCESSING_MINUTES = 2; // Recovery timeout for stuck items (reduced from 5 to prevent long freezes)
const MAX_FUNCTION_RUNTIME_MS = 50000; // 50s — must stay well under the 58s edge function hard-kill limit
const INTER_BUYER_DELAY_MS = 200; // 200ms breathing room between buyers
const MAX_CONTINUATIONS = 50; // Prevent infinite self-continuation loops

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

    // LOOP: Process buyers continuously until queue is empty or time runs out
    const functionStartTime = Date.now();
    let totalProcessed = 0;
    let totalSucceeded = 0;
    let totalFailed = 0;
    let totalRateLimited = 0;

    while (true) {
      // Time guard: stop before Deno's execution limit
      if (Date.now() - functionStartTime > MAX_FUNCTION_RUNTIME_MS) {
        console.log(
          `Time limit reached after ${totalProcessed} buyers, will continue on next invocation`,
        );
        break;
      }

      // Check if operation was paused by user
      if (await isOperationPaused(supabase, 'buyer_enrichment')) {
        console.log('Buyer enrichment paused by user — stopping');
        break;
      }

      // Fetch next pending item
      const { data: queueItems, error: fetchError } = await supabase
        .from('buyer_enrichment_queue')
        .select('id, buyer_id, universe_id, status, attempts, queued_at, force')
        .eq('status', 'pending')
        .lt('attempts', MAX_ATTEMPTS)
        .order('queued_at', { ascending: true })
        .limit(1);

      if (fetchError) {
        console.error('Error fetching queue items:', fetchError);
        break;
      }

      if (!queueItems || queueItems.length === 0) {
        console.log(`No more pending items. Processed ${totalProcessed} buyers this run.`);
        await completeGlobalQueueOperation(supabase, 'buyer_enrichment');
        break;
      }

      const item = queueItems[0];
      console.log(
        `Processing buyer ${item.buyer_id} (attempt ${item.attempts + 1}) [#${totalProcessed + 1} this run]`,
      );

      const itemForce = item.force === true;

      // BUG-7 FIX: Improved freshness check — only skip if the ENRICHMENT PROCESS itself
      // updated the buyer recently, not just any edit. Previously, a manual note edit would
      // bump data_last_updated and cause enrichment to be skipped.
      // We now check extraction_sources for a recent enrichment-sourced update.
      // Bypassed when force=true (explicit user re-enrichment request).
      if (!itemForce) {
        const { data: buyerData } = await supabase
          .from('remarketing_buyers')
          .select('data_last_updated, extraction_sources')
          .eq('id', item.buyer_id)
          .single();

        if (buyerData?.data_last_updated) {
          const lastUpdatedMs = new Date(buyerData.data_last_updated).getTime();
          const freshnessWindowMs = STALE_PROCESSING_MINUTES * 60 * 1000;

          // Only skip if the update was recent AND came from an enrichment source
          // (platform_website, pe_firm_website, or transcript), not a manual edit.
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
            // Check if this source's timestamp is within the freshness window
            const srcTimestamp = (src.extracted_at as string) || (src.timestamp as string);
            if (!srcTimestamp) return false;
            const srcMs = new Date(srcTimestamp).getTime();
            return Date.now() - srcMs < freshnessWindowMs;
          });

          if (Date.now() - lastUpdatedMs < freshnessWindowMs && hasRecentEnrichmentSource) {
            console.log(
              `Skipping buyer ${item.buyer_id} — enrichment data is fresh (${buyerData.data_last_updated}), marking completed`,
            );
            await supabase
              .from('buyer_enrichment_queue')
              .update({
                status: 'completed',
                completed_at: new Date().toISOString(),
                last_error: 'Skipped: buyer enrichment data already fresh',
                updated_at: new Date().toISOString(),
              })
              .eq('id', item.id);
            totalProcessed++;
            totalSucceeded++;
            await updateGlobalQueueProgress(supabase, 'buyer_enrichment', { completedDelta: 1 });
            continue;
          }
        }
      }

      // Check rate limiter before dispatching — wait if Gemini is in cooldown
      const availability = await checkProviderAvailability(supabase, 'gemini');
      if (!availability.ok) {
        const waitMs = availability.retryAfterMs || RATE_LIMIT_BACKOFF_MS;
        if (waitMs > 30000) {
          console.log(
            `Gemini rate limited for ${Math.round(waitMs / 1000)}s — stopping queue processing`,
          );
          totalRateLimited++;
          break;
        }
        console.log(
          `Gemini rate limited — waiting ${Math.round(waitMs / 1000)}s before processing buyer`,
        );
        await new Promise((r) => setTimeout(r, waitMs));
      }

      // Atomically claim this item; if another worker already claimed it, skip safely.
      const { data: claimedItem, error: claimError } = await supabase
        .from('buyer_enrichment_queue')
        .update({
          status: 'processing',
          attempts: item.attempts + 1,
          started_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', item.id)
        .eq('status', 'pending')
        .select('id')
        .maybeSingle();

      if (claimError) {
        console.error(`Failed to claim queue item ${item.id}:`, claimError);
        break;
      }

      if (!claimedItem) {
        console.log(`Buyer ${item.buyer_id} was claimed by another worker, skipping`);
        continue;
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), PROCESSING_TIMEOUT_MS);

      try {
        const response = await fetch(`${supabaseUrl}/functions/v1/enrich-buyer`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: supabaseAnonKey,
            Authorization: `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({
            buyerId: item.buyer_id,
            skipLock: true,
            forceReExtract: itemForce,
          }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);
        const data = await response.json().catch(() => ({}));

        if (response.status === 429 || data.error_code === 'rate_limited') {
          const resetAt =
            data.resetTime || new Date(Date.now() + RATE_LIMIT_BACKOFF_MS).toISOString();
          // Report to shared rate limiter so other functions/invocations know
          await reportRateLimit(supabase, 'gemini', RATE_LIMIT_BACKOFF_MS / 1000);
          await supabase
            .from('buyer_enrichment_queue')
            .update({
              status: 'rate_limited',
              rate_limit_reset_at: resetAt,
              last_error: 'Rate limited - will retry after reset',
              updated_at: new Date().toISOString(),
            })
            .eq('id', item.id);
          console.log(`Rate limited at buyer ${item.buyer_id}, stopping loop`);
          totalRateLimited++;
          totalProcessed++;

          // Track rate limit in enrichment job
          if (enrichmentJobId) {
            Promise.resolve(
              supabase.rpc('update_enrichment_job_progress', {
                p_job_id: enrichmentJobId,
                p_rate_limited: true,
              }),
            ).catch((err: unknown) => {
              console.warn('[buyer-enrichment-jobs] Progress update failed:', err);
            });
          }
          logEnrichmentEvent(supabase, {
            entityType: 'buyer',
            entityId: item.buyer_id,
            provider: 'gemini',
            functionName: 'process-buyer-enrichment-queue',
            stepName: 'enrich-buyer',
            status: 'rate_limited',
            jobId: enrichmentJobId || undefined,
          });

          break; // Stop processing on rate limit
        }

        if (!response.ok || !data.success) {
          throw new Error(data.error || `HTTP ${response.status}`);
        }

        const wasPartial = data.extractionDetails?.rateLimited === true;
        if (wasPartial && item.attempts < MAX_ATTEMPTS - 1) {
          await supabase
            .from('buyer_enrichment_queue')
            .update({
              status: 'pending',
              started_at: null,
              last_error: `Partial: ${data.extractionDetails?.promptsSuccessful}/${data.extractionDetails?.promptsRun} prompts completed`,
              updated_at: new Date().toISOString(),
            })
            .eq('id', item.id);
        } else {
          await supabase
            .from('buyer_enrichment_queue')
            .update({
              status: 'completed',
              completed_at: new Date().toISOString(),
              force: false,
              last_error: wasPartial
                ? `Partial: ${data.extractionDetails?.promptsSuccessful}/${data.extractionDetails?.promptsRun} prompts`
                : null,
              updated_at: new Date().toISOString(),
            })
            .eq('id', item.id);
        }

        await updateGlobalQueueProgress(supabase, 'buyer_enrichment', { completedDelta: 1 });
        totalSucceeded++;

        // Enrichment job progress (non-blocking)
        if (enrichmentJobId) {
          Promise.resolve(
            supabase.rpc('update_enrichment_job_progress', {
              p_job_id: enrichmentJobId,
              p_succeeded_delta: 1,
              p_last_processed_id: item.buyer_id,
            }),
          ).catch((err: unknown) => {
            console.warn('[buyer-enrichment-jobs] Progress update failed:', err);
          });
        }
        logEnrichmentEvent(supabase, {
          entityType: 'buyer',
          entityId: item.buyer_id,
          provider: 'pipeline',
          functionName: 'process-buyer-enrichment-queue',
          stepName: 'enrich-buyer',
          status: 'success',
          jobId: enrichmentJobId || undefined,
        });
      } catch (error) {
        clearTimeout(timeoutId);
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        const currentAttempts = item.attempts + 1;
        const newStatus = currentAttempts >= MAX_ATTEMPTS ? 'failed' : 'pending';

        await supabase
          .from('buyer_enrichment_queue')
          .update({
            status: newStatus,
            last_error: errorMsg,
            started_at: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', item.id);

        console.error(`Failed to enrich buyer ${item.buyer_id}:`, errorMsg);
        await updateGlobalQueueProgress(supabase, 'buyer_enrichment', {
          failedDelta: 1,
          errorEntry: { itemId: item.buyer_id, error: errorMsg },
        });
        totalFailed++;

        // Enrichment job progress (non-blocking)
        if (enrichmentJobId) {
          Promise.resolve(
            supabase.rpc('update_enrichment_job_progress', {
              p_job_id: enrichmentJobId,
              p_failed_delta: 1,
              p_last_processed_id: item.buyer_id,
              p_error_message: errorMsg,
            }),
          ).catch((err: unknown) => {
            console.warn('[buyer-enrichment-jobs] Progress update failed:', err);
          });
        }
        logEnrichmentEvent(supabase, {
          entityType: 'buyer',
          entityId: item.buyer_id,
          provider: 'pipeline',
          functionName: 'process-buyer-enrichment-queue',
          stepName: 'enrich-buyer',
          status: 'failure',
          errorMessage: errorMsg,
          jobId: enrichmentJobId || undefined,
        });
      }

      totalProcessed++;

      // Brief delay between buyers to avoid overwhelming APIs
      if (Date.now() - functionStartTime < MAX_FUNCTION_RUNTIME_MS) {
        await new Promise((r) => setTimeout(r, INTER_BUYER_DELAY_MS));
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
