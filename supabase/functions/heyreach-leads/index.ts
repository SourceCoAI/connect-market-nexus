/**
 * HeyReach Leads Edge Function
 *
 * Manages lead operations: pushing contacts to HeyReach campaigns via lists,
 * listing leads, and fetching lead details.
 *
 * Endpoints (via action in request body):
 *   POST { action: "push", campaign_id, list_id, entity_type, entity_ids }
 *     — Resolve platform contacts and push them to a HeyReach campaign
 *   POST { action: "list", list_id, offset?, limit? }
 *     — List leads from a HeyReach list
 *   POST { action: "get_lead", linkedin_url }
 *     — Fetch lead details by LinkedIn URL
 *   POST { action: "add_to_list", list_id, entity_type, entity_ids }
 *     — Resolve contacts and add them to a HeyReach list
 */

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';
import {
  addLeadsToCampaign,
  addLeadsToList,
  getLeadsFromList,
  getLeadDetails,
} from '../_shared/heyreach-client.ts';

type EntityType = 'contacts' | 'buyer_contacts' | 'buyers' | 'listings' | 'leads';

interface ResolvedLead {
  linkedInUrl: string;
  email?: string;
  firstName: string;
  lastName: string;
  companyName?: string;
  phone?: string;
  // Internal tracking
  _source_id?: string;
  _source_type?: string;
}

// ─── Contact resolvers ──────────────────────────────────────────────────────

async function resolveFromBuyerContacts(
  supabase: SupabaseClient<any, any, any>,
  ids: string[],
): Promise<ResolvedLead[]> {
  // Read from unified contacts table instead of legacy buyer_contacts
  const { data: contacts } = await supabase
    .from('contacts')
    .select('id, first_name, last_name, email, phone, title, remarketing_buyer_id, linkedin_url')
    .in('id', ids)
    .eq('archived', false);

  if (!contacts?.length) return [];

  const buyerIds = [...new Set(contacts.map((c) => c.remarketing_buyer_id).filter(Boolean))];
  const { data: buyers } = await supabase
    .from('remarketing_buyers')
    .select('id, company_name')
    .in('id', buyerIds);
  const buyerMap = new Map((buyers || []).map((b) => [b.id, b]));

  return contacts
    .filter((c) => c.linkedin_url || c.email)
    .map((c) => {
      const buyer = c.remarketing_buyer_id ? buyerMap.get(c.remarketing_buyer_id) : null;
      return {
        linkedInUrl: c.linkedin_url || '',
        email: c.email || undefined,
        firstName: c.first_name || '',
        lastName: c.last_name || '',
        companyName: buyer?.company_name || '',
        phone: c.phone || '',
        _source_id: c.id,
        _source_type: 'buyer_contact',
      };
    });
}

async function resolveFromBuyers(
  supabase: SupabaseClient<any, any, any>,
  buyerIds: string[],
): Promise<ResolvedLead[]> {
  // Read from unified contacts table instead of legacy buyer_contacts
  const { data: contacts } = await supabase
    .from('contacts')
    .select('id, first_name, last_name, email, phone, title, remarketing_buyer_id, linkedin_url')
    .in('remarketing_buyer_id', buyerIds)
    .eq('archived', false);

  const { data: buyers } = await supabase
    .from('remarketing_buyers')
    .select('id, company_name, contact_name, contact_email, contact_phone')
    .in('id', buyerIds);
  const buyerMap = new Map((buyers || []).map((b) => [b.id, b]));

  const seen = new Set<string>();
  const result: ResolvedLead[] = [];

  // Sub-contacts first
  for (const c of contacts || []) {
    if (!c.linkedin_url && !c.email) continue;
    const key = (c.linkedin_url || c.email || '').toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const buyer = c.remarketing_buyer_id ? buyerMap.get(c.remarketing_buyer_id) : null;
    result.push({
      linkedInUrl: c.linkedin_url || '',
      email: c.email || undefined,
      firstName: c.first_name || '',
      lastName: c.last_name || '',
      companyName: buyer?.company_name || '',
      phone: c.phone || '',
      _source_id: c.id,
      _source_type: 'buyer_contact',
    });
  }

  // Fallback: buyer-level contact info for buyers with no sub-contacts
  const buyersWithContacts = new Set((contacts || []).map((c) => c.remarketing_buyer_id));
  for (const buyerId of buyerIds) {
    if (buyersWithContacts.has(buyerId)) continue;
    const buyer = buyerMap.get(buyerId);
    if (!buyer?.contact_email) continue;
    const key = buyer.contact_email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const parts = (buyer.contact_name || '').split(' ');
    result.push({
      linkedInUrl: '',
      email: buyer.contact_email,
      firstName: parts[0] || '',
      lastName: parts.slice(1).join(' ') || '',
      companyName: buyer.company_name || '',
      phone: buyer.contact_phone || '',
      _source_id: buyerId,
      _source_type: 'remarketing_buyer',
    });
  }

  return result;
}

