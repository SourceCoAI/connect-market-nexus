/**
 * EDGE FUNCTION: process-scoring-queue
 *
 * PURPOSE:
 *   Background queue worker that processes pending deal scoring jobs from the
 *   remarketing_scoring_queue table. Claims items atomically, calls
 *   score-deal-buyers for each deal, and upserts results into remarketing_scores.
 *
 * TRIGGERS:
 *   HTTP POST from queueDealScoring() client utility (fire-and-forget)
 *   Body: { trigger?: 'deal-scoring' | 'alignment-scoring' }
 *
 * DATABASE TABLES TOUCHED:
 *   READ:  remarketing_scoring_queue
 *   WRITE: remarketing_scoring_queue, remarketing_scores
 *
 * EXTERNAL APIS:
 *   Calls score-deal-buyers edge function internally for each queued item
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';

// ── Configuration ──
const BATCH_SIZE = 5;
const MAX_ATTEMPTS = 3;
const PROCESSING_TIMEOUT_MS = 30000; // 30s per item
const MAX_FUNCTION_RUNTIME_MS = 50000; // 50s budget
const CIRCUIT_BREAKER_THRESHOLD = 3;
const MAX_CONTINUATIONS = 20;

// ── Tier mapping: score-deal-buyers tiers → remarketing_scores tiers ──
const TIER_MAP: Record<string, string> = {
  move_now: 'A',
  strong: 'B',
  speculative: 'C',
};

// ── Types ──
interface QueueItem {
  id: string;
  universe_id: string;
  listing_id: string;
  score_type: string;
  status: string;
  attempts: number;
}

interface BuyerScore {
  buyer_id: string;
  composite_score: number;
  service_score: number;
  geography_score: number;
  size_score: number;
  bonus_score: number;
  fit_reason: string;
  fit_signals: string[];
  tier: string;
  source: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(req);
  }

  const corsHeaders = getCorsHeaders(req);

  try {
    const startedAt = Date.now();
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    let body: Record<string, unknown> = {};
    try {
      body = await req.json();
    } catch {
      /* empty body ok */
    }

    console.log('[process-scoring-queue] Starting...');

    // ── Recovery: reset stale processing items ──
    const staleCutoffIso = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { error: staleResetError } = await supabase
      .from('remarketing_scoring_queue')
      .update({
        status: 'pending',
        last_error: 'Recovered from stale processing state',
        updated_at: new Date().toISOString(),
      })
      .eq('status', 'processing')
      .lt('updated_at', staleCutoffIso);

    if (staleResetError) {
      console.warn('[process-scoring-queue] Failed to reset stale items:', staleResetError);
    }

    // ── Claim pending deal-scoring items ──
    const { data: pendingItems, error: fetchError } = await supabase
      .from('remarketing_scoring_queue')
      .select('id, universe_id, listing_id, score_type, status, attempts')
      .eq('status', 'pending')
      .eq('score_type', 'deal')
      .lt('attempts', MAX_ATTEMPTS)
      .not('listing_id', 'is', null)
      .order('created_at', { ascending: true })
      .limit(BATCH_SIZE);

    if (fetchError) {
      console.error('[process-scoring-queue] Fetch error:', fetchError);
      throw fetchError;
    }

    // Atomically claim items (prevents race conditions with concurrent workers)
    const claimedItems: QueueItem[] = [];
    if (pendingItems && pendingItems.length > 0) {
      await Promise.all(
        pendingItems.map(async (item) => {
          const { data: updated } = await supabase
            .from('remarketing_scoring_queue')
            .update({
              status: 'processing',
              attempts: item.attempts + 1,
              updated_at: new Date().toISOString(),
            })
            .eq('id', item.id)
            .eq('status', 'pending')
            .select('id, universe_id, listing_id, score_type, status, attempts')
            .maybeSingle();

          if (updated) {
            claimedItems.push(updated as QueueItem);
          }
        }),
      );
      console.log(
        `[process-scoring-queue] Claimed ${claimedItems.length} of ${pendingItems.length} items`,
      );
    }

    if (claimedItems.length === 0) {
      console.log('[process-scoring-queue] No pending items');
      return new Response(
        JSON.stringify({ success: true, message: 'No pending items', processed: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // ── Process each item ──
    const results = { processed: 0, succeeded: 0, failed: 0, errors: [] as string[] };
    let consecutiveFailures = 0;
    let circuitBroken = false;

    for (const item of claimedItems) {
      // Safety cutoff
      if (Date.now() - startedAt > MAX_FUNCTION_RUNTIME_MS) {
        console.log('[process-scoring-queue] Stopping early to avoid timeout');
        // Reset unclaimed items back to pending
        await supabase
          .from('remarketing_scoring_queue')
          .update({ status: 'pending', updated_at: new Date().toISOString() })
          .eq('id', item.id)
          .eq('status', 'processing');
        break;
      }

      if (consecutiveFailures >= CIRCUIT_BREAKER_THRESHOLD) {
        console.warn(
          `[process-scoring-queue] Circuit breaker: ${consecutiveFailures} consecutive failures`,
        );
        circuitBroken = true;
        // Reset this item back to pending for retry
        await supabase
          .from('remarketing_scoring_queue')
          .update({ status: 'pending', updated_at: new Date().toISOString() })
          .eq('id', item.id)
          .eq('status', 'processing');
        break;
      }

      results.processed++;

      try {
        console.log(
          `[process-scoring-queue] Scoring listing ${item.listing_id} (universe: ${item.universe_id})`,
        );

        // Call score-deal-buyers via internal HTTP
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), PROCESSING_TIMEOUT_MS);

        const response = await fetch(`${supabaseUrl}/functions/v1/score-deal-buyers`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: supabaseAnonKey,
            Authorization: `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({
            listingId: item.listing_id,
            forceRefresh: true,
          }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errText = await response.text().catch(() => 'Unknown error');
          throw new Error(`score-deal-buyers returned ${response.status}: ${errText}`);
        }

        const data = await response.json();
        const buyers: BuyerScore[] = data.buyers || [];

        if (buyers.length === 0) {
          console.log(`[process-scoring-queue] No buyers scored for listing ${item.listing_id}`);
        } else {
          // Upsert scored buyers into remarketing_scores
          // Process in chunks to avoid hitting request size limits
          const UPSERT_CHUNK = 25;
          for (let i = 0; i < buyers.length; i += UPSERT_CHUNK) {
            const chunk = buyers.slice(i, i + UPSERT_CHUNK);
            const rows = chunk.map((b) => ({
              listing_id: item.listing_id,
              buyer_id: b.buyer_id,
              universe_id: item.universe_id,
              composite_score: b.composite_score,
              service_score: b.service_score,
              geography_score: b.geography_score,
              size_score: b.size_score,
              owner_goals_score: b.bonus_score,
              fit_reasoning: b.fit_reason,
              tier: TIER_MAP[b.tier] || 'C',
              scored_at: data.scored_at || new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }));

            const { error: upsertError } = await supabase
              .from('remarketing_scores')
              .upsert(rows, { onConflict: 'listing_id,buyer_id,universe_id' });

            if (upsertError) {
              console.error(
                `[process-scoring-queue] Upsert error for listing ${item.listing_id}:`,
                upsertError.message,
              );
              // Continue with remaining chunks even if one fails
            }
          }

          console.log(
            `[process-scoring-queue] Upserted ${buyers.length} scores for listing ${item.listing_id}`,
          );
        }

        // Mark queue item as completed
        await supabase
          .from('remarketing_scoring_queue')
          .update({
            status: 'completed',
            processed_at: new Date().toISOString(),
            last_error: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', item.id);

        results.succeeded++;
        consecutiveFailures = 0;
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error(`[process-scoring-queue] Failed for listing ${item.listing_id}:`, errorMsg);

        const newStatus = item.attempts >= MAX_ATTEMPTS ? 'failed' : 'pending';
        await supabase
          .from('remarketing_scoring_queue')
          .update({
            status: newStatus,
            last_error: errorMsg,
            updated_at: new Date().toISOString(),
          })
          .eq('id', item.id);

        results.failed++;
        consecutiveFailures++;
        results.errors.push(`${item.listing_id}: ${errorMsg}`);
      }
    }

    console.log(
      `[process-scoring-queue] Done: ${results.succeeded} succeeded, ${results.failed} failed out of ${results.processed}${circuitBroken ? ' [CIRCUIT BREAKER]' : ''}`,
    );

    // ── Self-continuation if more items remain ──
    const { count: remainingCount } = await supabase
      .from('remarketing_scoring_queue')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending')
      .eq('score_type', 'deal');

    if ((remainingCount ?? 0) > 0) {
      const continuationCount =
        typeof body.continuationCount === 'number' ? body.continuationCount : 0;

      if (continuationCount < MAX_CONTINUATIONS) {
        const delayMs = circuitBroken ? 15000 : 1000;
        console.log(
          `[process-scoring-queue] ${remainingCount} items remaining — continuation ${continuationCount + 1}/${MAX_CONTINUATIONS} in ${delayMs}ms`,
        );

        const triggerContinuation = async () => {
          await new Promise((r) => setTimeout(r, delayMs));
          for (let attempt = 0; attempt < 3; attempt++) {
            try {
              await fetch(`${supabaseUrl}/functions/v1/process-scoring-queue`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${supabaseServiceKey}`,
                  apikey: supabaseAnonKey,
                },
                body: JSON.stringify({
                  trigger: 'self-continuation',
                  continuationCount: continuationCount + 1,
                }),
                signal: AbortSignal.timeout(30_000),
              });
              return;
            } catch (err) {
              console.warn(
                `[process-scoring-queue] Continuation attempt ${attempt + 1} failed:`,
                err,
              );
              if (attempt < 2) await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
            }
          }
          console.error('[process-scoring-queue] Self-continuation failed after 3 attempts');
        };
        triggerContinuation().catch((err) => {
          console.warn('[process-scoring-queue] Continuation trigger failed:', err);
        });
      } else {
        console.error(
          `[process-scoring-queue] MAX_CONTINUATIONS (${MAX_CONTINUATIONS}) reached — stopping`,
        );
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Processed ${results.processed} items`,
        remaining: remainingCount ?? 0,
        ...results,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('[process-scoring-queue] Fatal error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ success: false, error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
