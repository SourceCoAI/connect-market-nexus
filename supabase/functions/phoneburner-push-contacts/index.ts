/**
 * PhoneBurner Push Contacts — Creates a dial session via PhoneBurner API
 *
 * Uses manually-provided access tokens stored in phoneburner_oauth_tokens.
 *
 * Uses POST /rest/1/dialsession which accepts contacts inline and returns
 * a redirect_url (one-time SSO link) to open the dialer immediately.
 *
 * Accepts entity_type + entity_ids to resolve contacts from any source:
 * - buyer_contacts: direct contact IDs (original flow)
 * - buyers: resolve via remarketing_buyer_contacts + buyer_contacts
 * - listings: resolve main_contact_* fields from listings table
 * - leads: resolve from inbound_leads table
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';

const PB_API_BASE = 'https://www.phoneburner.com/rest/1';

type EntityType = 'contacts' | 'buyer_contacts' | 'buyers' | 'listings' | 'leads';

interface PushRequest {
  entity_type?: EntityType;
  entity_ids?: string[];
  contact_ids?: string[]; // Legacy — treated as buyer_contacts
  session_name?: string;
  skip_recent_days?: number;
  target_user_id?: string;
}

interface ResolvedContact {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  title: string | null;
  company: string | null;
  source_entity: string;
  last_contacted_date: string | null;
  extra_context?: Record<string, string>;
}

interface BuyerRow {
  id: string;
  company_name?: string;
  pe_firm_name?: string;
  buyer_type?: string;
  contact_name?: string;
  contact_email?: string;
  contact_phone?: string;
  target_services?: string[];
  target_geographies?: string[];
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

// ─── Contact resolvers ───

async function resolveFromBuyerContacts(
  supabase: ReturnType<typeof createClient>,
  ids: string[],
): Promise<ResolvedContact[]> {
  // Read from unified contacts table instead of legacy buyer_contacts
  const { data: contacts } = await supabase
    .from('contacts')
    .select('id, first_name, last_name, email, phone, title, remarketing_buyer_id, updated_at')
    .in('id', ids)
    .eq('archived', false);

  if (!contacts?.length) return [];

  const buyerIds = [
    ...new Set(
      contacts
        .map((c: { remarketing_buyer_id: string | null }) => c.remarketing_buyer_id)
        .filter(Boolean),
    ),
  ];
  const { data: buyers } = await supabase
    .from('buyers')
    .select('id, company_name, pe_firm_name, buyer_type, target_services, target_geographies')
    .in('id', buyerIds);
  const buyerMap = new Map<string, BuyerRow>((buyers || []).map((b: BuyerRow) => [b.id, b]));

  return contacts.map(
    (c: {
      id: string;
      first_name: string | null;
      last_name: string | null;
      phone: string | null;
      email: string | null;
      title: string | null;
      remarketing_buyer_id: string | null;
      updated_at: string | null;
    }) => {
      const buyer = c.remarketing_buyer_id ? buyerMap.get(c.remarketing_buyer_id) : null;
      return {
        id: c.id,
        name: [c.first_name, c.last_name].filter(Boolean).join(' ') || 'Unknown',
        phone: c.phone,
        email: c.email,
        title: c.title,
        company: buyer?.company_name || null,
        source_entity: 'buyer_contact',
        last_contacted_date: c.updated_at,
        extra_context: {
          sourceco_id: c.id,
          sourceco_buyer_id: c.remarketing_buyer_id || '',
          buyer_type: buyer?.buyer_type || '',
          pe_firm: buyer?.pe_firm_name || '',
          target_services: Array.isArray(buyer?.target_services)
            ? buyer.target_services.join(', ')
            : '',
          target_geographies: Array.isArray(buyer?.target_geographies)
            ? buyer.target_geographies.join(', ')
            : '',
        },
      };
    },
  );
}

async function resolveFromBuyers(
  supabase: ReturnType<typeof createClient>,
  buyerIds: string[],
): Promise<ResolvedContact[]> {
  // Read from unified contacts table (consolidates both buyer_contacts and remarketing_buyer_contacts)
  const { data: allContacts } = await supabase
    .from('contacts')
    .select(
      'id, first_name, last_name, email, phone, title, remarketing_buyer_id, is_primary_at_firm, updated_at',
    )
    .in('remarketing_buyer_id', buyerIds)
    .eq('archived', false);

  const { data: buyers } = await supabase
    .from('buyers')
    .select(
      'id, company_name, pe_firm_name, buyer_type, contact_name, contact_email, contact_phone',
    )
    .in('id', buyerIds);
  const buyerMap = new Map<string, BuyerRow>((buyers || []).map((b: BuyerRow) => [b.id, b]));

  const seen = new Set<string>();
  const result: ResolvedContact[] = [];
  const buyersWithContacts = new Set<string>();

  for (const c of (allContacts || []).sort(
    (a: { is_primary_at_firm?: boolean }, b: { is_primary_at_firm?: boolean }) =>
      (b.is_primary_at_firm ? 1 : 0) - (a.is_primary_at_firm ? 1 : 0),
  )) {
    const key = `${c.email?.toLowerCase() || ''}-${c.phone || ''}`;
    if (seen.has(key) && key !== '-') continue;
    seen.add(key);
    if (c.remarketing_buyer_id) buyersWithContacts.add(c.remarketing_buyer_id);
    const buyer = c.remarketing_buyer_id ? buyerMap.get(c.remarketing_buyer_id) : null;
    result.push({
      id: c.id,
      name: [c.first_name, c.last_name].filter(Boolean).join(' ') || 'Unknown',
      phone: c.phone,
      email: c.email,
      title: c.title,
      company: buyer?.company_name || null,
      source_entity: 'buyer_contact',
      last_contacted_date: c.updated_at,
    });
  }

  for (const buyerId of buyerIds) {
    if (buyersWithContacts.has(buyerId)) continue;
    const buyer = buyerMap.get(buyerId);
    if (!buyer?.contact_name) continue;
    const key = `${buyer.contact_email?.toLowerCase() || ''}-${buyer.contact_phone || ''}`;
    if (seen.has(key) && key !== '-') continue;
    seen.add(key);
    result.push({
      id: `buyer-${buyerId}`,
      name: buyer.contact_name,
      phone: buyer.contact_phone,
      email: buyer.contact_email,
      title: null,
      company: buyer.company_name || buyer.pe_firm_name || null,
      source_entity: 'remarketing_buyer_direct',
      last_contacted_date: null,
    });
  }

  return result;
}

async function resolveFromListings(
  supabase: ReturnType<typeof createClient>,
  listingIds: string[],
): Promise<ResolvedContact[]> {
  const { data: listings } = await supabase
    .from('listings')
    .select(
      'id, title, internal_company_name, main_contact_name, main_contact_email, main_contact_phone, main_contact_title, deal_source',
    )
    .in('id', listingIds);

  if (!listings?.length) return [];

  return listings
    .filter((l: { main_contact_name?: string }) => l.main_contact_name)
    .map(
      (l: {
        id: string;
        title?: string;
        internal_company_name?: string;
        main_contact_name?: string;
        main_contact_email?: string;
        main_contact_phone?: string;
        main_contact_title?: string;
        deal_source?: string;
      }) => ({
        id: `listing-${l.id}`,
        name: l.main_contact_name!,
        phone: l.main_contact_phone,
        email: l.main_contact_email,
        title: l.main_contact_title,
        company: l.internal_company_name || l.title || null,
        source_entity: `listing:${l.deal_source || 'unknown'}`,
        last_contacted_date: null,
        extra_context: {
          sourceco_id: `listing-${l.id}`,
          sourceco_listing_id: l.id,
          deal_source: l.deal_source || 'unknown',
          company_name: l.internal_company_name || l.title || '',
        },
      }),
    );
}

async function resolveFromLeads(
  supabase: ReturnType<typeof createClient>,
  leadIds: string[],
): Promise<ResolvedContact[]> {
  const { data: leads } = await supabase
    .from('inbound_leads')
    .select('id, name, email, phone_number, company_name, role')
    .in('id', leadIds);

  if (!leads?.length) return [];

  return leads.map(
    (l: {
      id: string;
      name?: string;
      email?: string;
      phone_number?: string;
      company_name?: string;
      role?: string;
    }) => ({
      id: `lead-${l.id}`,
      name: l.name || l.email || 'Unknown',
      phone: l.phone_number,
      email: l.email,
      title: l.role,
      company: l.company_name,
      source_entity: 'inbound_lead',
      last_contacted_date: null,
    }),
  );
}

// ─── Main handler ───

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return corsPreflightResponse(req);
  const corsHeaders = getCorsHeaders(req);

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
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
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { data: isAdmin } = await supabase.rpc('is_admin', { user_id: user.id });
  if (!isAdmin) {
    return new Response(JSON.stringify({ error: 'Admin access required' }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const body: PushRequest = await req.json();
  const { session_name, skip_recent_days = 7 } = body;

  const pbTokenUserId = body.target_user_id || user.id;
  const pbToken = await getValidToken(supabase, pbTokenUserId);
  if (!pbToken) {
    const targetLabel = body.target_user_id
      ? 'The selected user does not have a PhoneBurner account connected.'
      : 'PhoneBurner not connected. Please add your access token in Settings.';
    return new Response(JSON.stringify({ error: targetLabel, code: 'PB_NOT_CONNECTED' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const entityType: EntityType = body.entity_type || 'buyer_contacts';
  const entityIds = body.entity_ids || body.contact_ids || [];

  if (!entityIds.length) {
    return new Response(JSON.stringify({ error: 'No entities provided' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let contacts: ResolvedContact[];
  switch (entityType) {
    case 'contacts':
    case 'buyer_contacts':
      contacts = await resolveFromBuyerContacts(supabase, entityIds);
      break;
    case 'buyers':
      contacts = await resolveFromBuyers(supabase, entityIds);
      break;
    case 'listings':
      contacts = await resolveFromListings(supabase, entityIds);
      break;
    case 'leads':
      contacts = await resolveFromLeads(supabase, entityIds);
      break;
    default:
      return new Response(JSON.stringify({ error: `Unknown entity_type: ${entityType}` }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
  }

  if (!contacts.length) {
    return new Response(JSON.stringify({ error: 'No contacts found for the given entities' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Filter: skip recently contacted + no phone
  const skipCutoff = new Date(Date.now() - skip_recent_days * 24 * 60 * 60 * 1000);
  const eligible: ResolvedContact[] = [];
  const excluded: { name: string; reason: string }[] = [];

  for (const contact of contacts) {
    if (!contact.phone) {
      excluded.push({ name: contact.name, reason: 'No phone number' });
      continue;
    }
    if (contact.last_contacted_date && new Date(contact.last_contacted_date) > skipCutoff) {
      excluded.push({ name: contact.name, reason: `Contacted within ${skip_recent_days} days` });
      continue;
    }
    eligible.push(contact);
  }

  if (eligible.length === 0) {
    return new Response(
      JSON.stringify({
        success: false,
        contacts_added: 0,
        contacts_excluded: excluded.length,
        exclusions: excluded,
        error: 'All contacts were excluded (no phone number or recently contacted)',
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  // Build contacts array for PhoneBurner dial session
  const pbContacts = eligible.map((contact) => {
    const nameParts = contact.name.split(' ');
    const pbContact: Record<string, unknown> = {
      first_name: nameParts[0] || '',
      last_name: nameParts.slice(1).join(' ') || '',
      phone: contact.phone,
      email: contact.email || '',
      company: contact.company || '',
      title: contact.title || '',
      lead_id: contact.id, // Maps back to our system
    };

    // Add custom fields if available
    if (contact.extra_context) {
      pbContact.custom_fields = contact.extra_context;
    }

    return pbContact;
  });

  // Build webhook callback URL for call events
  const webhookUrl = `${supabaseUrl}/functions/v1/phoneburner-webhook`;

  // Create dial session — returns redirect_url to open dialer immediately
  const pbRes = await fetch(`${PB_API_BASE}/dialsession`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${pbToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contacts: pbContacts,
      callbacks: [
        { callback_type: 'api_callbegin', callback: webhookUrl },
        { callback_type: 'api_calldone', callback: webhookUrl },
        { callback_type: 'api_contact_displayed', callback: webhookUrl },
      ],
      custom_data: {
        source: 'sourceco',
        session_name: session_name || '',
        entity_type: entityType,
        pushed_by: user.id,
      },
    }),
  });

  if (!pbRes.ok) {
    const errBody = await pbRes.text();
    console.error('PhoneBurner dialsession error:', errBody);
    return new Response(
      JSON.stringify({ error: `PhoneBurner API error: ${errBody.slice(0, 200)}` }),
      { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  const pbData = await pbRes.json();
  const redirectUrl = pbData?.dialsessions?.redirect_url || null;

  // Look up display name for the target PB user
  let targetDisplayName: string | null = null;
  if (body.target_user_id) {
    const { data: tokenRow } = await supabase
      .from('phoneburner_oauth_tokens')
      .select('display_name')
      .eq('user_id', body.target_user_id)
      .single();
    targetDisplayName = tokenRow?.display_name || null;
  }

  const sessionLabel = targetDisplayName
    ? `${session_name || 'Push'} → ${targetDisplayName}`
    : session_name || `Push - ${new Date().toLocaleDateString()}`;

  await supabase.from('phoneburner_sessions').insert({
    session_name: sessionLabel,
    session_type:
      entityType === 'contacts' || entityType === 'buyer_contacts' || entityType === 'buyers'
        ? 'buyer_outreach'
        : entityType,
    total_contacts_added: eligible.length,
    session_status: 'active',
    created_by_user_id: user.id,
    started_at: new Date().toISOString(),
  });

  return new Response(
    JSON.stringify({
      success: true,
      redirect_url: redirectUrl,
      contacts_added: eligible.length,
      contacts_excluded: excluded.length,
      exclusions: excluded,
    }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
});