async function resolveFromListings(
  supabase: SupabaseClient<any, any, any>,
  listingIds: string[],
): Promise<ResolvedLead[]> {
  const { data: listings } = await supabase
    .from('listings')
    .select(
      'id, title, internal_company_name, main_contact_name, main_contact_email, main_contact_phone',
    )
    .in('id', listingIds);

  if (!listings?.length) return [];

  return listings
    .filter((l) => l.main_contact_email)
    .map((l) => {
      const parts = (l.main_contact_name || '').split(' ');
      return {
        linkedInUrl: '',
        email: l.main_contact_email!,
        firstName: parts[0] || '',
        lastName: parts.slice(1).join(' ') || '',
        companyName: l.internal_company_name || l.title || '',
        _source_id: l.id,
        _source_type: 'listing',
      };
    });
}

async function resolveFromLeads(
  supabase: SupabaseClient<any, any, any>,
  leadIds: string[],
): Promise<ResolvedLead[]> {
  const { data: leads } = await supabase
    .from('inbound_leads')
    .select('id, name, email, phone_number, company_name, role')
    .in('id', leadIds);

  if (!leads?.length) return [];

  return leads
    .filter((l) => l.email)
    .map((l) => {
      const parts = (l.name || '').split(' ');
      return {
        linkedInUrl: '',
        email: l.email!,
        firstName: parts[0] || '',
        lastName: parts.slice(1).join(' ') || '',
        companyName: l.company_name || '',
        phone: l.phone_number || '',
        _source_id: l.id,
        _source_type: 'inbound_lead',
      };
    });
}

