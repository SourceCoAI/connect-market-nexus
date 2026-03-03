/**
 * Smartlead Leads Edge Function
 *
 * Manages lead operations: pushing contacts to Smartlead campaigns,
 * listing leads, fetching message history, and updating lead categories.
 *
 * Endpoints (via action in request body):
 *   POST { action: "push", campaign_id, entity_type, entity_ids }
 *     — Resolve platform contacts and push them to a Smartlead campaign
 *   POST { action: "list", campaign_id, offset?, limit? }
 *     — List leads in a campaign
 *   POST { action: "messages", campaign_id, lead_id }
 *     — Fetch message history for a lead
 *   POST { action: "update_category", campaign_id, lead_id, category }
 *     — Update a lead's category
 *   POST { action: "global", offset?, limit? }
 *     — Fetch all leads from entire Smartlead account
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';
import {
  addLeadsToCampaign,
  listCampaignLeads,
  getLeadMessageHistory,
  updateLeadCategory,
  getGlobalLeads,
} from '../_shared/smartlead-client.ts';

type EntityType = 'contacts' | 'buyer_contacts' | 'buyers' | 'listings' | 'leads';

interface ResolvedLead {
  email: string;
  first_name: string;
  last_name: string;
  company_name?: string;
  phone_number?: string;
  linkedin_profile?: string;
  custom_fields?: Record<string, string>;
  // Internal tracking
  _source_id?: string;
  _source_type?: string;
}

// ─── Contact resolvers ──────────────────────────────────────────────────────

async function resolveFromBuyerContacts(
  supabase: ReturnType<typeof createClient>,
  ids: string[],
): Promise<ResolvedLead[]> {
  // Read from unified contacts table instead of legacy buyer_contacts
  const { data: contacts } = await supabase
    .from('contacts')
    .select('id, first_name, last_name, email, phone, title, remarketing_buyer_id, linkedin_url')
    .in('id', ids)
    .eq('archived', false);

  if (!contacts?.length) return [];

  const buyerIds = [...new Set(contacts.map((c: { remarketing_buyer_id: string | null }) => c.remarketing_buyer_id).filter(Boolean))];
  const { data: buyers } = await supabase
    .from('remarketing_buyers')
    .select('id, company_name')
    .in('id', buyerIds);
  const buyerMap = new Map((buyers || []).map((b: { id: string; company_name?: string }) => [b.id, b]));

  return contacts
    .filter((c: { email?: string | null }) => c.email)
    .map((c: { id: string; first_name?: string | null; last_name?: string | null; email?: string | null; phone?: string | null; title?: string | null; remarketing_buyer_id: string | null; linkedin_url?: string | null }) => {
      const buyer = c.remarketing_buyer_id ? buyerMap.get(c.remarketing_buyer_id) : null;
      return {
        email: c.email!,
        first_name: c.first_name || '',
        last_name: c.last_name || '',
        company_name: buyer?.company_name || '',
        phone_number: c.phone || '',
        linkedin_profile: c.linkedin_url || '',
        custom_fields: {
          sourceco_contact_id: c.id,
          contact_title: c.title || '',
          source: 'SourceCo Platform',
        },
        _source_id: c.id,
        _source_type: 'buyer_contact',
      };
    });
}

async function resolveFromBuyers(
  supabase: ReturnType<typeof createClient>,
  buyerIds: string[],
): Promise<ResolvedLead[]> {
  // Get contacts linked to these buyers from unified contacts table
  const { data: contacts } = await supabase
    .from('contacts')
    .select('id, first_name, last_name, email, phone, title, remarketing_buyer_id, linkedin_url')
    .in('remarketing_buyer_id', buyerIds)
    .eq('archived', false);

  const { data: buyers } = await supabase
    .from('remarketing_buyers')
    .select('id, company_name, contact_name, contact_email, contact_phone')
    .in('id', buyerIds);
  const buyerMap = new Map((buyers || []).map((b: { id: string; company_name?: string; contact_name?: string; contact_email?: string; contact_phone?: string }) => [b.id, b]));

  const seen = new Set<string>();
  const result: ResolvedLead[] = [];

  // Sub-contacts first
  for (const c of contacts || []) {
    if (!c.email) continue;
    const key = c.email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const buyer = c.remarketing_buyer_id ? buyerMap.get(c.remarketing_buyer_id) : null;
    result.push({
      email: c.email,
      first_name: c.first_name || '',
      last_name: c.last_name || '',
      company_name: buyer?.company_name || '',
      phone_number: c.phone || '',
      linkedin_profile: c.linkedin_url || '',
      custom_fields: {
        sourceco_contact_id: c.id,
        sourceco_buyer_id: c.remarketing_buyer_id || '',
        source: 'SourceCo Platform',
      },
      _source_id: c.id,
      _source_type: 'buyer_contact',
    });
  }

  // Fallback: buyer-level contact info for buyers with no sub-contacts
  const buyersWithContacts = new Set((contacts || []).map((c: { remarketing_buyer_id: string | null }) => c.remarketing_buyer_id).filter(Boolean));
  for (const buyerId of buyerIds) {
    if (buyersWithContacts.has(buyerId)) continue;
    const buyer = buyerMap.get(buyerId);
    if (!buyer?.contact_email) continue;
    const key = buyer.contact_email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const parts = (buyer.contact_name || '').split(' ');
    result.push({
      email: buyer.contact_email,
      first_name: parts[0] || '',
      last_name: parts.slice(1).join(' ') || '',
      company_name: buyer.company_name || '',
      phone_number: buyer.contact_phone || '',
      custom_fields: {
        sourceco_buyer_id: buyerId,
        source: 'SourceCo Platform',
      },
      _source_id: buyerId,
      _source_type: 'remarketing_buyer',
    });
  }

  return result;
}

async function resolveFromListings(
  supabase: ReturnType<typeof createClient>,
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
    .filter((l: { main_contact_email?: string }) => l.main_contact_email)
    .map((l: { id: string; title?: string; internal_company_name?: string; main_contact_name?: string; main_contact_email?: string; main_contact_phone?: string }) => {
      const parts = (l.main_contact_name || '').split(' ');
      return {
        email: l.main_contact_email!,
        first_name: parts[0] || '',
        last_name: parts.slice(1).join(' ') || '',
        company_name: l.internal_company_name || l.title || '',
        phone_number: l.main_contact_phone || '',
        custom_fields: {
          sourceco_listing_id: l.id,
          source: 'SourceCo Platform',
        },
        _source_id: l.id,
        _source_type: 'listing',
      };
    });
}

async function resolveFromLeads(
  supabase: ReturnType<typeof createClient>,
  leadIds: string[],
): Promise<ResolvedLead[]> {
  const { data: leads } = await supabase
    .from('inbound_leads')
    .select('id, name, email, phone_number, company_name, role')
    .in('id', leadIds);

  if (!leads?.length) return [];

  return leads
    .filter((l: { email?: string }) => l.email)
    .map((l: { id: string; name?: string; email?: string; phone_number?: string; company_name?: string; role?: string }) => {
      const parts = (l.name || '').split(' ');
      return {
        email: l.email!,
        first_name: parts[0] || '',
        last_name: parts.slice(1).join(' ') || '',
        company_name: l.company_name || '',
        phone_number: l.phone_number || '',
        custom_fields: {
          sourceco_lead_id: l.id,
          lead_role: l.role || '',
          source: 'SourceCo Platform',
        },
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
        const { campaign_id, entity_type, entity_ids } = body as {
          campaign_id: number;
          entity_type: EntityType;
          entity_ids: string[];
        };

        if (!campaign_id || !entity_type || !entity_ids?.length) {
          return new Response(
            JSON.stringify({
              error: 'campaign_id, entity_type, and entity_ids required',
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

        if (!leads.length) {
          return new Response(JSON.stringify({ error: 'No contacts with email found' }), {
            status: 404,
            headers: jsonHeaders,
          });
        }

        // Smartlead limits to 100 leads per request — batch if needed
        const BATCH_SIZE = 100;
        let totalAdded = 0;
        const errors: string[] = [];

        for (let i = 0; i < leads.length; i += BATCH_SIZE) {
          const batch = leads.slice(i, i + BATCH_SIZE);
          const apiLeads = batch.map(({ _source_id: _, _source_type: __, ...rest }) => rest);

          const result = await addLeadsToCampaign(campaign_id, apiLeads);
          if (result.ok) {
            totalAdded += batch.length;
          } else {
            errors.push(`Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${result.error}`);
          }
        }

        // Track leads locally
        const { data: localCampaign } = await supabase
          .from('smartlead_campaigns')
          .select('id')
          .eq('smartlead_campaign_id', campaign_id)
          .single();

        if (localCampaign) {
          const leadsToInsert = leads.map((lead) => ({
            campaign_id: localCampaign.id,
            email: lead.email,
            first_name: lead.first_name,
            last_name: lead.last_name,
            company_name: lead.company_name || null,
            buyer_contact_id: lead._source_type === 'buyer_contact' ? lead._source_id : null,
            remarketing_buyer_id:
              lead._source_type === 'remarketing_buyer' ? lead._source_id : null,
            lead_status: 'pending',
            metadata: { source_type: lead._source_type },
          }));

          const { error: insertError } = await supabase
            .from('smartlead_campaign_leads')
            .upsert(leadsToInsert, { onConflict: 'campaign_id,email' });

          if (insertError) {
            console.error('[smartlead-leads] Local insert error:', insertError);
          }

          // Update lead count
          await supabase
            .from('smartlead_campaigns')
            .update({
              lead_count: leads.length,
              last_synced_at: new Date().toISOString(),
            })
            .eq('id', localCampaign.id);
        }

        return new Response(
          JSON.stringify({
            success: errors.length === 0,
            total_resolved: leads.length,
            total_pushed: totalAdded,
            errors: errors.length > 0 ? errors : undefined,
          }),
          { headers: jsonHeaders },
        );
      }

      case 'list': {
        const { campaign_id, offset = 0, limit = 100 } = body;
        if (!campaign_id) {
          return new Response(JSON.stringify({ error: 'campaign_id required' }), {
            status: 400,
            headers: jsonHeaders,
          });
        }
        const result = await listCampaignLeads(campaign_id, offset, limit);
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

      case 'messages': {
        const { campaign_id, lead_id } = body;
        if (!campaign_id || !lead_id) {
          return new Response(JSON.stringify({ error: 'campaign_id and lead_id required' }), {
            status: 400,
            headers: jsonHeaders,
          });
        }
        const result = await getLeadMessageHistory(campaign_id, lead_id);
        if (!result.ok) {
          return new Response(JSON.stringify({ error: result.error }), {
            status: 502,
            headers: jsonHeaders,
          });
        }
        return new Response(JSON.stringify({ messages: result.data }), {
          headers: jsonHeaders,
        });
      }

      case 'update_category': {
        const { campaign_id, lead_id, category } = body;
        if (!campaign_id || !lead_id || !category) {
          return new Response(
            JSON.stringify({ error: 'campaign_id, lead_id, and category required' }),
            { status: 400, headers: jsonHeaders },
          );
        }
        const result = await updateLeadCategory(campaign_id, lead_id, category);
        if (!result.ok) {
          return new Response(JSON.stringify({ error: result.error }), {
            status: 502,
            headers: jsonHeaders,
          });
        }
        return new Response(JSON.stringify({ success: true, data: result.data }), {
          headers: jsonHeaders,
        });
      }

      case 'global': {
        const { offset = 0, limit = 100 } = body;
        const result = await getGlobalLeads(offset, limit);
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

      default:
        return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
          status: 400,
          headers: jsonHeaders,
        });
    }
  } catch (err) {
    console.error('[smartlead-leads] Unhandled error:', err);
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : 'Internal error',
      }),
      { status: 500, headers: jsonHeaders },
    );
  }
});
