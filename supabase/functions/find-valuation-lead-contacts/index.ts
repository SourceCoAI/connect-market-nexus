/**
 * Find Valuation Lead Contacts Edge Function
 *
 * Auto-discovers LinkedIn URL and phone number for a valuation lead.
 * Called fire-and-forget by receive-valuation-lead after a new lead is saved.
 *
 * Pipeline:
 *   1. Skip if lead already has both linkedin_url and phone
 *   2. Find person's LinkedIn via Serper Google search ("full_name" site:linkedin.com/in)
 *      - If website/business_name available, refine search with company context
 *   3. If LinkedIn found → Blitz phone enrichment
 *   4. Update valuation_leads row with linkedin_url and phone
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

interface FindValuationLeadContactsRequest {
  valuation_lead_id: string;
  full_name: string;
  email: string;
  website?: string;
  business_name?: string;
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

    // Step 2: Find LinkedIn profile via Google search
    if (needsLinkedIn) {
      linkedinUrl = await findPersonLinkedIn(body.full_name, body.business_name, body.website);
    }

    // Step 3: Find phone via Blitz if we have a LinkedIn URL
    if (needsPhone && linkedinUrl) {
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
          `[find-valuation-lead-contacts] Phone lookup failed: ${phoneErr instanceof Error ? phoneErr.message : phoneErr}`,
        );
      }
    }

    // Step 4: Update valuation_leads with whatever we found
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
        duration_ms: duration,
      }),
    );

    return new Response(
      JSON.stringify({
        success: true,
        linkedin_url: linkedinUrl,
        phone,
        skipped: false,
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

/**
 * Find a person's LinkedIn profile URL via Google search.
 *
 * Strategy:
 *   1. Search with business context: "full_name" "business_name" site:linkedin.com/in
 *   2. Fallback: "full_name" site:linkedin.com/in
 *   3. Pick the best linkedin.com/in result
 */
async function findPersonLinkedIn(
  fullName: string,
  businessName?: string,
  website?: string,
): Promise<string | null> {
  const cleanName = fullName.trim();
  if (!cleanName) return null;

  // Build company context for more precise results
  const companyContext = businessName || extractBusinessFromDomain(website) || '';

  // Try with company context first for better precision
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

  // Fallback: just the person's name
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

/**
 * Execute a Google search and extract the best linkedin.com/in URL from results.
 * Retries once on failure (covers Serper 429 rate limits and transient errors).
 */
async function searchLinkedInProfile(query: string): Promise<string | null> {
  const MAX_ATTEMPTS = 2;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const results = await googleSearch(query, 5);
      for (const result of results) {
        // Match personal LinkedIn profiles (linkedin.com/in/...)
        if (result.url.includes('linkedin.com/in/')) {
          // Clean up the URL — strip query params and fragments
          const url = new URL(result.url);
          return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
        }
      }
      // Search succeeded but no LinkedIn result — don't retry
      return null;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(
        `[find-valuation-lead-contacts] Serper search failed (attempt ${attempt + 1}/${MAX_ATTEMPTS}): ${msg}`,
      );
      // Wait 5s before retry (covers 429 rate limits)
      if (attempt < MAX_ATTEMPTS - 1) {
        await new Promise((r) => setTimeout(r, 5_000));
      }
    }
  }
  return null;
}

/**
 * Extract a readable business name from a website domain.
 */
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
