/**
 * Push Buyer to PhoneBurner — Buyer Outreach Integration
 *
 * Accepts buyer IDs and a deal ID, fetches contact details and deal outreach
 * profile variables, generates a call script from the template, and creates
 * contacts in PhoneBurner with the call script as a note.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';
import { deriveBuyerRef } from '../_shared/derive-buyer-ref.ts';

const PB_API_BASE = 'https://www.phoneburner.com/rest/1';

interface PushRequest {
  deal_id: string;
  buyer_ids: string[];
}

function generateCallScript(vars: {
  firstName: string;
  senderName: string;
  senderPhone: string;
  dealDescriptor: string;
  geography: string;
  ebitda: string;
  buyerRef: string;
}): string {
  return `LIVE ANSWER:
Hi, is this ${vars.firstName}?

Great — this is ${vars.senderName} from SourceCo. I'm reaching out because we have an off-market ${vars.dealDescriptor} ${vars.geography} generating ${vars.ebitda} that we thought could be a fit for ${vars.buyerRef}.

Is that something you'd have any interest in taking a look at?

[If yes] — Great, I'll send over a brief summary today. Best email for that?
[If no] — Completely understood, when would be a better time?
[If not a fit] — No problem at all, I appreciate your time.

---

VOICEMAIL:
Hi ${vars.firstName}, this is ${vars.senderName} from SourceCo. I'm calling because we have an off-market ${vars.dealDescriptor} ${vars.geography} generating ${vars.ebitda} that may be relevant for ${vars.buyerRef}. I'll follow up by email as well — feel free to reach me at ${vars.senderPhone}. Thanks.`;
}

function normalizePhone(value: string | null | undefined): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, '');
  if (!digits) return null;
  return digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
}

async function getValidToken(
  supabase: ReturnType<typeof createClient>,
  userId: string,
): Promise<string | null> {
  const { data: tokenRow } = await supabase
    .from('phoneburner_oauth_tokens')
    .select('access_token')
    .eq('user_id', userId)
    .single();
  return tokenRow?.access_token || null;
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

  // Get user profile for sender_name and sender_phone
  const { data: userProfile } = await supabase
    .from('profiles')
    .select('first_name, last_name, phone')
    .eq('id', user.id)
    .single();

  const senderName = userProfile
    ? `${userProfile.first_name || ''} ${userProfile.last_name || ''}`.trim()
    : 'SourceCo';
  const senderPhone = userProfile?.phone || '[number]';

  // Get PhoneBurner access token
  const pbToken = await getValidToken(supabase, user.id);
  if (!pbToken) {
    return new Response(JSON.stringify({ error: 'PhoneBurner not connected. Please connect your PhoneBurner account first.' }), {
      status: 400, headers: jsonHeaders,
    });
  }

  try {
    const { deal_id, buyer_ids } = await req.json() as PushRequest;

    if (!deal_id || !buyer_ids?.length) {
      return new Response(JSON.stringify({ error: 'deal_id and buyer_ids required' }), {
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

    if (!profile.deal_descriptor?.trim() || !profile.geography?.trim() || !profile.ebitda?.trim()) {
      return new Response(JSON.stringify({ error: 'Deal outreach profile has empty fields. All fields must be filled.' }), {
        status: 400, headers: jsonHeaders,
      });
    }

    // Fetch contacts
    const { data: contacts } = await supabase
      .from('contacts')
      .select('id, first_name, last_name, email, phone, remarketing_buyer_id')
      .in('id', buyer_ids)
      .eq('archived', false);

    if (!contacts?.length) {
      return new Response(JSON.stringify({ error: 'No contacts found for the provided buyer IDs' }), {
        status: 404, headers: jsonHeaders,
      });
    }

    // Fetch buyer info for buyer_ref derivation
    const rBuyerIds = [...new Set(contacts.map(c => c.remarketing_buyer_id).filter(Boolean))];
    let buyerMap = new Map<string, { buyer_type: string | null; company_name: string | null; pe_firm_name: string | null }>();
    if (rBuyerIds.length > 0) {
      const { data: buyers } = await supabase
        .from('buyers')
        .select('id, buyer_type, company_name, pe_firm_name')
        .in('id', rBuyerIds);
      buyerMap = new Map((buyers || []).map(b => [b.id, b]));
    }

    const pushed: string[] = [];
    const skipped: { id: string; reason: string }[] = [];
    const errors: string[] = [];

    for (const contact of contacts) {
      const phone = normalizePhone(contact.phone);
      if (!phone) {
        skipped.push({ id: contact.id, reason: 'Missing phone number' });
        continue;
      }

      const buyer = contact.remarketing_buyer_id ? buyerMap.get(contact.remarketing_buyer_id) : null;
      const buyerRef = deriveBuyerRef(buyer?.buyer_type || null, buyer?.pe_firm_name || null);

      const callScript = generateCallScript({
        firstName: contact.first_name,
        senderName,
        senderPhone,
        dealDescriptor: profile.deal_descriptor,
        geography: profile.geography,
        ebitda: profile.ebitda,
        buyerRef,
      });

      // Create contact in PhoneBurner
      const pbResponse = await fetch(`${PB_API_BASE}/contacts`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${pbToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          first_name: contact.first_name,
          last_name: contact.last_name || '',
          email: contact.email || '',
          phone_number: phone,
          company: buyer?.company_name || '',
          category_id: 0,
          notes: callScript,
          custom_fields: [
            { name: 'sourceco_deal_id', type: 1, value: deal_id },
            { name: 'sourceco_buyer_id', type: 1, value: contact.id },
          ],
          tags: ['buyer-outreach', deal_id],
        }),
      });

      if (pbResponse.ok) {
        pushed.push(contact.id);
      } else {
        const errText = await pbResponse.text().catch(() => 'Unknown error');
        errors.push(`Contact ${contact.id}: ${errText}`);
      }
    }

    // Record 'launched' events
    if (pushed.length > 0) {
      const events = pushed.map(buyerId => ({
        deal_id,
        buyer_id: buyerId,
        channel: 'phone',
        tool: 'phoneburner',
        event_type: 'launched',
        event_timestamp: new Date().toISOString(),
      }));

      const { error: insertError } = await supabase
        .from('buyer_outreach_events')
        .insert(events);

      if (insertError) {
        console.error('[push-buyer-to-phoneburner] Event insert error:', insertError);
      }
    }

    return new Response(JSON.stringify({
      success: errors.length === 0,
      pushed: pushed.length,
      skipped,
      errors: errors.length > 0 ? errors : undefined,
    }), { headers: jsonHeaders });

  } catch (err) {
    console.error('[push-buyer-to-phoneburner] Unhandled error:', err);
    return new Response(JSON.stringify({
      error: err instanceof Error ? err.message : 'Internal error',
    }), { status: 500, headers: jsonHeaders });
  }
});
