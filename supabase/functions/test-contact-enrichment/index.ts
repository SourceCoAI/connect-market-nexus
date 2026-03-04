/**
 * Test Contact Enrichment — Live Integration Test
 *
 * Pulls N random contacts from the CRM that are missing email/phone,
 * runs the LinkedIn → Prospeo enrichment pipeline on each,
 * saves results back to the database, and tracks success rates over time.
 *
 * POST /test-contact-enrichment
 * Body: { count?: number }   (default 5, max 20)
 *
 * Results are tracked in enrichment_test_runs / enrichment_test_results tables
 * and aggregated in the enrichment_success_rate view.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';
import { requireAdmin } from '../_shared/auth.ts';
import { enrichContact } from '../_shared/prospeo-client.ts';
import { findCompanyLinkedIn } from '../_shared/serper-client.ts';
import { inferDomain } from '../_shared/apify-client.ts';

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

interface ContactToTest {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  linkedin_url: string | null;
  title: string | null;
  contact_type: string;
  remarketing_buyer_id: string | null;
  firm_id: string | null;
}

interface TestResult {
  contact_id: string;
  contact_name: string;
  company_name: string | null;
  contact_type: string;
  had_email_before: boolean;
  had_phone_before: boolean;
  had_linkedin_before: boolean;
  email_found: string | null;
  phone_found: string | null;
  linkedin_found: string | null;
  enrichment_source: string | null;
  confidence: string | null;
  enrichment_ms: number;
  saved_to_contacts: boolean;
  saved_to_enriched: boolean;
  error: string | null;
}

/**
 * Try to resolve a company name for a contact from buyer/firm records.
 */
async function resolveCompanyName(
  supabase: SupabaseClient,
  contact: ContactToTest,
): Promise<string | null> {
  // Try buyers table first
  if (contact.remarketing_buyer_id) {
    const { data: buyer } = await supabase
      .from('buyers')
      .select('company_name, pe_firm_name')
      .eq('id', contact.remarketing_buyer_id)
      .maybeSingle();

    if (buyer?.company_name || buyer?.pe_firm_name) {
      return buyer.pe_firm_name || buyer.company_name;
    }
  }

  // Try firm_agreements
  if (contact.firm_id) {
    const { data: firm } = await supabase
      .from('firm_agreements')
      .select('primary_company_name')
      .eq('id', contact.firm_id)
      .maybeSingle();

    if (firm?.primary_company_name) {
      return firm.primary_company_name;
    }
  }

  return null;
}

/**
 * Enrich a single contact: LinkedIn lookup → Prospeo waterfall.
 * Returns the test result with timing and outcome details.
 */
