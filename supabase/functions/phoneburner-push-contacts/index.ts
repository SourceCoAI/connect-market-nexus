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

type EntityType = 'contacts' | 'buyer_contacts' | 'buyers' | 'listings' | 'leads' | 'contact_list';

interface PushRequest {
  entity_type?: EntityType;
  entity_ids?: string[];
  contact_ids?: string[]; // Legacy — treated as buyer_contacts
  session_name?: string;
  skip_recent_days?: number;
  target_user_id?: string;
}

interface PbCustomField {
  name: string;
  type: number; // 1=text, 2=checkbox, 3=date, 6=dropdown, 7=numeric
  value: string;
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
  contact_id?: string | null;
  listing_id?: string | null;
  remarketing_buyer_id?: string | null;
  extra_context?: PbCustomField[];
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

interface ListingDealData {
  revenue?: number | null;
  ebitda?: number | null;
  executive_summary?: string | null;
  services?: string[] | null;
  geographic_states?: string[] | null;
  owner_goals?: string | null;
  special_requirements?: string | null;
  ownership_structure?: string | null;
}

const LISTING_DEAL_COLUMNS =
  'revenue, ebitda, executive_summary, services, geographic_states, owner_goals, special_requirements, ownership_structure';

function formatCurrency(value: number | null | undefined): string {
  if (value == null) return '';
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toLocaleString()}`;
}

function buildDealCustomFields(deal: ListingDealData): PbCustomField[] {
  const fields: PbCustomField[] = [];
  if (deal.revenue != null) {
    fields.push({ name: 'Revenue', type: 1, value: formatCurrency(deal.revenue) });
  }
  if (deal.ebitda != null) {
    fields.push({ name: 'EBITDA', type: 1, value: formatCurrency(deal.ebitda) });
  }
  if (deal.executive_summary) {
    fields.push({ name: 'Executive Summary', type: 1, value: deal.executive_summary });
  }
  if (deal.services?.length) {
    fields.push({ name: 'Services', type: 1, value: deal.services.join(', ') });
  }
  if (deal.geographic_states?.length) {
    fields.push({ name: 'Geographic Coverage', type: 1, value: deal.geographic_states.join(', ') });
  }
  if (deal.owner_goals) {
    fields.push({ name: 'Owner Goals', type: 1, value: deal.owner_goals });
  }
  if (deal.special_requirements) {
    fields.push({ name: 'Special Requirements', type: 1, value: deal.special_requirements });
  }
  if (deal.ownership_structure) {
    fields.push({ name: 'Ownership Structure', type: 1, value: deal.ownership_structure });
  }
  return fields;
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

// ─── Contact resolvers ───

async function resolveFromBuyerContacts(
  supabase: ReturnType<typeof createClient>,
  ids: string[],
): Promise<ResolvedContact[]> {
  // Read from unified contacts table instead of legacy buyer_contacts
  const { data: contacts } = await supabase
    .from('contacts')
    .select(
      'id, first_name, last_name, email, phone, title, remarketing_buyer_id, listing_id, updated_at',
    )
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

  // Fetch listing deal data for contacts that have a listing_id
  const listingIds = [
    ...new Set(contacts.map((c: { listing_id: string | null }) => c.listing_id).filter(Boolean)),
  ] as string[];
  let listingMap = new Map<string, ListingDealData>();
  if (listingIds.length) {
    const { data: listings } = await supabase
      .from('listings')
      .select(`id, ${LISTING_DEAL_COLUMNS}`)
      .in('id', listingIds);
    listingMap = new Map((listings || []).map((l: ListingDealData & { id: string }) => [l.id, l]));
  }

  return contacts.map(
    (c: {
      id: string;
      first_name: string | null;
      last_name: string | null;
      phone: string | null;
      email: string | null;
      title: string | null;
      remarketing_buyer_id: string | null;
      listing_id: string | null;
      updated_at: string | null;
    }) => {
      const buyer = c.remarketing_buyer_id ? buyerMap.get(c.remarketing_buyer_id) : null;
      const listing = c.listing_id ? listingMap.get(c.listing_id) : null;

      const customFields: PbCustomField[] = [
        { name: 'SourceCo ID', type: 1, value: c.id },
        { name: 'Buyer ID', type: 1, value: c.remarketing_buyer_id || '' },
        { name: 'Buyer Type', type: 1, value: buyer?.buyer_type || '' },
        { name: 'PE Firm', type: 1, value: buyer?.pe_firm_name || '' },
        {
          name: 'Target Services',
          type: 1,
          value: Array.isArray(buyer?.target_services) ? buyer.target_services.join(', ') : '',
        },
        {
          name: 'Target Geographies',
          type: 1,
          value: Array.isArray(buyer?.target_geographies)
            ? buyer.target_geographies.join(', ')
            : '',
        },
      ].filter((f) => f.value);

      // Add deal data fields if contact is linked to a listing
      if (listing) {
        customFields.push(...buildDealCustomFields(listing));
      }

      return {
        id: c.id,
        name: [c.first_name, c.last_name].filter(Boolean).join(' ') || 'Unknown',
        phone: c.phone,
        email: c.email,
        title: c.title,
        company: buyer?.company_name || null,
        source_entity: 'buyer_contact',
        last_contacted_date: c.updated_at,
        contact_id: c.id,
        listing_id: c.listing_id,
        remarketing_buyer_id: c.remarketing_buyer_id,
        extra_context: customFields,
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
      'id, first_name, last_name, email, phone, title, remarketing_buyer_id, listing_id, is_primary_at_firm, updated_at',
    )
    .in('remarketing_buyer_id', buyerIds)
    .eq('archived', false);

  const { data: buyers } = await supabase
    .from('buyers')
    .select(
      'id, company_name, pe_firm_name, buyer_type, contact_name, contact_email, contact_phone, target_services, target_geographies',
    )
    .in('id', buyerIds);
  const buyerMap = new Map<string, BuyerRow>((buyers || []).map((b: BuyerRow) => [b.id, b]));

  // Fetch listing deal data for contacts that have a listing_id
  const listingIds = [
    ...new Set(
      (allContacts || []).map((c: { listing_id: string | null }) => c.listing_id).filter(Boolean),
    ),
  ] as string[];
  let listingMap = new Map<string, ListingDealData>();
  if (listingIds.length) {
    const { data: listings } = await supabase
      .from('listings')
      .select(`id, ${LISTING_DEAL_COLUMNS}`)
      .in('id', listingIds);
    listingMap = new Map((listings || []).map((l: ListingDealData & { id: string }) => [l.id, l]));
  }

  const seen = new Set<string>();
  const result: ResolvedContact[] = [];
  const buyersWithContacts = new Set<string>();

  interface BuyerContactRow {
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    phone: string | null;
    title: string | null;
    remarketing_buyer_id: string | null;
    listing_id: string | null;
    is_primary_at_firm: boolean | null;
    updated_at: string | null;
  }

  const typedContacts = (allContacts || []) as BuyerContactRow[];

  for (const c of typedContacts.sort(
    (a, b) => (b.is_primary_at_firm ? 1 : 0) - (a.is_primary_at_firm ? 1 : 0),
  )) {
    const key = `${c.email?.toLowerCase() || ''}-${c.phone || ''}`;
    if (seen.has(key) && key !== '-') continue;
    seen.add(key);
    if (c.remarketing_buyer_id) buyersWithContacts.add(c.remarketing_buyer_id);
    const buyer = c.remarketing_buyer_id ? buyerMap.get(c.remarketing_buyer_id) : null;
    const listing = c.listing_id ? listingMap.get(c.listing_id) : null;

    const customFields: PbCustomField[] = [
      { name: 'SourceCo ID', type: 1, value: c.id },
      { name: 'Buyer Type', type: 1, value: buyer?.buyer_type || '' },
      { name: 'PE Firm', type: 1, value: buyer?.pe_firm_name || '' },
      {
        name: 'Target Services',
        type: 1,
        value: Array.isArray(buyer?.target_services) ? buyer.target_services.join(', ') : '',
      },
      {
        name: 'Target Geographies',
        type: 1,
        value: Array.isArray(buyer?.target_geographies) ? buyer.target_geographies.join(', ') : '',
      },
    ].filter((f) => f.value);

    if (listing) {
      customFields.push(...buildDealCustomFields(listing));
    }

    result.push({
      id: c.id,
      name: [c.first_name, c.last_name].filter(Boolean).join(' ') || 'Unknown',
      phone: c.phone,
      email: c.email,
      title: c.title,
      company: buyer?.company_name || null,
      source_entity: 'buyer_contact',
      last_contacted_date: c.updated_at,
      contact_id: c.id,
      listing_id: c.listing_id,
      remarketing_buyer_id: c.remarketing_buyer_id,
      extra_context: customFields,
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
      phone: buyer.contact_phone || null,
      email: buyer.contact_email || null,
      title: null,
      company: buyer.company_name || buyer.pe_firm_name || null,
      source_entity: 'remarketing_buyer_direct',
      last_contacted_date: null,
      contact_id: null,
      listing_id: null,
      remarketing_buyer_id: buyerId,
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
      `id, title, internal_company_name, main_contact_name, main_contact_email, main_contact_phone, main_contact_title, deal_source, ${LISTING_DEAL_COLUMNS}`,
    )
    .in('id', listingIds);

  if (!listings?.length) return [];

  return listings
    .filter((l: { main_contact_name?: string }) => l.main_contact_name)
    .map(
      (
        l: {
          id: string;
          title?: string;
          internal_company_name?: string;
          main_contact_name?: string;
          main_contact_email?: string;
          main_contact_phone?: string;
          main_contact_title?: string;
          deal_source?: string;
        } & ListingDealData,
      ) => {
        const customFields: PbCustomField[] = [
          { name: 'SourceCo ID', type: 1, value: `listing-${l.id}` },
          { name: 'Listing ID', type: 1, value: l.id },
          { name: 'Deal Source', type: 1, value: l.deal_source || '' },
          { name: 'Company Name', type: 1, value: l.internal_company_name || l.title || '' },
        ].filter((f) => f.value);

        customFields.push(...buildDealCustomFields(l));

        return {
          id: `listing-${l.id}`,
          name: l.main_contact_name!,
          phone: l.main_contact_phone || null,
          email: l.main_contact_email || null,
          title: l.main_contact_title || null,
          company: l.internal_company_name || l.title || null,
          source_entity: `listing:${l.deal_source || 'unknown'}`,
          last_contacted_date: null,
          contact_id: null,
          listing_id: l.id,
          remarketing_buyer_id: null,
          extra_context: customFields,
        };
      },
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
      phone: l.phone_number || null,
      email: l.email || null,
      title: l.role || null,
      company: l.company_name || null,
      source_entity: 'inbound_lead',
      last_contacted_date: null,
      contact_id: null,
      listing_id: null,
      remarketing_buyer_id: null,
    }),
  );
}

async function resolveFromContactListMembers(
  supabase: ReturnType<typeof createClient>,
  memberIds: string[],
): Promise<ResolvedContact[]> {
  const { data: members } = await supabase
    .from('contact_list_members')
    .select(
      'id, contact_name, contact_email, contact_phone, contact_company, contact_role, entity_type, entity_id',
    )
    .in('id', memberIds)
    .is('removed_at', null);

  if (!members?.length) return [];

  // Collect listing IDs from deal-type members for deal data enrichment
  const LISTING_ENTITY_TYPES = ['sourceco_deal', 'gp_partner_deal', 'referral_deal', 'listing'];
  const listingIds = [
    ...new Set(
      members
        .filter((m: { entity_type: string }) => LISTING_ENTITY_TYPES.includes(m.entity_type))
        .map((m: { entity_id: string }) => m.entity_id)
        .filter(Boolean),
    ),
  ] as string[];

  let listingMap = new Map<string, ListingDealData>();
  if (listingIds.length) {
    const { data: listings } = await supabase
      .from('listings')
      .select(`id, ${LISTING_DEAL_COLUMNS}`)
      .in('id', listingIds);
    listingMap = new Map((listings || []).map((l: ListingDealData & { id: string }) => [l.id, l]));
  }

  return members.map(
    (m: {
      id: string;
      contact_name: string | null;
      contact_email: string;
      contact_phone: string | null;
      contact_company: string | null;
      contact_role: string | null;
      entity_type: string;
      entity_id: string;
    }) => {
      const listing = LISTING_ENTITY_TYPES.includes(m.entity_type)
        ? listingMap.get(m.entity_id)
        : null;

      const customFields: PbCustomField[] = [
        { name: 'SourceCo ID', type: 1, value: m.id },
        { name: 'Company', type: 1, value: m.contact_company || '' },
      ].filter((f) => f.value);

      if (listing) {
        customFields.push(...buildDealCustomFields(listing));
      }

      return {
        id: m.id,
        name: m.contact_name || 'Unknown',
        phone: m.contact_phone,
        email: m.contact_email,
        title: m.contact_role,
        company: m.contact_company,
        source_entity: `contact_list:${m.entity_type}`,
        last_contacted_date: null,
        contact_id: null,
        listing_id: LISTING_ENTITY_TYPES.includes(m.entity_type) ? m.entity_id : null,
        remarketing_buyer_id: null,
        extra_context: customFields,
      };
    },
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
  const requestId = crypto.randomUUID();

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
    case 'contact_list':
      contacts = await resolveFromContactListMembers(supabase, entityIds);
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

  const sessionContacts = eligible.map((contact) => {
    const primaryPhone = normalizePhone(contact.phone);
    return {
      source_id: contact.id,
      source_entity: contact.source_entity,
      name: contact.name,
      phone: primaryPhone,
      // Store all known phones to improve webhook matching when PhoneBurner
      // returns a different primary phone than the one we pushed.
      phones: primaryPhone ? [primaryPhone] : [],
      contact_email: contact.email?.toLowerCase() || null,
      contact_id: contact.contact_id || null,
      listing_id: contact.listing_id || null,
      remarketing_buyer_id: contact.remarketing_buyer_id || null,
    };
  });

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

    const requestField: PbCustomField = { name: 'Request ID', type: 1, value: requestId };
    const customFields = [...(contact.extra_context || []), requestField];

    if (customFields.length > 0) {
      pbContact.custom_fields = customFields;
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
        request_id: requestId,
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
  const phoneburnerSessionId =
    pbData?.dialsessions?.id || pbData?.dialsessions?.session_id || pbData?.dialsession?.id || null;

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
    phoneburner_session_id: phoneburnerSessionId ? String(phoneburnerSessionId) : null,
    request_id: requestId,
    session_name: sessionLabel,
    session_type:
      entityType === 'contacts' || entityType === 'buyer_contacts' || entityType === 'buyers'
        ? 'buyer_outreach'
        : entityType,
    total_contacts_added: eligible.length,
    session_status: 'active',
    created_by_user_id: user.id,
    started_at: new Date().toISOString(),
    session_contacts: sessionContacts,
    source_entity_type: entityType,
    source_entity_ids: entityIds,
  });

  return new Response(
    JSON.stringify({
      success: true,
      request_id: requestId,
      redirect_url: redirectUrl,
      contacts_added: eligible.length,
      contacts_excluded: excluded.length,
      exclusions: excluded,
    }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
});
