import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';
import {
  updateGlobalQueueProgress,
  completeGlobalQueueOperation,
} from '../_shared/global-activity-queue.ts';

/**
 * enrich-external-only
 *
 * Lightweight enrichment that ONLY runs LinkedIn + Google scraping.
 * Skips website scraping and AI extraction entirely.
 * Designed for deals that already have enriched_at but are missing external data.
 *
 * Much faster than full enrichment — ~5-10s per deal vs 30-60s.
 */

const _BATCH_SIZE = 20; // Larger batches since each item is fast
const CONCURRENCY = 5; // Moderate parallelism — avoid overwhelming edge gateway
const MAX_FUNCTION_RUNTIME_MS = 45000; // 45s — safely under the ~60s Supabase wall clock
const PER_ITEM_TIMEOUT_MS = 20000; // 20s per item

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

async function callFn(
  supabaseUrl: string,
  serviceRoleKey: string,
  fnName: string,
  body: Record<string, unknown>,
  timeoutMs: number,
): Promise<{ ok: boolean; status: number; json: Record<string, unknown> | null }> {
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!anonKey) throw new Error('SUPABASE_ANON_KEY not set');

  const res = await fetch(`${supabaseUrl}/functions/v1/${fnName}`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'x-internal-secret': serviceRoleKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });

  let json: Record<string, unknown> | null = null;
  try {
    json = await res.json();
  } catch {
    /* ignore */
  }
  return { ok: res.ok, status: res.status, json };
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') return corsPreflightResponse(req);

  try {
    const startedAt = Date.now();
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    let body: Record<string, unknown> = {};
    try {
      body = await req.json();
    } catch {
      /* empty ok */
    }

    const dealSource = (body.dealSource as string) || 'captarget';
    const mode = (body.mode as string) || 'missing'; // 'missing' = only deals without LI/Google, 'all' = re-scrape everything

    // Find deals that need LinkedIn/Google enrichment
    let query = supabase
      .from('listings')
      .select(
        'id, internal_company_name, title, address_city, address_state, address, linkedin_url, website',
      )
      .eq('deal_source', dealSource)
      .not('enriched_at', 'is', null);

    if (mode === 'missing') {
      // Only deals missing BOTH LinkedIn and Google
      query = query.is('linkedin_employee_count', null).is('google_review_count', null);
    }

    // Fetch in batches to avoid the 1000-row limit
    const allDeals: Record<string, unknown>[] = [];
    let offset = 0;
    const fetchBatch = 1000;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await query.range(offset, offset + fetchBatch - 1);
      if (error) throw error;
      if (data && data.length > 0) {
        allDeals.push(...data);
        offset += fetchBatch;
        hasMore = data.length === fetchBatch;
      } else {
        hasMore = false;
      }
    }

    // Filter to deals that have a company name (required for LinkedIn/Google search)
    const eligibleDeals = allDeals.filter((d) => d.internal_company_name || d.title);

    console.log(
      `[enrich-external-only] Found ${allDeals.length} deals missing external data, ${eligibleDeals.length} have company names`,
    );

    if (eligibleDeals.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No eligible deals found',
          total: 0,
          processed: 0,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Queue them into enrichment_queue with a special marker
    const now = new Date().toISOString();
    const rows = eligibleDeals.map((d) => ({
      listing_id: d.id,
      status: 'pending' as const,
      attempts: 0,
      queued_at: now,
      last_error: null,
    }));

    // Batch upsert
    const CHUNK_SIZE = 500;
    for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
      const chunk = rows.slice(i, i + CHUNK_SIZE);
      const { error } = await supabase
        .from('enrichment_queue')
        .upsert(chunk, { onConflict: 'listing_id' });
      if (error) {
        console.error('Queue upsert error:', error);
      }
    }

    // Now process directly (don't rely on process-enrichment-queue which does full pipeline)
    const results = {
      processed: 0,
      linkedinSuccess: 0,
      googleSuccess: 0,
      failed: 0,
      errors: [] as string[],
    };

    // Claim and process in chunks
    const processChunks = chunkArray(eligibleDeals, CONCURRENCY);
    let chunkIdx = 0;

    for (const chunk of processChunks) {
      if (Date.now() - startedAt > MAX_FUNCTION_RUNTIME_MS) {
        console.log('[enrich-external-only] Time limit reached, will self-continue');
        break;
      }

      if (chunkIdx > 0) {
        await new Promise((r) => setTimeout(r, 500)); // Brief delay between chunks
      }
      chunkIdx++;

      const chunkResults = await Promise.allSettled(
        chunk.map(async (deal: Record<string, unknown>) => {
          const companyName = deal.internal_company_name || deal.title;

          const [liResult, googleResult] = await Promise.allSettled([
            callFn(
              supabaseUrl,
              serviceRoleKey,
              'apify-linkedin-scrape',
              {
                dealId: deal.id,
                linkedinUrl: deal.linkedin_url,
                companyName,
                city: deal.address_city,
                state: deal.address_state,
                companyWebsite: deal.website,
              },
              PER_ITEM_TIMEOUT_MS,
            ),
            callFn(
              supabaseUrl,
              serviceRoleKey,
              'apify-google-reviews',
              {
                dealId: deal.id,
                businessName: companyName,
                address: deal.address,
                city: deal.address_city,
                state: deal.address_state,
              },
              PER_ITEM_TIMEOUT_MS,
            ),
          ]);

          let liOk = false;
          let googleOk = false;

          if (liResult.status === 'fulfilled' && liResult.value.ok) {
            liOk = true;
          }
          if (googleResult.status === 'fulfilled' && googleResult.value.ok) {
            googleOk = true;
          }

          // Update queue status
          await supabase
            .from('enrichment_queue')
            .update({
              status: 'completed',
              completed_at: new Date().toISOString(),
              last_error: null,
              updated_at: new Date().toISOString(),
            })
            .eq('listing_id', deal.id);

          return { dealId: deal.id, liOk, googleOk };
        }),
      );

      for (const r of chunkResults) {
        results.processed++;
        if (r.status === 'fulfilled') {
          if (r.value.liOk) results.linkedinSuccess++;
          if (r.value.googleOk) results.googleSuccess++;
        } else {
          results.failed++;
          results.errors.push(String(r.reason));
        }
        await updateGlobalQueueProgress(supabase, 'deal_enrichment', { completedDelta: 1 });
      }
    }

    // Check if we processed everything or need continuation
    const processedCount = results.processed;
    const remaining = eligibleDeals.length - processedCount;

    if (remaining > 0) {
      console.log(`[enrich-external-only] ${remaining} remaining — triggering continuation`);
      const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
      fetch(`${supabaseUrl}/functions/v1/enrich-external-only`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${serviceRoleKey}`,
          apikey: anonKey,
        },
        body: JSON.stringify({ dealSource, mode }),
      }).catch((err) => console.warn('Self-continuation failed:', err));
    } else {
      await completeGlobalQueueOperation(supabase, 'deal_enrichment');
    }

    console.log(
      `[enrich-external-only] Done: ${results.processed} processed, LI: ${results.linkedinSuccess}, Google: ${results.googleSuccess}, Failed: ${results.failed}`,
    );

    return new Response(
      JSON.stringify({
        success: true,
        total: eligibleDeals.length,
        ...results,
        remaining,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('[enrich-external-only] Error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