async function testEnrichContact(
  supabase: SupabaseClient,
  contact: ContactToTest,
  userId: string,
): Promise<TestResult> {
  const startMs = Date.now();
  const contactName = `${contact.first_name} ${contact.last_name}`.trim();

  const result: TestResult = {
    contact_id: contact.id,
    contact_name: contactName,
    company_name: null,
    contact_type: contact.contact_type,
    had_email_before: !!contact.email,
    had_phone_before: !!contact.phone,
    had_linkedin_before: !!contact.linkedin_url,
    email_found: null,
    phone_found: null,
    linkedin_found: null,
    enrichment_source: null,
    confidence: null,
    enrichment_ms: 0,
    saved_to_contacts: false,
    saved_to_enriched: false,
    error: null,
  };

  try {
    // 1. Resolve company name
    const companyName = await resolveCompanyName(supabase, contact);
    result.company_name = companyName;

    // 2. Try to find LinkedIn URL if we don't have one
    const linkedinUrl = contact.linkedin_url;
    if (!linkedinUrl && companyName) {
      try {
        // Search Google for the person's LinkedIn profile
        const searchQuery = `${contactName} ${companyName} site:linkedin.com/in`;
        console.log(`[test-enrich] LinkedIn search: "${searchQuery}"`);
        // We can use the company LinkedIn page as a starting point
        const companyLinkedIn = await findCompanyLinkedIn(companyName);
        if (companyLinkedIn) {
          result.linkedin_found = companyLinkedIn;
          console.log(`[test-enrich] Found company LinkedIn: ${companyLinkedIn}`);
        }
      } catch (err) {
        console.warn(`[test-enrich] LinkedIn search failed for ${contactName}: ${err}`);
      }
    }

    // 3. Run Prospeo enrichment waterfall
    const domain = companyName ? inferDomain(companyName) : undefined;
    console.log(
      `[test-enrich] Enriching ${contactName} (company: ${companyName}, domain: ${domain}, linkedin: ${linkedinUrl || 'none'})`,
    );

    const enriched = await enrichContact({
      firstName: contact.first_name,
      lastName: contact.last_name,
      linkedinUrl: linkedinUrl || undefined,
      domain,
      title: contact.title || undefined,
      company: companyName || undefined,
    });

    if (enriched) {
      result.email_found = enriched.email;
      result.phone_found = enriched.phone;
      result.linkedin_found = enriched.linkedin_url || result.linkedin_found;
      result.enrichment_source = enriched.source;
      result.confidence = enriched.confidence;

      console.log(
        `[test-enrich] Found: email=${enriched.email}, phone=${enriched.phone}, source=${enriched.source}, confidence=${enriched.confidence}`,
      );

      // 4. Save email/phone back to unified contacts table
      if (enriched.email || enriched.phone) {
        const updateFields: Record<string, unknown> = {};
        if (enriched.email && !contact.email) updateFields.email = enriched.email;
        if (enriched.phone && !contact.phone) updateFields.phone = enriched.phone;
        if (enriched.linkedin_url && !contact.linkedin_url)
          updateFields.linkedin_url = enriched.linkedin_url;

        if (Object.keys(updateFields).length > 0) {
          const { error: updateErr } = await supabase
            .from('contacts')
            .update(updateFields)
            .eq('id', contact.id);

          if (updateErr) {
            console.error(`[test-enrich] Failed to update contact: ${updateErr.message}`);
            result.error = `Contact update failed: ${updateErr.message}`;
          } else {
            result.saved_to_contacts = true;
            console.log(
              `[test-enrich] Updated contact ${contact.id} with: ${JSON.stringify(updateFields)}`,
            );
          }
        }
      }

      // 5. Also save to enriched_contacts for audit trail
      const { error: enrichedErr } = await supabase.from('enriched_contacts').upsert(
        {
          workspace_id: userId,
          company_name: companyName || 'Unknown',
          full_name: contactName,
          first_name: enriched.first_name || contact.first_name,
          last_name: enriched.last_name || contact.last_name,
          title: enriched.title || contact.title || '',
          email: enriched.email,
          phone: enriched.phone,
          linkedin_url: enriched.linkedin_url || '',
          confidence: enriched.confidence,
          source: `test_enrichment:${enriched.source}`,
          enriched_at: new Date().toISOString(),
          search_query: `test:${contactName}`,
        },
        { onConflict: 'workspace_id,linkedin_url', ignoreDuplicates: true },
      );

      if (enrichedErr) {
        console.warn(`[test-enrich] enriched_contacts upsert warning: ${enrichedErr.message}`);
      } else {
        result.saved_to_enriched = true;
      }
    } else {
      console.log(`[test-enrich] No enrichment result for ${contactName}`);
    }
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err);
    console.error(`[test-enrich] Error enriching ${contactName}: ${result.error}`);
  }

  result.enrichment_ms = Date.now() - startMs;
  return result;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(req);
  }

  const corsHeaders = getCorsHeaders(req);

  // Auth — admin only
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const auth = await requireAdmin(req, supabase);
  if (!auth.authenticated || !auth.isAdmin) {
    return new Response(JSON.stringify({ error: auth.error || 'Unauthorized' }), {
      status: auth.authenticated ? 403 : 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Parse request
  let count = 5;
  try {
    const body = await req.json();
    count = Math.min(Math.max(body.count || 5, 1), 20);
  } catch {
    // Default to 5
  }

  console.log(`[test-enrich] Starting enrichment test for ${count} contacts`);

  // 1. Create test run record
  const { data: testRun, error: runErr } = await supabase
    .from('enrichment_test_runs')
    .insert({
      total_contacts: count,
      triggered_by: 'api',
    })
    .select('id')
    .single();

  if (runErr || !testRun) {
    return new Response(
      JSON.stringify({ error: `Failed to create test run: ${runErr?.message}` }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  const testRunId = testRun.id;

  try {
    // 2. Fetch random contacts missing email OR phone
    // Use a random ordering to get different contacts each run
    const { data: contacts, error: fetchErr } = await supabase
      .from('contacts')
      .select(
        'id, first_name, last_name, email, phone, linkedin_url, title, contact_type, remarketing_buyer_id, firm_id',
      )
      .eq('archived', false)
      .is('email', null)
      .not('first_name', 'eq', '')
      .order('created_at', { ascending: false })
      .limit(count * 5); // Fetch extra for random sampling

    if (fetchErr) {
      throw new Error(`Failed to fetch contacts: ${fetchErr.message}`);
    }

    if (!contacts || contacts.length === 0) {
      // Try contacts missing phone instead
      const { data: phoneContacts } = await supabase
        .from('contacts')
        .select(
          'id, first_name, last_name, email, phone, linkedin_url, title, contact_type, remarketing_buyer_id, firm_id',
        )
        .eq('archived', false)
        .is('phone', null)
        .not('first_name', 'eq', '')
        .order('created_at', { ascending: false })
        .limit(count * 5);

      if (!phoneContacts || phoneContacts.length === 0) {
        await supabase
          .from('enrichment_test_runs')
          .update({
            status: 'completed',
            completed_at: new Date().toISOString(),
            errors: ['No contacts found without email or phone'],
          })
          .eq('id', testRunId);

        return new Response(
          JSON.stringify({
            test_run_id: testRunId,
            message: 'No contacts found without email or phone to test',
            results: [],
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      contacts.push(...phoneContacts);
    }

    // Random sample from the fetched contacts
    const shuffled = contacts.sort(() => Math.random() - 0.5);
    const selectedContacts: ContactToTest[] = shuffled.slice(0, count);

    console.log(`[test-enrich] Selected ${selectedContacts.length} contacts for testing`);

    // 3. Run enrichment on each contact (sequentially to respect API rate limits)
    const results: TestResult[] = [];
    for (const contact of selectedContacts) {
      const result = await testEnrichContact(supabase, contact, auth.userId!);
      results.push(result);

      // Save individual result to DB
      await supabase.from('enrichment_test_results').insert({
        test_run_id: testRunId,
        contact_id: result.contact_id,
        contact_name: result.contact_name,
        company_name: result.company_name,
        contact_type: result.contact_type,
        had_email_before: result.had_email_before,
        had_phone_before: result.had_phone_before,
        had_linkedin_before: result.had_linkedin_before,
        email_found: result.email_found,
        phone_found: result.phone_found,
        linkedin_found: result.linkedin_found,
        enrichment_source: result.enrichment_source,
        confidence: result.confidence,
        enrichment_ms: result.enrichment_ms,
        saved_to_contacts: result.saved_to_contacts,
        saved_to_enriched: result.saved_to_enriched,
        error: result.error,
      });
    }

    // 4. Compute summary stats
    const emailsFound = results.filter((r) => r.email_found).length;
    const phonesFound = results.filter((r) => r.phone_found).length;
    const linkedinResolved = results.filter((r) => r.linkedin_found).length;
    const contactsEnriched = results.filter((r) => r.email_found || r.phone_found).length;
    const successRate =
      results.length > 0 ? Math.round((contactsEnriched / results.length) * 10000) / 100 : 0;
    const avgMs =
      results.length > 0
        ? Math.round(results.reduce((sum, r) => sum + r.enrichment_ms, 0) / results.length)
        : 0;

    const errors = results.filter((r) => r.error).map((r) => `${r.contact_name}: ${r.error}`);

    // 5. Update test run with final stats
    await supabase
      .from('enrichment_test_runs')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        contacts_enriched: contactsEnriched,
        emails_found: emailsFound,
        phones_found: phonesFound,
        linkedin_resolved: linkedinResolved,
        success_rate: successRate,
        avg_enrichment_ms: avgMs,
        errors: errors.length > 0 ? errors : [],
      })
      .eq('id', testRunId);

    // 6. Fetch historical success rates for context
    const { data: history } = await supabase
      .from('enrichment_test_runs')
      .select('started_at, total_contacts, contacts_enriched, emails_found, success_rate')
      .eq('status', 'completed')
      .order('started_at', { ascending: false })
      .limit(10);

    console.log(
      `[test-enrich] Complete: ${contactsEnriched}/${results.length} enriched (${successRate}%)`,
    );

    return new Response(
      JSON.stringify({
        test_run_id: testRunId,
        summary: {
          total_contacts: results.length,
          contacts_enriched: contactsEnriched,
          emails_found: emailsFound,
          phones_found: phonesFound,
          linkedin_resolved: linkedinResolved,
          success_rate: `${successRate}%`,
          avg_enrichment_ms: avgMs,
        },
        results: results.map((r) => ({
          contact_name: r.contact_name,
          company: r.company_name,
          type: r.contact_type,
          email_found: r.email_found,
          phone_found: r.phone_found,
          linkedin_found: r.linkedin_found,
          source: r.enrichment_source,
          confidence: r.confidence,
          time_ms: r.enrichment_ms,
          saved_to_crm: r.saved_to_contacts,
          error: r.error,
        })),
        history: (history || []).map((h: Record<string, unknown>) => ({
          date: h.started_at,
          contacts: h.total_contacts,
          enriched: h.contacts_enriched,
          emails: h.emails_found,
          rate: `${h.success_rate}%`,
        })),
        errors: errors.length > 0 ? errors : undefined,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error(`[test-enrich] Fatal error: ${err}`);

    await supabase
      .from('enrichment_test_runs')
      .update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        errors: [err instanceof Error ? err.message : String(err)],
      })
      .eq('id', testRunId);

    return new Response(
      JSON.stringify({
        test_run_id: testRunId,
        error: `Test failed: ${err instanceof Error ? err.message : String(err)}`,
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
