/**
 * Find Introduction Contacts Edge Function
 *
 * Auto-discovers contacts when a buyer is approved to the introduction stage.
 * Calls the existing find-contacts edge function with title filters based on
 * buyer_type, then saves results to the unified contacts table.
 *
 * POST /find-introduction-contacts
 * Body: {
 *   buyer_id: string,
 *   buyer_type: string,
 *   pe_firm_name?: string,
 *   pe_firm_website?: string,
 *   company_name: string,
 *   company_website?: string,
 *   email_domain?: string,
 * }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';
import { requireAdmin } from '../_shared/auth.ts';

interface FindIntroductionContactsRequest {
  buyer_id: string;
  buyer_type: string;
  pe_firm_name?: string;
  pe_firm_website?: string;
  company_name: string;
  company_website?: string;
  email_domain?: string;
}

// Title filters by buyer type — priority-ordered
const PE_TITLE_FILTER = [
  'bd',
  'vp',
  'senior associate',
  'principal',
  'partner',
  'analyst',
];

const COMPANY_TITLE_FILTER = [
  'bd',
  'cfo',
  'chief financial officer',
  'vp finance',
  'director of finance',
  'head of finance',
  'finance director',
  'ceo',
];

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(req);
  }

  const corsHeaders = getCorsHeaders(req);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

  const auth = await requireAdmin(req, supabaseAdmin);
  if (!auth.authenticated || !auth.isAdmin) {
    return new Response(JSON.stringify({ error: auth.error || 'Unauthorized' }), {
      status: auth.authenticated ? 403 : 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let body: FindIntroductionContactsRequest;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (!body.buyer_id || !body.company_name?.trim()) {
    return new Response(
      JSON.stringify({ error: 'buyer_id and company_name are required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  const isPE = body.buyer_type === 'private_equity';
  const hasPEFirm = isPE && !!body.pe_firm_name?.trim();
  const peTarget = 5;
  const companyTarget = 3;
  // PE buyers with a firm name need both PE + company contacts; otherwise just company
  const totalTarget = hasPEFirm ? peTarget + companyTarget : companyTarget;

  try {
    // Step A — Check existing contacts to avoid redundant work
    const { data: existingContacts } = await supabaseAdmin
      .from('contacts')
      .select('id')
      .eq('remarketing_buyer_id', body.buyer_id)
      .eq('contact_type', 'buyer')
      .eq('archived', false);

    const existingCount = existingContacts?.length || 0;

    if (existingCount >= totalTarget) {
      return new Response(
        JSON.stringify({
          success: true,
          pe_contacts_found: 0,
          company_contacts_found: 0,
          total_saved: 0,
          skipped_duplicates: 0,
          message: 'Contacts already populated',
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Extract the auth header to pass to sub-function calls
    const authHeader = req.headers.get('Authorization') || '';

    // Step B — Call find-contacts for PE firm (if applicable)
    let peContacts: any[] = [];
    if (hasPEFirm) {
      try {
        const peDomain = extractDomain(body.pe_firm_website);
        const peResponse = await supabaseAdmin.functions.invoke('find-contacts', {
          body: {
            company_name: body.pe_firm_name,
            title_filter: PE_TITLE_FILTER,
            target_count: 8, // Ask for more than 5 to allow for dedup losses
            company_domain: peDomain || undefined,
          },
          headers: { Authorization: authHeader },
        });

        if (peResponse.error) {
          console.error('[find-introduction-contacts] PE find-contacts error:', peResponse.error);
        } else if (peResponse.data?.contacts) {
          peContacts = peResponse.data.contacts;
        }
      } catch (err) {
        console.error('[find-introduction-contacts] PE firm contact search failed:', err);
      }
    }

    // Step B2 — Call find-contacts for the company/platform
    let companyContacts: any[] = [];
    try {
      const companyDomain =
        extractDomain(body.company_website) || body.email_domain || undefined;
      const companyResponse = await supabaseAdmin.functions.invoke('find-contacts', {
        body: {
          company_name: body.company_name,
          title_filter: COMPANY_TITLE_FILTER,
          target_count: 5, // Ask for more than 3 to allow for dedup losses
          company_domain: companyDomain,
        },
        headers: { Authorization: authHeader },
      });

      if (companyResponse.error) {
        console.error('[find-introduction-contacts] Company find-contacts error:', companyResponse.error);
      } else if (companyResponse.data?.contacts) {
        companyContacts = companyResponse.data.contacts;
      }
    } catch (err) {
      console.error('[find-introduction-contacts] Company contact search failed:', err);
    }

    // Step C — Deduplicate and save
    let totalSaved = 0;
    let skippedDuplicates = 0;

    // Merge PE and company results for dedup + save
    const allContacts = [...peContacts, ...companyContacts];

    const seenKeys = new Set<string>();
    for (const contact of allContacts) {
      const fullName = (contact.full_name || '').trim();
      if (!fullName) continue;

      // Dedup key: linkedin_url > email > name
      const dedupKey =
        (contact.linkedin_url || '').toLowerCase() ||
        (contact.email || '').toLowerCase() ||
        fullName.toLowerCase();

      if (seenKeys.has(dedupKey)) {
        skippedDuplicates++;
        continue;
      }
      seenKeys.add(dedupKey);

      // Split name into first/last
      const nameParts = fullName.split(/\s+/);
      const firstName = nameParts[0] || '';
      const lastName = nameParts.slice(1).join(' ') || '';

      const { error: upsertError } = await supabaseAdmin.from('contacts').upsert(
        {
          remarketing_buyer_id: body.buyer_id,
          first_name: firstName,
          last_name: lastName,
          title: contact.title || null,
          email: contact.email || null,
          linkedin_url: contact.linkedin_url || null,
          phone: contact.phone || null,
          contact_type: 'buyer',
          source: 'auto_introduction_approval',
        },
        {
          onConflict: 'remarketing_buyer_id,first_name,last_name',
          ignoreDuplicates: false,
        },
      );

      if (upsertError) {
        console.error(
          `[find-introduction-contacts] Failed to save contact ${fullName}:`,
          upsertError.message,
        );
        skippedDuplicates++;
      } else {
        totalSaved++;
      }
    }

    const peFound = peContacts.length;
    const companyFound = companyContacts.length;

    console.log(
      `[find-introduction-contacts] buyer=${body.buyer_id} pe=${peFound} company=${companyFound} saved=${totalSaved} dupes=${skippedDuplicates}`,
    );

    return new Response(
      JSON.stringify({
        success: true,
        pe_contacts_found: peFound,
        company_contacts_found: companyFound,
        total_saved: totalSaved,
        skipped_duplicates: skippedDuplicates,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error: unknown) {
    console.error('[find-introduction-contacts] Error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        pe_contacts_found: 0,
        company_contacts_found: 0,
        total_saved: 0,
        skipped_duplicates: 0,
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});

/** Extracts domain from a URL string, returns null if invalid */
function extractDomain(url?: string | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}
