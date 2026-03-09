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

// Title filters by buyer type — priority-ordered, expanded to catch more relevant contacts
const PE_TITLE_FILTER = [
  'partner',
  'managing partner',
  'operating partner',
  'senior partner',
  'principal',
  'managing director',
  'vp',
  'vice president',
  'director',
  'bd',
  'business development',
  'acquisitions',
  'senior associate',
  'analyst',
  'ceo',
  'president',
  'founder',
];

const COMPANY_TITLE_FILTER = [
  'ceo',
  'president',
  'founder',
  'owner',
  'cfo',
  'chief financial officer',
  'coo',
  'chief operating officer',
  'vp',
  'vice president',
  'bd',
  'business development',
  'director',
  'general manager',
  'head of finance',
  'finance director',
  'vp finance',
  'controller',
  'head of operations',
  'vp operations',
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
    return new Response(JSON.stringify({ error: 'buyer_id and company_name are required' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Accept all PE-related buyer_type values (DB stores 'pe_firm', UI may send 'private_equity')
  const PE_BUYER_TYPES = ['private_equity', 'pe_firm', 'independent_sponsor', 'search_fund'];
  const isPE = PE_BUYER_TYPES.includes(body.buyer_type?.toLowerCase() || '');
  // Platform companies and other buyer types may still have a PE firm backing them — search it too
  const hasPEFirm = !!body.pe_firm_name?.trim();
  const peTarget = 4;
  const companyTarget = 3;
  // Buyers with a PE firm name need both PE + company contacts; otherwise just company
  const totalTarget = hasPEFirm ? peTarget + companyTarget : companyTarget;

  console.log(
    `[find-introduction-contacts] buyer=${body.buyer_id} type=${body.buyer_type} isPE=${isPE} hasPEFirm=${hasPEFirm} pe_firm=${body.pe_firm_name || 'none'} company=${body.company_name}`,
  );

  const startTime = Date.now();
  const peDomain = extractDomain(body.pe_firm_website);
  const companyDomain = extractDomain(body.company_website) || body.email_domain || null;

  // Create a log entry upfront so we can track even crashes
  let logId: string | undefined;
  try {
    const { data: logRow, error: logInsertError } = await supabaseAdmin
      .from('contact_discovery_log')
      .insert({
        buyer_id: body.buyer_id,
        triggered_by: auth.userId || null,
        trigger_source: (body as any).trigger_source || 'approval',
        status: 'started',
        pe_firm_name: hasPEFirm ? body.pe_firm_name : null,
        company_name: body.company_name,
        pe_domain: peDomain,
        company_domain: companyDomain,
      })
      .select('id')
      .single();

    if (logInsertError) {
      console.error(
        '[find-introduction-contacts] Failed to create log entry:',
        logInsertError.message,
      );
    }
    logId = logRow?.id;
  } catch (logErr) {
    console.error('[find-introduction-contacts] Log entry creation threw:', logErr);
  }

  /** Helper to finalize the log row */
  async function finalizeLog(updates: Record<string, unknown>) {
    if (!logId) return;
    await supabaseAdmin
      .from('contact_discovery_log')
      .update({
        ...updates,
        completed_at: new Date().toISOString(),
        duration_ms: Date.now() - startTime,
      })
      .eq('id', logId);
  }

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
      await finalizeLog({
        status: 'skipped',
        existing_contacts_count: existingCount,
      });
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
    let peSearchError: string | null = null;
    if (hasPEFirm) {
      try {
        const peResponse = await supabaseAdmin.functions.invoke('find-contacts', {
          body: {
            company_name: body.pe_firm_name,
            title_filter: PE_TITLE_FILTER,
            target_count: 6, // Ask for slightly more to allow for dedup losses and enrichment failures
            company_domain: peDomain || undefined,
          },
          headers: { Authorization: authHeader },
        });

        if (peResponse.error) {
          peSearchError =
            typeof peResponse.error === 'string'
              ? peResponse.error
              : peResponse.error?.message || JSON.stringify(peResponse.error);
          console.error('[find-introduction-contacts] PE find-contacts error:', peResponse.error);
        } else if (peResponse.data?.contacts) {
          peContacts = peResponse.data.contacts;
        }
      } catch (err) {
        peSearchError = err instanceof Error ? err.message : String(err);
        console.error('[find-introduction-contacts] PE firm contact search failed:', err);
      }
    }

    // Step B2 — Call find-contacts for the company/platform
    let companyContacts: any[] = [];
    let companySearchError: string | null = null;
    try {
      const companyResponse = await supabaseAdmin.functions.invoke('find-contacts', {
        body: {
          company_name: body.company_name,
          title_filter: COMPANY_TITLE_FILTER,
          target_count: 5, // Ask for slightly more to allow for dedup losses and enrichment failures
          company_domain: companyDomain || undefined,
        },
        headers: { Authorization: authHeader },
      });

      if (companyResponse.error) {
        companySearchError =
          typeof companyResponse.error === 'string'
            ? companyResponse.error
            : companyResponse.error?.message || JSON.stringify(companyResponse.error);
        console.error(
          '[find-introduction-contacts] Company find-contacts error:',
          companyResponse.error,
        );
      } else if (companyResponse.data?.contacts) {
        companyContacts = companyResponse.data.contacts;
      }
    } catch (err) {
      companySearchError = err instanceof Error ? err.message : String(err);
      console.error('[find-introduction-contacts] Company contact search failed:', err);
    }

    // Step C — Deduplicate and save
    let totalSaved = 0;
    let skippedDuplicates = 0;

    // Look up firm_id from the remarketing_buyers record
    let firmId: string | null = null;
    try {
      const { data: buyerRow } = await supabaseAdmin
        .from('remarketing_buyers')
        .select('marketplace_firm_id')
        .eq('id', body.buyer_id)
        .single();
      firmId = buyerRow?.marketplace_firm_id || null;
    } catch {
      console.warn(
        '[find-introduction-contacts] Could not look up firm_id for buyer',
        body.buyer_id,
      );
    }

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

      // Normalize email to lowercase to match unique index expressions
      const normalizedEmail = contact.email ? contact.email.trim().toLowerCase() : null;

      // Use .insert() instead of .upsert() because the contacts table uses
      // expression-based partial unique indexes (e.g. lower(email), lower(trim(name)))
      // that Supabase JS .upsert() cannot reference via onConflict.
      // Unique constraint violations (23505) are treated as expected duplicates.
      const { error: insertError } = await supabaseAdmin.from('contacts').insert({
        remarketing_buyer_id: body.buyer_id,
        firm_id: firmId,
        first_name: firstName,
        last_name: lastName,
        title: contact.title || null,
        email: normalizedEmail || null,
        linkedin_url: contact.linkedin_url || null,
        phone: contact.phone || null,
        contact_type: 'buyer',
        source: 'auto_introduction_approval',
      });

      if (insertError) {
        if (insertError.code === '23505') {
          // Unique constraint violation — contact already exists, skip it
          skippedDuplicates++;
        } else {
          console.error(
            `[find-introduction-contacts] Failed to save contact ${fullName}:`,
            insertError.message,
          );
          skippedDuplicates++;
        }
      } else {
        totalSaved++;
      }
    }

    const peFound = peContacts.length;
    const companyFound = companyContacts.length;

    // Determine final status
    const bothFailed =
      (hasPEFirm && peSearchError && companySearchError) || (!hasPEFirm && companySearchError);
    const anyFailed = peSearchError || companySearchError;
    const finalStatus = bothFailed ? 'failed' : anyFailed ? 'partial' : 'completed';

    await finalizeLog({
      status: finalStatus,
      pe_contacts_found: peFound,
      company_contacts_found: companyFound,
      total_saved: totalSaved,
      skipped_duplicates: skippedDuplicates,
      existing_contacts_count: existingCount,
      pe_search_error: peSearchError,
      company_search_error: companySearchError,
    });

    console.log(
      `[find-introduction-contacts] buyer=${body.buyer_id} status=${finalStatus} pe=${peFound} company=${companyFound} saved=${totalSaved} dupes=${skippedDuplicates}`,
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
    await finalizeLog({
      status: 'failed',
      error_message: error instanceof Error ? error.message : 'Unknown error',
    });
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
