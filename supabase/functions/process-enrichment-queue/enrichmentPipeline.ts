// Enrichment pipeline runner for process-enrichment-queue
// Keeps the main edge function small and focused.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export type EnrichmentPipelineInput = {
  supabaseUrl: string;
  serviceRoleKey: string;
  listingId: string;
  timeoutMs: number;
  force?: boolean;
};

type ListingContext = {
  internal_company_name: string | null;
  title: string | null;
  address_city: string | null;
  address_state: string | null;
  address: string | null;
  linkedin_url: string | null;
  website: string | null;
};

type StepResult = { ok: true; fieldsUpdated: string[] } | { ok: false; error: string };

type CallFnOptions = {
  timeoutMs?: number;
};

async function callFn(
  input: EnrichmentPipelineInput,
  fnName: string,
  body: Record<string, unknown>,
  options?: CallFnOptions,
): Promise<{ ok: boolean; status: number; json: Record<string, unknown> | null }>
{
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!anonKey) {
    throw new Error('SUPABASE_ANON_KEY is not set — cannot make internal function calls');
  }

  // Cap at 130s — enrich-deal processes transcripts + notes + website and needs up to 120s.
  // The edge function runtime limit is 150s; this cap leaves a safety margin.
  const timeoutMs = Math.min(Math.max(options?.timeoutMs ?? input.timeoutMs, 1000), 130000);

  const res = await fetch(`${input.supabaseUrl}/functions/v1/${fnName}`, {
    method: 'POST',
    headers: {
      // Use service role key for Authorization (valid JWT the gateway accepts) +
      // anon key for apikey header (required for project routing)
      apikey: anonKey,
      Authorization: `Bearer ${input.serviceRoleKey}`,
      'x-internal-secret': input.serviceRoleKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });

  let json: Record<string, unknown> | null = null;
  try {
    json = await res.json();
  } catch {
    // ignore
  }

  return { ok: res.ok, status: res.status, json };
}

function getErrorMessage(fnName: string, status: number, json: Record<string, unknown> | null): string {
  const msg = json?.error || json?.message;
  if (typeof msg === 'string' && msg.trim()) return `${fnName}: ${msg}`;
  return `${fnName}: HTTP ${status}`;
}

export async function runListingEnrichmentPipeline(
  input: EnrichmentPipelineInput,
  listing: ListingContext
): Promise<StepResult> {
  const updatedFields: string[] = [];

  // 1) Website scrape + AI extraction (writes enriched_at + structured intelligence)
  // skipExternalEnrichment=true: LinkedIn/Google are called at the pipeline level (step 2)
  // to avoid nested edge-function timeout chains (queue→enrich-deal→apify would cascade-timeout)
  const enrichDeal = await callFn(
    input,
    'enrich-deal',
    { dealId: input.listingId, skipExternalEnrichment: true, forceReExtract: input.force === true },
    { timeoutMs: 120000 },
  );

  // 409 = concurrent modification (another process enriched this deal) — treat as success
  if (enrichDeal.status === 409 && enrichDeal.json?.error_code === 'concurrent_modification') {
    console.log(`Deal ${input.listingId} was already enriched by another process — treating as success`);
    return { ok: true, fieldsUpdated: [] };
  }

  if (!enrichDeal.ok || !enrichDeal.json?.success) {
    return {
      ok: false,
      error: getErrorMessage('enrich-deal', enrichDeal.status, enrichDeal.json),
    };
  }
  if (Array.isArray(enrichDeal.json?.fieldsUpdated)) {
    updatedFields.push(...enrichDeal.json.fieldsUpdated);
  }

  // 2) RE-FETCH listing context from DB after enrich-deal has written updated fields.
  //    The original `listing` was fetched BEFORE enrichment, so it has stale data
  //    (e.g., internal_company_name=null, address_city=null, linkedin_url=null).
  //    enrich-deal just wrote the real company name, address, and linkedin_url —
  //    LinkedIn/Google need these fresh values to find the right company.
  let enrichedListing = listing;
  try {
    const supabase = createClient(input.supabaseUrl, input.serviceRoleKey);
    const { data: freshListing } = await supabase
      .from('listings')
      .select('internal_company_name, title, address_city, address_state, address, linkedin_url, website')
      .eq('id', input.listingId)
      .single();

    if (freshListing) {
      enrichedListing = freshListing as ListingContext;
      console.log(`[pipeline] Re-fetched listing after enrich-deal: name="${enrichedListing.internal_company_name}", city="${enrichedListing.address_city}", state="${enrichedListing.address_state}", linkedin="${enrichedListing.linkedin_url}"`);
    }
  } catch (err) {
    console.warn('[pipeline] Failed to re-fetch listing after enrich-deal, using original context:', err);
  }

  // 3) LinkedIn + Google in PARALLEL (they're independent, non-fatal)
  //    Now using enrichedListing which has the real company name, city, state, and linkedin_url
  const companyName = enrichedListing.internal_company_name || enrichedListing.title;
  if (companyName) {
    const [liResult, googleResult] = await Promise.allSettled([
      callFn(input, 'apify-linkedin-scrape', {
        dealId: input.listingId,
        linkedinUrl: enrichedListing.linkedin_url,
        companyName,
        city: enrichedListing.address_city,
        state: enrichedListing.address_state,
        companyWebsite: enrichedListing.website,
      }, { timeoutMs: 10000 }),
      callFn(input, 'apify-google-reviews', {
        dealId: input.listingId,
        businessName: companyName,
        address: enrichedListing.address,
        city: enrichedListing.address_city,
        state: enrichedListing.address_state,
      }, { timeoutMs: 10000 }),
    ]);

    // Process LinkedIn result — non-fatal
    if (liResult.status === 'fulfilled') {
      const liRes = liResult.value;
      if (!liRes.ok) {
        console.warn(`LinkedIn scrape failed (non-fatal): ${getErrorMessage('apify-linkedin-scrape', liRes.status, liRes.json)}`);
      } else if (liRes.json?.success !== false) {
        if (liRes.json?.linkedin_employee_count != null) updatedFields.push('linkedin_employee_count');
        if (liRes.json?.linkedin_employee_range) updatedFields.push('linkedin_employee_range');
        if (liRes.json?.linkedin_url) updatedFields.push('linkedin_url');
        if (liRes.json?.matchConfidence) updatedFields.push('linkedin_match_confidence');
        if (liRes.json?.scraped) updatedFields.push('linkedin_verified_at');
      }
    } else {
      console.error('LinkedIn scrape rejected (non-fatal):', liResult.reason);
    }

    // Process Google result — non-fatal
    if (googleResult.status === 'fulfilled') {
      const googleRes = googleResult.value;
      if (!googleRes.ok) {
        console.warn(`Google reviews failed (non-fatal): ${getErrorMessage('apify-google-reviews', googleRes.status, googleRes.json)}`);
      } else if (googleRes.json?.success === true) {
        updatedFields.push('google_review_count');
      }
    } else {
      console.error('Google reviews rejected (non-fatal):', googleResult.reason);
    }
  } else {
    console.warn(`[pipeline] No company name available for LinkedIn/Google — skipping external enrichment for ${input.listingId}`);
  }

  return { ok: true, fieldsUpdated: Array.from(new Set(updatedFields)) };
}
