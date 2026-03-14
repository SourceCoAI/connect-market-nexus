/**
 * Find Valuation Lead Contacts Edge Function
 *
 * Auto-discovers LinkedIn URL and phone number for a valuation lead.
 * Called fire-and-forget by receive-valuation-lead after a new lead is saved.
 *
 * Pipeline:
 *   1. Check contact_search_cache for recent results (7-day window)
 *   2. Skip if lead already has both linkedin_url and phone
 *   3. Find person's LinkedIn via Serper Google search ("full_name" site:linkedin.com/in)
 *      - If website/business_name available, refine search with company context
 *   4. If LinkedIn found → Blitz phone enrichment (primary, synchronous)
 *   5. If Blitz misses → Clay waterfall fallback (async — results arrive via Clay webhooks)
 *   6. Update valuation_leads row with whatever we found synchronously
 *   7. Cache results for 7 days
 *
 * POST /find-valuation-lead-contacts
 * Body: { valuation_lead_id, full_name, email, website?, business_name? }
 * Auth: x-internal-secret (service-to-service) or admin JWT
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';
import { requireAdmin } from '../_shared/auth.ts';
import { googleSearch } from '../_shared/serper-client.ts';
import { findPhone } from '../_shared/blitz-client.ts';
import {
  sendToClayLinkedIn,
  sendToClayNameDomain,
  sendToClayPhone,
} from '../_shared/clay-client.ts';

const CACHE_TTL_DAYS = 7;
/** Sentinel workspace_id for system/service-initiated Clay requests */
const SYSTEM_WORKSPACE_ID = '00000000-0000-0000-0000-000000000000';

interface FindValuationLeadContactsRequest {
  valuation_lead_id: string;
  full_name: string;
  email: string;
  website?: string;
  business_name?: string;
}

