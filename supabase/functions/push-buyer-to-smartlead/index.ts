/**
 * Push Buyer to Smartlead — Buyer Outreach Integration
 *
 * Accepts buyer IDs and a deal ID, fetches contact details and deal outreach
 * profile variables, then pushes contacts to a Smartlead campaign with
 * deal-specific merge variables.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';
import { addLeadsToCampaign } from '../_shared/smartlead-client.ts';
import { deriveBuyerRef } from '../_shared/derive-buyer-ref.ts';

interface PushRequest {
  deal_id: string;
  buyer_ids: string[];
  campaign_id: number;
  /** Optional user-defined field overrides: { tagName: sourceField } */
  custom_fields_override?: Record<string, string>;
}

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

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // Auth
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

  try {
    const { deal_id, buyer_ids, campaign_id, custom_fields_override } =
      (await req.json()) as PushRequest;

    if (!deal_id || !buyer_ids?.length || !campaign_id) {
      return new Response(
        JSON.stringify({ error: 'deal_id, buyer_ids, and campaign_id required' }),
        {
          status: 400,
          headers: jsonHeaders,
        },
      );
    }

    // Fetch deal outreach profile
    const { data: profile, error: profileError } = await supabase
      .from('deal_outreach_profiles')
      .select('deal_descriptor, geography, ebitda')
      .eq('deal_id', deal_id)
      .single();

    if (profileError || !profile) {
      return new Response(
        JSON.stringify({
          error: 'Deal outreach profile not found. Complete the outreach profile first.',
        }),
        {
          status: 400,
          headers: jsonHeaders,
        },
      );
    }

    if (!profile.deal_descriptor?.trim() || !profile.geography?.trim() || !profile.ebitda?.trim()) {
      return new Response(
        JSON.stringify({
          error: 'Deal outreach profile has empty fields. All fields must be filled.',
        }),
        {
          status: 400,
          headers: jsonHeaders,
        },
      );
    }

    // Fetch contacts for these buyers
    const { data: contacts } = await supabase
      .from('contacts')
      .select('id, first_name, last_name, email, phone, company_name, title, remarketing_buyer_id')
      .in('id', buyer_ids)
      .eq('archived', false);

    if (!contacts?.length) {
      return new Response(
        JSON.stringify({ error: 'No contacts found for the provided buyer IDs' }),
        {
          status: 404,
          headers: jsonHeaders,
        },
      );
    }

    // Fetch buyer info for buyer_ref derivation
    const buyerIds = [...new Set(contacts.map((c) => c.remarketing_buyer_id).filter(Boolean))];
    let buyerMap = new Map<
      string,
      { buyer_type: string | null; company_name: string | null; pe_firm_name: string | null }
    >();
    if (buyerIds.length > 0) {
      const { data: buyers } = await supabase
        .from('buyers')
        .select('id, buyer_type, company_name, pe_firm_name')
        .in('id', buyerIds);
      buyerMap = new Map((buyers || []).map((b) => [b.id, b]));
    }

    const pushed: string[] = [];
    const skipped: { id: string; reason: string }[] = [];
    const errors: string[] = [];

    // Filter contacts with valid email
    const validContacts = contacts.filter((c) => {
      if (!c.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email)) {
        skipped.push({ id: c.id, reason: 'Missing or invalid email' });
        return false;
      }
      if (!c.first_name) {
        skipped.push({ id: c.id, reason: 'Missing first name' });
        return false;
      }
      return true;
    });

    if (!validContacts.length) {
      return new Response(
        JSON.stringify({
          success: false,
          pushed: 0,
          skipped,
          errors: ['No contacts with valid email addresses'],
        }),
        { headers: jsonHeaders },
      );
    }

    // Build lead list with merge variables
    const leadList = validContacts.map((c) => {
      const buyer = c.remarketing_buyer_id ? buyerMap.get(c.remarketing_buyer_id) : null;
      const buyerRef = deriveBuyerRef(buyer?.buyer_type || null, buyer?.pe_firm_name || null);

      const customFields: Record<string, string> = {
        deal_descriptor: profile.deal_descriptor,
        geography: profile.geography,
        ebitda: profile.ebitda,
        buyer_ref: buyerRef,
        sourceco_deal_id: deal_id,
        sourceco_buyer_id: c.id,
      };

      // Apply user-defined custom field overrides (tag → sourceField mapping)
      if (custom_fields_override) {
        // Available data sources to resolve sourceField references
        const fieldValues: Record<string, string> = {
          first_name: c.first_name || '',
          last_name: c.last_name || '',
          email: c.email || '',
          phone: c.phone || '',
          company_name: c.company_name || '',
          title: c.title || '',
          deal_descriptor: profile.deal_descriptor,
          geography: profile.geography,
          ebitda: profile.ebitda,
          buyer_ref: buyerRef,
          buyer_type: buyer?.buyer_type || '',
          buyer_company_name: buyer?.company_name || '',
          pe_firm_name: buyer?.pe_firm_name || '',
        };

        for (const [tag, sourceField] of Object.entries(custom_fields_override)) {
          customFields[tag] = fieldValues[sourceField] || '';
        }
      }

      return {
        email: c.email!,
        first_name: c.first_name,
        last_name: c.last_name || '',
        company_name: c.company_name || buyer?.company_name || '',
        custom_fields: customFields,
      };
    });

    // Push to Smartlead in batches of 100
    const BATCH_SIZE = 100;
    for (let i = 0; i < leadList.length; i += BATCH_SIZE) {
      const batch = leadList.slice(i, i + BATCH_SIZE);
      const result = await addLeadsToCampaign(campaign_id, batch);
      if (result.ok) {
        pushed.push(...batch.map((l) => l.custom_fields.sourceco_buyer_id));
      } else {
        errors.push(`Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${result.error}`);
      }
    }

    // Record 'launched' events for successfully pushed contacts
    if (pushed.length > 0) {
      const events = pushed.map((buyerId) => ({
        deal_id,
        buyer_id: buyerId,
        channel: 'email',
        tool: 'smartlead',
        event_type: 'launched',
        event_timestamp: new Date().toISOString(),
      }));

      const { error: insertError } = await supabase.from('buyer_outreach_events').insert(events);

      if (insertError) {
        console.error('[push-buyer-to-smartlead] Event insert error:', insertError);
      }
    }

    return new Response(
      JSON.stringify({
        success: errors.length === 0,
        pushed: pushed.length,
        skipped,
        errors: errors.length > 0 ? errors : undefined,
      }),
      { headers: jsonHeaders },
    );
  } catch (err) {
    console.error('[push-buyer-to-smartlead] Unhandled error:', err);
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : 'Internal error',
      }),
      { status: 500, headers: jsonHeaders },
    );
  }
});
