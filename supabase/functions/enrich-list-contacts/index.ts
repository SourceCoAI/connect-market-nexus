/**
 * Enrich List Contacts — Prospeo enrichment for contacts being added to a list.
 *
 * Supports two modes:
 *   1. contact_ids — enriches existing contacts from the contacts table by ID.
 *   2. raw_contacts — enriches contacts by name + company (no DB record needed).
 *
 * POST /enrich-list-contacts
 * Body: { contact_ids?: string[], raw_contacts?: RawContact[] }
 *
 * Response: { results: EnrichResult[] }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';
import { requireAdmin } from '../_shared/auth.ts';
import { enrichContact } from '../_shared/prospeo-client.ts';
import { inferDomain } from '../_shared/domain-utils.ts';
import { fireClayFallback } from '../_shared/clay-fallback.ts';

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

interface RawContact {
  key: string; // client-side identifier (e.g. dealId)
  first_name: string;
  last_name: string;
  company: string;
}

interface EnrichResult {
  contact_id: string; // DB id or raw_contact key
  email: string | null;
  phone: string | null;
  source: string | null;
  confidence: string | null;
  error: string | null;
}

/**
 * Resolve company name for a contact from buyer/firm records.
 */
async function resolveCompanyName(
  supabase: SupabaseClient,
  contact: { remarketing_buyer_id: string | null; firm_id: string | null },
): Promise<string | null> {
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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(req);
  }

  const corsHeaders = getCorsHeaders(req);

  // Admin auth
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

  // Parse request — supports contact_ids OR raw_contacts
  let contactIds: string[] = [];
  let rawContacts: RawContact[] = [];

  try {
    const body = await req.json();
    contactIds = body.contact_ids || [];
    rawContacts = body.raw_contacts || [];

    if (contactIds.length === 0 && rawContacts.length === 0) {
      throw new Error('Provide contact_ids or raw_contacts');
    }
    if (contactIds.length + rawContacts.length > 50) {
      throw new Error('Maximum 50 contacts per request');
    }
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Invalid request body' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  const results: EnrichResult[] = [];

  // ── Mode 1: Enrich existing contacts by ID ──
  if (contactIds.length > 0) {
    console.log(`[enrich-list] Enriching ${contactIds.length} contacts by ID`);

    const { data: contacts, error: fetchErr } = await supabase
      .from('contacts')
      .select(
        'id, first_name, last_name, email, phone, linkedin_url, title, remarketing_buyer_id, firm_id',
      )
      .in('id', contactIds)
      .eq('archived', false);

    if (fetchErr) {
      return new Response(
        JSON.stringify({ error: `Failed to fetch contacts: ${fetchErr.message}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    for (const contact of contacts || []) {
      if (contact.email && contact.phone) {
        results.push({
          contact_id: contact.id,
          email: contact.email,
          phone: contact.phone,
          source: 'existing',
          confidence: null,
          error: null,
        });
        continue;
      }

      try {
        const companyName = await resolveCompanyName(supabase, contact);
        const domain = companyName ? inferDomain(companyName) : undefined;

        console.log(
          `[enrich-list] Enriching ${contact.first_name} ${contact.last_name} (company: ${companyName}, domain: ${domain})`,
        );

        const enriched = await enrichContact({
          firstName: contact.first_name || '',
          lastName: contact.last_name || '',
          linkedinUrl: contact.linkedin_url || undefined,
          domain,
          title: contact.title || undefined,
          company: companyName || undefined,
        });

        if (enriched && (enriched.email || enriched.phone)) {
          const updateFields: Record<string, unknown> = {};
          if (enriched.email && !contact.email) updateFields.email = enriched.email;
          if (enriched.phone && !contact.phone) updateFields.phone = enriched.phone;
          if (enriched.linkedin_url && !contact.linkedin_url)
            updateFields.linkedin_url = enriched.linkedin_url;

          if (Object.keys(updateFields).length > 0) {
            // Update canonical contact + log enrichment event via RPC
            const { error: updateErr } = await supabase.rpc('contacts_upsert', {
              p_identity: { email: contact.email || enriched.email || null, linkedin_url: enriched.linkedin_url || contact.linkedin_url || null },
              p_fields: updateFields,
              p_source: `list_enrich:${enriched.source}`,
              p_enrichment: {
                provider: `list_enrich:${enriched.source}`,
                confidence: enriched.confidence,
                source_query: `list:${contact.first_name} ${contact.last_name}`,
              },
            });

            if (updateErr) {
              console.error(`[enrich-list] Update failed for ${contact.id}: ${updateErr.message}`);
            }
          }

          results.push({
            contact_id: contact.id,
            email: enriched.email || contact.email,
            phone: enriched.phone || contact.phone,
            source: enriched.source,
            confidence: enriched.confidence,
            error: null,
          });
        } else {
          // Fire Clay fallback for contacts Prospeo couldn't enrich
          fireClayFallback(
            supabase,
            {
              firstName: contact.first_name || '',
              lastName: contact.last_name || '',
              linkedinUrl: contact.linkedin_url || undefined,
              domain,
              company: companyName || undefined,
              title: contact.title || undefined,
            },
            {
              workspaceId: auth.userId!,
              sourceFunction: 'enrich_list_contacts',
              sourceEntityId: contact.id,
            },
          );

          results.push({
            contact_id: contact.id,
            email: contact.email,
            phone: contact.phone,
            source: null,
            confidence: null,
            error: null,
          });
        }
      } catch (err) {
        console.error(`[enrich-list] Error for ${contact.id}: ${err}`);
        results.push({
          contact_id: contact.id,
          email: contact.email,
          phone: contact.phone,
          source: null,
          confidence: null,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  // ── Mode 2: Enrich raw contacts (no DB record, e.g. deals) ──
  if (rawContacts.length > 0) {
    console.log(`[enrich-list] Enriching ${rawContacts.length} raw contacts`);

    for (const raw of rawContacts) {
      try {
        const domain = raw.company ? inferDomain(raw.company) : undefined;

        console.log(
          `[enrich-list] Raw enrich: ${raw.first_name} ${raw.last_name} (company: ${raw.company}, domain: ${domain})`,
        );

        const enriched = await enrichContact({
          firstName: raw.first_name,
          lastName: raw.last_name,
          domain,
          company: raw.company,
        });

        if (enriched && (enriched.email || enriched.phone)) {
          const { error: rawUpsertErr } = await supabase.rpc('contacts_upsert', {
            p_identity: {
              email: enriched.email || null,
              linkedin_url: enriched.linkedin_url || null,
            },
            p_fields: {
              first_name: enriched.first_name || raw.first_name,
              last_name: enriched.last_name || raw.last_name,
              title: enriched.title || null,
              email: enriched.email || null,
              phone: enriched.phone || null,
              linkedin_url: enriched.linkedin_url || null,
              contact_type: 'buyer',
            },
            p_source: `list_enrich:${enriched.source}`,
            p_enrichment: {
              provider: `list_enrich:${enriched.source}`,
              confidence: enriched.confidence,
              source_query: `list_deal:${raw.first_name} ${raw.last_name}`,
            },
          });
          if (rawUpsertErr) {
            console.error(
              `[enrich-list] contacts_upsert failed for raw ${raw.key}:`,
              rawUpsertErr.message,
            );
          }

          results.push({
            contact_id: raw.key,
            email: enriched.email,
            phone: enriched.phone,
            source: enriched.source,
            confidence: enriched.confidence,
            error: null,
          });
        } else {
          // Fire Clay fallback for raw contacts Prospeo couldn't enrich
          fireClayFallback(
            supabase,
            {
              firstName: raw.first_name,
              lastName: raw.last_name,
              domain,
              company: raw.company,
            },
            {
              workspaceId: auth.userId!,
              sourceFunction: 'enrich_list_contacts',
            },
          );

          results.push({
            contact_id: raw.key,
            email: null,
            phone: null,
            source: null,
            confidence: null,
            error: null,
          });
        }
      } catch (err) {
        console.error(`[enrich-list] Raw error for ${raw.key}: ${err}`);
        results.push({
          contact_id: raw.key,
          email: null,
          phone: null,
          source: null,
          confidence: null,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  const enrichedCount = results.filter((r) => r.source && r.source !== 'existing').length;
  console.log(`[enrich-list] Done: ${enrichedCount} enriched via Prospeo`);

  return new Response(JSON.stringify({ results }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
