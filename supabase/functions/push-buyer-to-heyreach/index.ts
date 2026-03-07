/**
 * Push Buyer to HeyReach — Buyer Outreach Integration
 *
 * Accepts buyer IDs and a deal ID, fetches contact details and deal outreach
 * profile variables, then pushes contacts to a HeyReach campaign with
 * deal-specific merge variables. Requires linkedin_url on contacts.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';
import { addLeadsToCampaign } from '../_shared/heyreach-client.ts';

interface PushRequest {
  deal_id: string;
  buyer_ids: string[];
  campaign_id: number;
}

function deriveBuyerRef(buyerType: string | null, platformName: string | null): string {
  if (buyerType === 'pe_firm') {
    if (platformName && platformName.trim().length > 0) {
      return `your ${platformName.trim()} platform`;
    }
    return 'your portfolio';
  }
  if (buyerType === 'independent_sponsor') return 'your deal pipeline';
  if (buyerType === 'family_office') return 'your acquisition criteria';
  if (buyerType === 'individual_buyer') return 'your search';
  if (buyerType === 'strategic') return 'your growth strategy';
  return 'your investment criteria';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsPreflightResponse(req);
  const corsHeaders = getCorsHeaders(req);
  const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json' };

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: jsonHeaders,
    });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // Auth
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: jsonHeaders,
    });
  }
  const anonClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!);
  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error: authError } = await anonClient.auth.getUser(token);
  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Invalid token' }), {
      status: 401, headers: jsonHeaders,
    });
  }
  const { data: isAdmin } = await supabase.rpc('is_admin', { user_id: user.id });
  if (!isAdmin) {
    return new Response(JSON.stringify({ error: 'Admin access required' }), {
      status: 403, headers: jsonHeaders,
    });
  }

  try {
    const { deal_id, buyer_ids, campaign_id } = await req.json() as PushRequest;

    if (!deal_id || !buyer_ids?.length || !campaign_id) {
      return new Response(JSON.stringify({ error: 'deal_id, buyer_ids, and campaign_id required' }), {
        status: 400, headers: jsonHeaders,
      });
    }

    // Fetch deal outreach profile
    const { data: profile, error: profileError } = await supabase
      .from('deal_outreach_profiles')
      .select('deal_descriptor, geography, ebitda')
      .eq('deal_id', deal_id)
      .single();

    if (profileError || !profile) {
      return new Response(JSON.stringify({ error: 'Deal outreach profile not found. Complete the outreach profile first.' }), {
        status: 400, headers: jsonHeaders,
      });
    }

    // Fetch contacts
    const { data: contacts } = await supabase
      .from('contacts')
      .select('id, first_name, last_name, email, linkedin_url, remarketing_buyer_id')
      .in('id', buyer_ids)
      .eq('archived', false);

    if (!contacts?.length) {
      return new Response(JSON.stringify({ error: 'No contacts found for the provided buyer IDs' }), {
        status: 404, headers: jsonHeaders,
      });
    }

    // Fetch buyer info for buyer_ref derivation
    const buyerIds = [...new Set(contacts.map(c => c.remarketing_buyer_id).filter(Boolean))];
    let buyerMap = new Map<string, { buyer_type: string | null; company_name: string | null; pe_firm_name: string | null }>();
    if (buyerIds.length > 0) {
      const { data: buyers } = await supabase
        .from('buyers')
        .select('id, buyer_type, company_name, pe_firm_name')
        .in('id', buyerIds);
      buyerMap = new Map((buyers || []).map(b => [b.id, b]));
    }

    const pushed: string[] = [];
    const skipped: { id: string; reason: string }[] = [];
    const errors: string[] = [];

    // Filter contacts with LinkedIn URL
    const validContacts = contacts.filter(c => {
      if (!c.linkedin_url) {
        skipped.push({ id: c.id, reason: 'Missing LinkedIn URL' });
        return false;
      }
      return true;
    });

    if (!validContacts.length) {
      return new Response(JSON.stringify({
        success: false,
        pushed: 0,
        skipped,
        errors: ['No contacts with LinkedIn URLs found'],
      }), { headers: jsonHeaders });
    }

    // Build leads with custom fields
    const accountLeadPairs = validContacts.map(c => {
      const buyer = c.remarketing_buyer_id ? buyerMap.get(c.remarketing_buyer_id) : null;
      const buyerRef = deriveBuyerRef(buyer?.buyer_type || null, buyer?.pe_firm_name || null);

      return {
        lead: {
          profileUrl: c.linkedin_url!,
          firstName: c.first_name,
          lastName: c.last_name || '',
          emailAddress: c.email || undefined,
          companyName: buyer?.company_name || '',
        },
        customUserFields: [
          { fieldName: 'deal_descriptor', fieldValue: profile.deal_descriptor },
          { fieldName: 'geography', fieldValue: profile.geography },
          { fieldName: 'ebitda', fieldValue: profile.ebitda },
          { fieldName: 'buyer_ref', fieldValue: buyerRef },
          { fieldName: 'sourceco_deal_id', fieldValue: deal_id },
          { fieldName: 'sourceco_buyer_id', fieldValue: c.id },
        ],
        _contactId: c.id,
      };
    });

    // Push to HeyReach
    const leadsForApi = accountLeadPairs.map(({ _contactId: _, ...rest }) => rest);
    const result = await addLeadsToCampaign(campaign_id, leadsForApi);

    if (result.ok) {
      pushed.push(...accountLeadPairs.map(p => p._contactId));
    } else {
      errors.push(result.error || 'Failed to add leads to HeyReach campaign');
    }

    // Record 'launched' events
    if (pushed.length > 0) {
      const events = pushed.map(buyerId => ({
        deal_id,
        buyer_id: buyerId,
        channel: 'linkedin',
        tool: 'heyreach',
        event_type: 'launched',
        event_timestamp: new Date().toISOString(),
      }));

      const { error: insertError } = await supabase
        .from('buyer_outreach_events')
        .insert(events);

      if (insertError) {
        console.error('[push-buyer-to-heyreach] Event insert error:', insertError);
      }
    }

    return new Response(JSON.stringify({
      success: errors.length === 0,
      pushed: pushed.length,
      skipped,
      errors: errors.length > 0 ? errors : undefined,
    }), { headers: jsonHeaders });

  } catch (err) {
    console.error('[push-buyer-to-heyreach] Unhandled error:', err);
    return new Response(JSON.stringify({
      error: err instanceof Error ? err.message : 'Internal error',
    }), { status: 500, headers: jsonHeaders });
  }
});