// ─── Main handler ───────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsPreflightResponse(req);
  const corsHeaders = getCorsHeaders(req);
  const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json' };

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: jsonHeaders,
    });
  }

  // ─── Auth ───
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: jsonHeaders,
    });
  }

  const anonClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!);
  const token = authHeader.replace('Bearer ', '');
  const {
    data: { user },
    error: authError,
  } = await anonClient.auth.getUser(token);
  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Invalid token' }), {
      status: 401,
      headers: jsonHeaders,
    });
  }

  const { data: isAdmin } = await supabase.rpc('is_admin', { user_id: user.id });
  if (!isAdmin) {
    return new Response(JSON.stringify({ error: 'Admin access required' }), {
      status: 403,
      headers: jsonHeaders,
    });
  }

  const body = await req.json();
  const { action } = body;

  try {
    switch (action) {
      case 'push': {
        const { campaign_id, list_id, entity_type, entity_ids } = body as {
          campaign_id: number;
          list_id: number;
          entity_type: EntityType;
          entity_ids: string[];
        };

        if (!campaign_id || !list_id || !entity_type || !entity_ids?.length) {
          return new Response(
            JSON.stringify({
              error: 'campaign_id, list_id, entity_type, and entity_ids required',
            }),
            { status: 400, headers: jsonHeaders },
          );
        }

        // Resolve contacts
        let leads: ResolvedLead[];
        switch (entity_type) {
          case 'contacts':
          case 'buyer_contacts':
            leads = await resolveFromBuyerContacts(supabase, entity_ids);
            break;
          case 'buyers':
            leads = await resolveFromBuyers(supabase, entity_ids);
            break;
          case 'listings':
            leads = await resolveFromListings(supabase, entity_ids);
            break;
          case 'leads':
            leads = await resolveFromLeads(supabase, entity_ids);
            break;
          default:
            return new Response(JSON.stringify({ error: `Unknown entity_type: ${entity_type}` }), {
              status: 400,
              headers: jsonHeaders,
            });
        }

        // Filter to leads that have a LinkedIn URL (required for HeyReach campaigns)
        const linkedInLeads = leads.filter((l) => l.linkedInUrl);
        const nonLinkedIn = leads.filter((l) => !l.linkedInUrl);

        if (!linkedInLeads.length) {
          return new Response(
            JSON.stringify({
              error: 'No contacts with LinkedIn URLs found. HeyReach requires LinkedIn profiles.',
              total_resolved: leads.length,
              missing_linkedin: nonLinkedIn.length,
            }),
            { status: 404, headers: jsonHeaders },
          );
        }

        // HeyReach API call — add leads to campaign using V2 format
        const accountLeadPairs = linkedInLeads.map((l) => ({
          lead: {
            profileUrl: l.linkedInUrl,
            firstName: l.firstName,
            lastName: l.lastName,
            companyName: l.companyName,
            emailAddress: l.email,
          },
        }));
        const result = await addLeadsToCampaign(campaign_id, accountLeadPairs);

        const totalAdded = result.ok ? linkedInLeads.length : 0;
        const errors: string[] = [];
        if (!result.ok) {
          errors.push(result.error || 'Failed to add leads to campaign');
        }

        // Track leads locally
        const { data: localCampaign } = await supabase
          .from('heyreach_campaigns')
          .select('id')
          .eq('heyreach_campaign_id', campaign_id)
          .single();

        if (localCampaign) {
          const leadsToInsert = linkedInLeads.map((lead) => ({
            campaign_id: localCampaign.id,
            linkedin_url: lead.linkedInUrl,
            email: lead.email || null,
            first_name: lead.firstName,
            last_name: lead.lastName,
            company_name: lead.companyName || null,
            buyer_contact_id: lead._source_type === 'buyer_contact' ? lead._source_id : null,
            remarketing_buyer_id:
              lead._source_type === 'remarketing_buyer' ? lead._source_id : null,
            lead_status: 'pending',
            metadata: { source_type: lead._source_type },
          }));

          const { error: insertError } = await supabase
            .from('heyreach_campaign_leads')
            .upsert(leadsToInsert, { onConflict: 'campaign_id,linkedin_url' });

          if (insertError) {
            console.error('[heyreach-leads] Local insert error:', insertError);
          }

          // Update lead count
          await supabase
            .from('heyreach_campaigns')
            .update({
              lead_count: linkedInLeads.length,
              last_synced_at: new Date().toISOString(),
            })
            .eq('id', localCampaign.id);
        }

        return new Response(
          JSON.stringify({
            success: errors.length === 0,
            total_resolved: leads.length,
            total_pushed: totalAdded,
            missing_linkedin: nonLinkedIn.length,
            errors: errors.length > 0 ? errors : undefined,
          }),
          { headers: jsonHeaders },
        );
      }

      case 'list': {
        const { list_id, offset = 0, limit = 100 } = body;
        if (!list_id) {
          return new Response(JSON.stringify({ error: 'list_id required' }), {
            status: 400,
            headers: jsonHeaders,
          });
        }
        const result = await getLeadsFromList(list_id, offset, limit);
        if (!result.ok) {
          return new Response(JSON.stringify({ error: result.error }), {
            status: 502,
            headers: jsonHeaders,
          });
        }
        return new Response(JSON.stringify({ leads: result.data }), {
          headers: jsonHeaders,
        });
      }

      case 'get_lead': {
        const { linkedin_url } = body;
        if (!linkedin_url) {
          return new Response(JSON.stringify({ error: 'linkedin_url required' }), {
            status: 400,
            headers: jsonHeaders,
          });
        }
        const result = await getLeadDetails(linkedin_url);
        if (!result.ok) {
          return new Response(JSON.stringify({ error: result.error }), {
            status: 502,
            headers: jsonHeaders,
          });
        }
        return new Response(JSON.stringify({ lead: result.data }), {
          headers: jsonHeaders,
        });
      }

      case 'add_to_list': {
        const { list_id, entity_type, entity_ids } = body as {
          list_id: number;
          entity_type: EntityType;
          entity_ids: string[];
        };

        if (!list_id || !entity_type || !entity_ids?.length) {
          return new Response(
            JSON.stringify({ error: 'list_id, entity_type, and entity_ids required' }),
            { status: 400, headers: jsonHeaders },
          );
        }

        let leads: ResolvedLead[];
        switch (entity_type) {
          case 'contacts':
          case 'buyer_contacts':
            leads = await resolveFromBuyerContacts(supabase, entity_ids);
            break;
          case 'buyers':
            leads = await resolveFromBuyers(supabase, entity_ids);
            break;
          case 'listings':
            leads = await resolveFromListings(supabase, entity_ids);
            break;
          case 'leads':
            leads = await resolveFromLeads(supabase, entity_ids);
            break;
          default:
            return new Response(JSON.stringify({ error: `Unknown entity_type: ${entity_type}` }), {
              status: 400,
              headers: jsonHeaders,
            });
        }

        const linkedInLeads = leads.filter((l) => l.linkedInUrl);
        if (!linkedInLeads.length) {
          return new Response(
            JSON.stringify({ error: 'No contacts with LinkedIn URLs found' }),
            { status: 404, headers: jsonHeaders },
          );
        }

        const apiLeads = linkedInLeads.map((l) => ({
          profileUrl: l.linkedInUrl,
          firstName: l.firstName,
          lastName: l.lastName,
          companyName: l.companyName,
          emailAddress: l.email,
        }));
        const result = await addLeadsToList(list_id, apiLeads);

        if (!result.ok) {
          return new Response(JSON.stringify({ error: result.error }), {
            status: 502,
            headers: jsonHeaders,
          });
        }

        return new Response(
          JSON.stringify({
            success: true,
            total_resolved: leads.length,
            total_added: linkedInLeads.length,
            missing_linkedin: leads.length - linkedInLeads.length,
          }),
          { headers: jsonHeaders },
        );
      }

      default:
        return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
          status: 400,
          headers: jsonHeaders,
        });
    }
  } catch (err) {
    console.error('[heyreach-leads] Unhandled error:', err);
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : 'Internal error',
      }),
      { status: 500, headers: jsonHeaders },
    );
  }
});