interface CachedResult {
  linkedin_url: string | null;
  phone: string | null;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(req);
  }

  const corsHeaders = getCorsHeaders(req);
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

  // Auth: accept internal service-role calls via x-internal-secret, or validated admin JWT
  const internalSecret = req.headers.get('x-internal-secret');
  const isServiceCall = internalSecret === supabaseServiceKey;

  if (!isServiceCall) {
    const auth = await requireAdmin(req, supabaseAdmin);
    if (!auth.authenticated || !auth.isAdmin) {
      return new Response(JSON.stringify({ error: auth.error || 'Unauthorized' }), {
        status: auth.authenticated ? 403 : 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  }

  let body: FindValuationLeadContactsRequest;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (!body.valuation_lead_id || !body.full_name?.trim()) {
    return new Response(
      JSON.stringify({ error: 'valuation_lead_id and full_name are required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  const startTime = Date.now();
  console.log(
    `[find-valuation-lead-contacts] Starting for lead=${body.valuation_lead_id} name="${body.full_name}" email="${body.email}"`,
  );

  try {
    // Step 1: Check if the lead already has both fields populated
    const { data: existingLead, error: fetchError } = await supabaseAdmin
      .from('valuation_leads')
      .select('linkedin_url, phone')
      .eq('id', body.valuation_lead_id)
      .single();

    if (fetchError) {
      console.error('[find-valuation-lead-contacts] Failed to fetch lead:', fetchError.message);
      return new Response(
        JSON.stringify({ success: false, error: 'Lead not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const needsLinkedIn = !existingLead.linkedin_url;
    const needsPhone = !existingLead.phone;

    if (!needsLinkedIn && !needsPhone) {
      console.log(
        `[find-valuation-lead-contacts] Lead ${body.valuation_lead_id} already has linkedin_url and phone — skipping`,
      );
      return new Response(
        JSON.stringify({
          success: true,
          linkedin_url: existingLead.linkedin_url,
          phone: existingLead.phone,
          skipped: true,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    let linkedinUrl: string | null = existingLead.linkedin_url || null;
    let phone: string | null = existingLead.phone || null;
    let fromCache = false;
    let clayFallbackSent = false;

    // Step 2: Check cache for recent results (7-day TTL)
    const cacheKey = buildCacheKey(body.full_name, body.email);
    const cached = await getCachedResult(supabaseAdmin, cacheKey);

    if (cached) {
      console.log(`[find-valuation-lead-contacts] Cache hit for "${body.full_name}"`);
      fromCache = true;
      if (needsLinkedIn && cached.linkedin_url) linkedinUrl = cached.linkedin_url;
      if (needsPhone && cached.phone) phone = cached.phone;
    }

    // Step 3: Find LinkedIn profile via Google search (if not cached)
    if (needsLinkedIn && !linkedinUrl) {
      linkedinUrl = await findPersonLinkedIn(body.full_name, body.business_name, body.website);
    }

    // Step 4: Find phone via Blitz (primary) if we have a LinkedIn URL
    if (needsPhone && !phone && linkedinUrl) {
      try {
        const phoneRes = await findPhone(linkedinUrl);
        if (phoneRes.ok && phoneRes.data?.phone) {
          phone = phoneRes.data.phone;
          console.log(
            `[find-valuation-lead-contacts] Found phone for "${body.full_name}" via Blitz`,
          );
        }
      } catch (phoneErr) {
        console.warn(
          `[find-valuation-lead-contacts] Blitz phone lookup failed: ${phoneErr instanceof Error ? phoneErr.message : phoneErr}`,
        );
      }
    }

    // Step 5: Clay waterfall fallback — if we still need phone or LinkedIn
    const stillNeedsPhone = needsPhone && !phone;
    const nameParts = body.full_name.trim().split(/\s+/);
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';
    const domain = extractDomain(body.website);

    if (stillNeedsPhone && linkedinUrl) {
      // We have LinkedIn but no phone → send to Clay phone waterfall
      clayFallbackSent = await sendClayPhoneRequest(
        supabaseAdmin,
        body.valuation_lead_id,
        linkedinUrl,
        firstName,
        lastName,
        body.business_name,
      );
    }

    if (needsLinkedIn && !linkedinUrl && domain) {
      // We have name + domain but no LinkedIn → send to Clay name+domain waterfall
      clayFallbackSent = await sendClayNameDomainRequest(
        supabaseAdmin,
        body.valuation_lead_id,
        firstName,
        lastName,
        domain,
        body.business_name,
      );
    }

    // Step 6: Update valuation_leads with whatever we found synchronously
    const updates: Record<string, unknown> = {};
    if (linkedinUrl && needsLinkedIn) updates.linkedin_url = linkedinUrl;
    if (phone && needsPhone) updates.phone = phone;

    if (Object.keys(updates).length > 0) {
      updates.updated_at = new Date().toISOString();

      const { error: updateError } = await supabaseAdmin
        .from('valuation_leads')
        .update(updates)
        .eq('id', body.valuation_lead_id);

      if (updateError) {
        console.error(
          '[find-valuation-lead-contacts] Failed to update lead:',
          updateError.message,
        );
      } else {
        console.log(
          `[find-valuation-lead-contacts] Updated lead ${body.valuation_lead_id}: ${JSON.stringify(updates)}`,
        );
      }
    }

    // Step 7: Cache results (even partial) for 7 days
    if (!fromCache) {
      await setCachedResult(supabaseAdmin, cacheKey, body.full_name, {
        linkedin_url: linkedinUrl,
        phone,
      });
    }

    const duration = Date.now() - startTime;

    // Structured audit log — queryable in Supabase Edge Function logs
    console.log(
      JSON.stringify({
        fn: 'find-valuation-lead-contacts',
        lead_id: body.valuation_lead_id,
        email: body.email,
        linkedin_found: !!linkedinUrl,
        phone_found: !!phone,
        needed_linkedin: needsLinkedIn,
        needed_phone: needsPhone,
        from_cache: fromCache,
        clay_fallback_sent: clayFallbackSent,
        duration_ms: duration,
      }),
    );

    return new Response(
      JSON.stringify({
        success: true,
        linkedin_url: linkedinUrl,
        phone,
        skipped: false,
        from_cache: fromCache,
        clay_fallback_sent: clayFallbackSent,
        duration_ms: duration,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error: unknown) {
    console.error('[find-valuation-lead-contacts] Error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});

// ─── Cache helpers ───────────────────────────────────────────────────────────

function buildCacheKey(fullName: string, email: string): string {
  return `vlead:${fullName.trim().toLowerCase()}:${email.trim().toLowerCase()}`;
}

async function getCachedResult(
  supabaseAdmin: ReturnType<typeof createClient>,
  cacheKey: string,
): Promise<CachedResult | null> {
  try {
    const cutoff = new Date(Date.now() - CACHE_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const { data } = await supabaseAdmin
      .from('contact_search_cache')
      .select('results')
      .eq('cache_key', cacheKey)
      .gte('created_at', cutoff)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (data?.results) {
      return data.results as CachedResult;
    }
  } catch (err) {
    console.warn('[find-valuation-lead-contacts] Cache read failed:', err);
  }
  return null;
}

async function setCachedResult(
  supabaseAdmin: ReturnType<typeof createClient>,
  cacheKey: string,
  fullName: string,
  result: CachedResult,
): Promise<void> {
  try {
    await supabaseAdmin.from('contact_search_cache').insert({
      cache_key: cacheKey,
      company_name: fullName,
      results: result,
    });
  } catch (err) {
    console.warn('[find-valuation-lead-contacts] Cache write failed:', err);
  }
}

// ─── LinkedIn search ─────────────────────────────────────────────────────────

async function findPersonLinkedIn(
  fullName: string,
  businessName?: string,
  website?: string,
): Promise<string | null> {
  const cleanName = fullName.trim();
  if (!cleanName) return null;

  const companyContext = businessName || extractBusinessFromDomain(website) || '';

  if (companyContext) {
    const contextUrl = await searchLinkedInProfile(
      `"${cleanName}" "${companyContext}" site:linkedin.com/in`,
    );
    if (contextUrl) {
      console.log(
        `[find-valuation-lead-contacts] Found LinkedIn for "${cleanName}" with company context`,
      );
      return contextUrl;
    }
  }

  const nameOnlyUrl = await searchLinkedInProfile(
    `"${cleanName}" site:linkedin.com/in`,
  );
  if (nameOnlyUrl) {
    console.log(
      `[find-valuation-lead-contacts] Found LinkedIn for "${cleanName}" via name-only search`,
    );
    return nameOnlyUrl;
  }

  console.log(`[find-valuation-lead-contacts] No LinkedIn found for "${cleanName}"`);
  return null;
}

async function searchLinkedInProfile(query: string): Promise<string | null> {
  const MAX_ATTEMPTS = 2;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const results = await googleSearch(query, 5);
      for (const result of results) {
        if (result.url.includes('linkedin.com/in/')) {
          const url = new URL(result.url);
          return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
        }
      }
      return null;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(
        `[find-valuation-lead-contacts] Serper search failed (attempt ${attempt + 1}/${MAX_ATTEMPTS}): ${msg}`,
      );
      if (attempt < MAX_ATTEMPTS - 1) {
        await new Promise((r) => setTimeout(r, 5_000));
      }
    }
  }
  return null;
}

// ─── Clay waterfall fallback ─────────────────────────────────────────────────

/**
 * Send a Clay phone enrichment request. Creates a tracking row in
 * clay_enrichment_requests and fires the Clay webhook.
 * Returns true if the request was sent, false on error.
 */
async function sendClayPhoneRequest(
  supabaseAdmin: ReturnType<typeof createClient>,
  valuationLeadId: string,
  linkedinUrl: string,
  firstName: string,
  lastName: string,
  companyName?: string,
): Promise<boolean> {
  try {
    const requestId = crypto.randomUUID();

    const { error: insertErr } = await supabaseAdmin.from('clay_enrichment_requests').insert({
      request_id: requestId,
      request_type: 'phone',
      status: 'pending',
      workspace_id: SYSTEM_WORKSPACE_ID,
      first_name: firstName || null,
      last_name: lastName || null,
      linkedin_url: linkedinUrl,
      company_name: companyName || null,
      source_function: 'find-valuation-lead-contacts',
      source_entity_id: valuationLeadId,
    });

    if (insertErr) {
      console.warn(`[find-valuation-lead-contacts] Clay phone request insert failed: ${insertErr.message}`);
      return false;
    }

    sendToClayPhone({ requestId, linkedinUrl })
      .then((res) => {
        if (!res.success) console.warn(`[find-valuation-lead-contacts] Clay phone webhook failed: ${res.error}`);
        else console.log(`[find-valuation-lead-contacts] Clay phone webhook sent for ${firstName} ${lastName}`);
      })
      .catch((err) => console.error(`[find-valuation-lead-contacts] Clay phone webhook error: ${err}`));

    return true;
  } catch (err) {
    console.warn(`[find-valuation-lead-contacts] Clay phone request failed: ${err}`);
    return false;
  }
}

/**
 * Send a Clay name+domain enrichment request (finds email/LinkedIn).
 * Creates a tracking row and fires the Clay webhook.
 */
async function sendClayNameDomainRequest(
  supabaseAdmin: ReturnType<typeof createClient>,
  valuationLeadId: string,
  firstName: string,
  lastName: string,
  domain: string,
  companyName?: string,
): Promise<boolean> {
  try {
    const requestId = crypto.randomUUID();

    const { error: insertErr } = await supabaseAdmin.from('clay_enrichment_requests').insert({
      request_id: requestId,
      request_type: 'name_domain',
      status: 'pending',
      workspace_id: SYSTEM_WORKSPACE_ID,
      first_name: firstName || null,
      last_name: lastName || null,
      domain: domain,
      company_name: companyName || null,
      source_function: 'find-valuation-lead-contacts',
      source_entity_id: valuationLeadId,
    });

    if (insertErr) {
      console.warn(`[find-valuation-lead-contacts] Clay name+domain request insert failed: ${insertErr.message}`);
      return false;
    }

    sendToClayNameDomain({ requestId, firstName, lastName, domain })
      .then((res) => {
        if (!res.success) console.warn(`[find-valuation-lead-contacts] Clay name+domain webhook failed: ${res.error}`);
        else console.log(`[find-valuation-lead-contacts] Clay name+domain webhook sent for ${firstName} ${lastName}`);
      })
      .catch((err) => console.error(`[find-valuation-lead-contacts] Clay name+domain webhook error: ${err}`));

    return true;
  } catch (err) {
    console.warn(`[find-valuation-lead-contacts] Clay name+domain request failed: ${err}`);
    return false;
  }
}

// ─── Utilities ───────────────────────────────────────────────────────────────

function extractBusinessFromDomain(website?: string): string | null {
  if (!website) return null;
  try {
    const domain = website
      .trim()
      .toLowerCase()
      .replace(/^[a-z]{3,6}:\/\//i, '')
      .replace(/^www\./i, '')
      .split('/')[0]
      .split('?')[0]
      .split('.')[0];
    if (domain && domain.length > 1) {
      return domain;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function extractDomain(url?: string): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}
