/**
 * PhoneBurner Webhook Receiver
 *
 * Receives real-time call events from PhoneBurner and logs them into
 * the `phoneburner_webhooks_log` and `contact_activities` tables.
 *
 * Supported events:
 *   - call_begin / call.started   (dial started)
 *   - call_end / call.ended / disposition.set  (call completed + dispositioned)
 *   - contact_displayed (contact loaded in dialer)
 *   - callback.scheduled
 *   - email.unsubscribed
 *   - sms.opt_out
 *
 * ┌─────────────────────────────────────────────────────────────────┐
 * │ AUTHENTICATION: NONE                                           │
 * │                                                                │
 * │ This endpoint accepts ALL incoming POST requests without any   │
 * │ secret, signature, or authentication header. This is BY DESIGN │
 * │ to ensure PhoneBurner (and intermediaries like n8n) can always  │
 * │ post call activity updates without configuration friction.     │
 * │                                                                │
 * │ DO NOT add secret/signature checks here. If you need to gate   │
 * │ access, use IP allowlisting at the network layer instead.      │
 * └─────────────────────────────────────────────────────────────────┘
 *
 * IMPORTANT: The push function stores `sourceco_id` in custom_fields.
 * We read both `sourceco_id` and `sourceco_contact_id` for backwards-compat.
 *
 * NOTE: PhoneBurner wraps the main payload under a `body` key, with
 * top-level `Transcript` and `status` fields alongside it.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';

function jsonResponse(
  body: Record<string, unknown>,
  status: number,
  corsHeaders: Record<string, string>,
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * Normalize payload: PhoneBurner sometimes wraps everything under `body`
 * with top-level `Transcript` and `status`. We flatten for consistent access.
 */
function normalizePayload(raw: Record<string, unknown>): {
  data: Record<string, unknown>;
  transcript: string | null;
  pbStatus: string | null;
} {
  const body = (raw.body || {}) as Record<string, unknown>;
  const hasBody = Object.keys(body).length > 0;
  const data = hasBody ? body : raw;
  const transcript =
    ((raw.Transcript || raw.transcript || data.Transcript || data.transcript || '') as string) ||
    null;
  const pbStatus = ((raw.status || data.status || '') as string) || null;
  return { data, transcript, pbStatus };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsPreflightResponse(req);
  const corsHeaders = getCorsHeaders(req);

  const rawIp = req.headers.get('x-forwarded-for') || req.headers.get('cf-connecting-ip') || null;
  const clientIp = rawIp ? rawIp.split(',')[0].trim() : null;

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405, corsHeaders);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  // NO secret/signature check — see file header for rationale.
  // DO NOT re-add authentication here.
  const supabase: ReturnType<typeof createClient> = createClient(supabaseUrl, serviceRoleKey);

  // Log all incoming request details for debugging auth-related rejections
  const authHeader = req.headers.get('authorization') || req.headers.get('Authorization');
  const apiKeyHeader = req.headers.get('x-api-key') || req.headers.get('X-Api-Key');
  const contentType = req.headers.get('content-type') || '';
  console.log(
    `[phoneburner-webhook] Incoming POST from ${clientIp || 'unknown'} | ` +
      `Content-Type: ${contentType} | ` +
      `Auth header: ${authHeader ? 'present' : 'none'} | ` +
      `API key header: ${apiKeyHeader ? 'present' : 'none'}`,
  );

  let rawBody: string;
  try {
    rawBody = await req.text();
  } catch (bodyErr) {
    console.error('[phoneburner-webhook] Failed to read request body:', bodyErr);
    return jsonResponse({ error: 'Failed to read request body' }, 400, corsHeaders);
  }

  const signatureValid = true; // no auth required — always accepted

  console.log(`[phoneburner-webhook] Received (no auth required), body length: ${rawBody.length}`);

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400, corsHeaders);
  }

  const headerEventType =
    req.headers.get('x-phoneburner-event-type') || req.headers.get('X-Phoneburner-Event-Type');

  // Normalize: extract from body wrapper
  const {
    data: normalizedPayload,
    transcript: topLevelTranscript,
    pbStatus: topLevelStatus,
  } = normalizePayload(payload);

  const eventType = headerEventType || detectEventType(normalizedPayload);
  const requestId = extractRequestId(normalizedPayload);

  const headerEventId =
    req.headers.get('x-phoneburner-event-id') || req.headers.get('X-Phoneburner-Event-Id');
  const eventId =
    headerEventId ||
    (normalizedPayload.call_id ? `${normalizedPayload.call_id}-${eventType}` : null) ||
    (normalizedPayload.id as string) ||
    crypto.randomUUID();

  console.log(
    `PhoneBurner webhook received: ${eventType}, id: ${eventId}, request_id: ${requestId || 'none'}`,
  );

  // ── idempotency ──
  const { data: existing } = await supabase
    .from('phoneburner_webhooks_log')
    .select('id')
    .eq('event_id', eventId)
    .maybeSingle();

  if (existing) {
    return jsonResponse({ ok: true, message: 'duplicate' }, 200, corsHeaders);
  }

  // Extract contact info for logging
  const contact = (normalizedPayload.contact || {}) as Record<string, unknown>;
  const customFields = (contact.custom_fields || normalizedPayload.custom_fields || {}) as Record<
    string,
    unknown
  >;
  const sourcecoContactIdValue = readFlexibleField(
    customFields,
    normalizedPayload.typed_custom_fields || contact.typed_custom_fields,
    ['sourceco_id', 'sourceco_contact_id', 'SourceCo ID'],
  );
  const sourceco_contact_id =
    sourcecoContactIdValue && isUuid(sourcecoContactIdValue) ? sourcecoContactIdValue : null;

  // ── log the raw webhook ──
  const { data: logEntry, error: logError } = await supabase
    .from('phoneburner_webhooks_log')
    .insert({
      event_id: eventId,
      event_type: eventType,
      request_id: requestId,
      payload,
      processing_status: 'processing',
      phoneburner_call_id: (normalizedPayload.call_id || null) as string | null,
      phoneburner_contact_id: (contact.id || normalizedPayload.contact_id || null) as string | null,
      sourceco_contact_id,
      phoneburner_user_id: ((normalizedPayload.user as Record<string, unknown>)?.id ||
        (normalizedPayload.agent as Record<string, unknown>)?.user_id ||
        normalizedPayload.user_id ||
        null) as string | null,
      signature_valid: signatureValid,
      ip_address: clientIp,
      received_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (logError) {
    console.error('Failed to log webhook:', logError);
    return jsonResponse({ error: 'Logging failed' }, 500, corsHeaders);
  }

  // ── process the event ──
  try {
    const activityId = await processEvent(
      supabase,
      eventType,
      normalizedPayload,
      topLevelTranscript,
      topLevelStatus,
      requestId,
    );
    await supabase
      .from('phoneburner_webhooks_log')
      .update({
        processing_status: 'success',
        processing_completed_at: new Date().toISOString(),
        contact_activity_id: activityId,
      })
      .eq('id', logEntry.id);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Error processing ${eventType}:`, message);
    await supabase
      .from('phoneburner_webhooks_log')
      .update({
        processing_status: 'failed',
        processing_error: message,
        processing_completed_at: new Date().toISOString(),
      })
      .eq('id', logEntry.id);
  }

  return jsonResponse({ ok: true }, 200, corsHeaders);
});

function detectEventType(payload: Record<string, unknown>): string {
  if (payload.event) return String(payload.event);
  if (payload.type) return String(payload.type);
  // If status or disposition fields present → call_end
  if (payload.status || payload.disposition || payload.disposition_id) return 'call_end';
  if (payload.call_id && !payload.disposition) return 'call_begin';
  if (payload.contact_id && !payload.call_id) return 'contact_displayed';
  return 'unknown';
}

type TypedCustomField = { name?: string; value?: unknown };
type SessionContactLink = {
  source_id?: string | null;
  source_entity?: string | null;
  name?: string | null;
  phone?: string | null;
  contact_email?: string | null;
  contact_id?: string | null;
  listing_id?: string | null;
  remarketing_buyer_id?: string | null;
};

function isUuid(value: string | null | undefined): value is string {
  return (
    !!value &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
}

function normalizeKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function normalizePhone(value: string | null | undefined): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, '');
  if (!digits) return null;
  return digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
}

function readFlexibleField(
  fields: Record<string, unknown>,
  typedFieldsRaw: unknown,
  candidateKeys: string[],
): string | null {
  const normalizedCandidates = new Set(candidateKeys.map(normalizeKey));

  for (const [key, value] of Object.entries(fields || {})) {
    if (!normalizedCandidates.has(normalizeKey(key))) continue;
    if (value == null || value === '') continue;
    return String(value).trim();
  }

  const typedFields = Array.isArray(typedFieldsRaw) ? (typedFieldsRaw as TypedCustomField[]) : [];
  for (const field of typedFields) {
    const fieldName = field?.name ? normalizeKey(field.name) : '';
    if (!fieldName || !normalizedCandidates.has(fieldName)) continue;
    if (field.value == null || field.value === '') continue;
    return String(field.value).trim();
  }

  return null;
}

function extractPhoneNumber(
  contact: Record<string, unknown>,
  payload: Record<string, unknown>,
): string | null {
  const phones = Array.isArray(contact.phones)
    ? (contact.phones as Array<Record<string, unknown>>)
    : [];
  const firstPhone = phones.find((entry) => entry?.number)?.number as string | undefined;
  // Try multiple locations — n8n intermediary may restructure the payload
  return normalizePhone(
    (contact.phone as string) ||
      (contact.phone_number as string) ||
      firstPhone ||
      (payload.phone as string) ||
      (payload.phone_number as string) ||
      (payload.called_number as string) ||
      (payload.dialed_number as string) ||
      null,
  );
}

/**
 * Extract ALL phone numbers from the webhook contact — used for multi-phone matching.
 * PhoneBurner contacts often have multiple phones (Work, Mobile, etc.) and the primary
 * phone returned in webhooks may differ from the one we stored at push time.
 */
function extractAllPhoneNumbers(
  contact: Record<string, unknown>,
  payload: Record<string, unknown>,
): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  const addPhone = (raw: string | null | undefined) => {
    const normalized = normalizePhone(raw as string);
    if (normalized && !seen.has(normalized)) {
      seen.add(normalized);
      result.push(normalized);
    }
  };

  // Primary phone first
  addPhone(contact.phone as string);
  addPhone(contact.phone_number as string);

  // All phones from the phones array
  const phones = Array.isArray(contact.phones)
    ? (contact.phones as Array<Record<string, unknown>>)
    : [];
  for (const entry of phones) {
    if (entry?.number) addPhone(entry.number as string);
  }

  // Payload-level phone fields (n8n intermediary may restructure)
  addPhone(payload.phone as string);
  addPhone(payload.phone_number as string);
  addPhone(payload.called_number as string);
  addPhone(payload.dialed_number as string);

  return result;
}

function buildContactName(contact: Record<string, unknown>): string | null {
  const firstName = (contact.first_name || '') as string;
  const lastName = (contact.last_name || '') as string;
  const fullName = `${firstName} ${lastName}`.trim();
  return fullName || (contact.name as string) || null;
}

function extractRequestId(payload: Record<string, unknown>): string | null {
  const contact = (payload.contact || {}) as Record<string, unknown>;
  const customData = (payload.custom_data || {}) as Record<string, unknown>;
  const customFields = (contact.custom_fields || payload.custom_fields || {}) as Record<
    string,
    unknown
  >;
  const typedCustomFields = payload.typed_custom_fields || contact.typed_custom_fields;

  const requestId =
    (payload.request_id as string) ||
    (customData.request_id as string) ||
    readFlexibleField(customFields, typedCustomFields, ['request_id', 'Request ID']);

  return requestId?.trim() || null;
}

function scoreSessionContactMatch(
  sessionContact: SessionContactLink,
  context: {
    sourceId: string | null;
    contactId: string | null;
    listingId: string | null;
    buyerId: string | null;
    phone: string | null;
    email: string | null;
    name: string | null;
  },
): number {
  let score = 0;

  if (context.sourceId && sessionContact.source_id === context.sourceId) score += 100;
  if (context.contactId && sessionContact.contact_id === context.contactId) score += 90;
  if (context.listingId && sessionContact.listing_id === context.listingId) score += 80;
  if (context.buyerId && sessionContact.remarketing_buyer_id === context.buyerId) score += 70;
  if (context.phone && normalizePhone(sessionContact.phone) === context.phone) score += 40;
  if (
    context.email &&
    sessionContact.contact_email &&
    sessionContact.contact_email.toLowerCase() === context.email.toLowerCase()
  ) {
    score += 30;
  }
  if (
    context.name &&
    sessionContact.name &&
    sessionContact.name.trim().toLowerCase() === context.name.trim().toLowerCase()
  ) {
    score += 10;
  }

  return score;
}

async function resolveRequestMapping(
  supabase: ReturnType<typeof createClient>,
  requestId: string | null,
  context: {
    sourceId: string | null;
    contactId: string | null;
    listingId: string | null;
    buyerId: string | null;
    phone: string | null;
    allPhones: string[];
    email: string | null;
    name: string | null;
  },
): Promise<{ phoneburnerSessionId: string | null; matched: SessionContactLink | null }> {
  if (!requestId) return { phoneburnerSessionId: null, matched: null };

  const { data: session, error } = await supabase
    .from('phoneburner_sessions')
    .select('id, session_contacts')
    .eq('request_id', requestId)
    .maybeSingle();

  if (error || !session) {
    if (error) {
      console.warn(
        `[phoneburner-webhook] Failed to resolve request_id ${requestId}: ${error.message}`,
      );
    }
    return { phoneburnerSessionId: null, matched: null };
  }

  const sessionContacts = Array.isArray(session.session_contacts)
    ? (session.session_contacts as SessionContactLink[])
    : [];

  if (sessionContacts.length === 0) {
    return { phoneburnerSessionId: session.id, matched: null };
  }

  // ── PHONE-FIRST matching (multi-phone) ──
  // PhoneBurner webhooks don't return per-contact custom_fields, so phone
  // number is our most reliable signal to identify which contact was called.
  // PhoneBurner contacts often have multiple phones (Work, Mobile, etc.) and
  // the primary phone may differ from what we stored at push time. We try ALL
  // phone numbers from the webhook against each session contact.
  const webhookPhones =
    context.allPhones.length > 0 ? context.allPhones : context.phone ? [context.phone] : [];

  for (const wp of webhookPhones) {
    // Build set of all phones for each session contact (stored phone + phones array)
    const phoneMatch = sessionContacts.find((sc) => {
      const scPhones: string[] = [];
      const scNormalized = normalizePhone(sc.phone);
      if (scNormalized) scPhones.push(scNormalized);
      // Also check phones array if stored at push time
      if (Array.isArray((sc as Record<string, unknown>).phones)) {
        for (const p of (sc as Record<string, unknown>).phones as string[]) {
          const n = normalizePhone(p);
          if (n && !scPhones.includes(n)) scPhones.push(n);
        }
      }
      return scPhones.includes(wp);
    });
    if (phoneMatch) {
      console.log(
        `[phoneburner-webhook] Matched session contact by phone: ${wp} → contact_id=${phoneMatch.contact_id}, listing_id=${phoneMatch.listing_id}`,
      );
      return { phoneburnerSessionId: session.id, matched: phoneMatch };
    }
  }

  // Try last-10-digit fuzzy match across all webhook phones
  for (const wp of webhookPhones) {
    const last10 = wp.slice(-10);
    if (last10.length === 10) {
      const fuzzyMatch = sessionContacts.find(
        (sc) => normalizePhone(sc.phone)?.slice(-10) === last10,
      );
      if (fuzzyMatch) {
        console.log(
          `[phoneburner-webhook] Matched session contact by last-10 digits: ${wp} → contact_id=${fuzzyMatch.contact_id}, listing_id=${fuzzyMatch.listing_id}`,
        );
        return { phoneburnerSessionId: session.id, matched: fuzzyMatch };
      }
    }
  }

  // ── EMAIL matching (secondary) ──
  if (context.email) {
    const emailMatch = sessionContacts.find(
      (sc) => sc.contact_email && sc.contact_email.toLowerCase() === context.email!.toLowerCase(),
    );
    if (emailMatch) {
      console.log(
        `[phoneburner-webhook] Matched session contact by email: ${context.email} → contact_id=${emailMatch.contact_id}, listing_id=${emailMatch.listing_id}`,
      );
      return { phoneburnerSessionId: session.id, matched: emailMatch };
    }
  }

  // ── NAME matching (tertiary, only if unique) ──
  if (context.name) {
    const nameMatches = sessionContacts.filter(
      (sc) => sc.name && sc.name.trim().toLowerCase() === context.name!.trim().toLowerCase(),
    );
    if (nameMatches.length === 1) {
      console.log(
        `[phoneburner-webhook] Matched session contact by unique name: ${context.name} → contact_id=${nameMatches[0].contact_id}, listing_id=${nameMatches[0].listing_id}`,
      );
      return { phoneburnerSessionId: session.id, matched: nameMatches[0] };
    }
  }

  // ── Score-based matching (legacy fallback for any remaining custom_field data) ──
  const ranked = sessionContacts
    .map((entry) => ({ entry, score: scoreSessionContactMatch(entry, context) }))
    .sort((a, b) => b.score - a.score);

  if (ranked[0] && ranked[0].score > 0) {
    return { phoneburnerSessionId: session.id, matched: ranked[0].entry };
  }

  // Single-contact session: safe to assume it's the only one
  if (sessionContacts.length === 1) {
    return { phoneburnerSessionId: session.id, matched: sessionContacts[0] };
  }

  console.warn(
    `[phoneburner-webhook] Could not match contact in session ${requestId} (${sessionContacts.length} contacts). Phone: ${context.phone}, Email: ${context.email}, Name: ${context.name}`,
  );
  return { phoneburnerSessionId: session.id, matched: null };
}

/**
 * NEW: Multi-source waterfall matching against contact_list_members and listings.
 * Runs BEFORE the broad phone RPC to get more accurate matches.
 *
 * Priority:
 *   1. Email → contact_list_members.contact_email → entity_id (listing)
 *   2. Email → listings.main_contact_email → listing id
 *   3. Phone → contact_list_members.contact_phone → entity_id (listing)
 *   4. Phone → listings.main_contact_phone → listing id
 */
async function resolveWaterfallMapping(
  supabase: ReturnType<typeof createClient>,
  context: {
    phone: string | null;
    allPhones: string[];
    email: string | null;
    name: string | null;
  },
): Promise<SessionContactLink | null> {
  // Step 1: Email match against contact_list_members
  if (context.email) {
    const { data: clm } = await supabase
      .from('contact_list_members')
      .select('entity_id, contact_name, contact_email, contact_phone')
      .eq('contact_email', context.email.toLowerCase())
      .is('removed_at', null)
      .limit(1)
      .maybeSingle();

    if (clm?.entity_id) {
      console.log(
        `[phoneburner-webhook] Waterfall: email match in contact_list_members → listing=${clm.entity_id}`,
      );
      return {
        listing_id: clm.entity_id,
        contact_email: clm.contact_email,
        name: clm.contact_name,
        phone: clm.contact_phone,
        contact_id: null,
        remarketing_buyer_id: null,
        source_entity: 'waterfall:clm_email',
      };
    }
  }

  // Step 2: Email match against listings.main_contact_email
  if (context.email) {
    const { data: listing } = await supabase
      .from('listings')
      .select('id, main_contact_email, main_contact_phone, main_contact_name')
      .eq('main_contact_email', context.email.toLowerCase())
      .limit(1)
      .maybeSingle();

    if (listing?.id) {
      console.log(
        `[phoneburner-webhook] Waterfall: email match in listings → listing=${listing.id}`,
      );
      return {
        listing_id: listing.id,
        contact_email: listing.main_contact_email,
        name: listing.main_contact_name,
        phone: listing.main_contact_phone,
        contact_id: null,
        remarketing_buyer_id: null,
        source_entity: 'waterfall:listing_email',
      };
    }
  }

  // Step 3: Phone match against contact_list_members
  const phonesToTry =
    context.allPhones.length > 0 ? context.allPhones : context.phone ? [context.phone] : [];

  for (const phone of phonesToTry) {
    const { data: clm } = await supabase
      .from('contact_list_members')
      .select('entity_id, contact_name, contact_email, contact_phone')
      .eq('contact_phone', phone)
      .is('removed_at', null)
      .limit(1)
      .maybeSingle();

    if (clm?.entity_id) {
      console.log(
        `[phoneburner-webhook] Waterfall: phone match in contact_list_members → listing=${clm.entity_id}`,
      );
      return {
        listing_id: clm.entity_id,
        contact_email: clm.contact_email,
        name: clm.contact_name,
        phone: clm.contact_phone,
        contact_id: null,
        remarketing_buyer_id: null,
        source_entity: 'waterfall:clm_phone',
      };
    }
  }

  // Step 4: Phone match against listings.main_contact_phone
  for (const phone of phonesToTry) {
    const { data: listing } = await supabase
      .from('listings')
      .select('id, main_contact_email, main_contact_phone, main_contact_name')
      .eq('main_contact_phone', phone)
      .limit(1)
      .maybeSingle();

    if (listing?.id) {
      console.log(
        `[phoneburner-webhook] Waterfall: phone match in listings → listing=${listing.id}`,
      );
      return {
        listing_id: listing.id,
        contact_email: listing.main_contact_email,
        name: listing.main_contact_name,
        phone: listing.main_contact_phone,
        contact_id: null,
        remarketing_buyer_id: null,
        source_entity: 'waterfall:listing_phone',
      };
    }
  }

  return null;
}

async function resolvePhoneMapping(
  supabase: ReturnType<typeof createClient>,
  context: {
    phone: string | null;
    allPhones: string[];
    email: string | null;
    name: string | null;
  },
): Promise<SessionContactLink | null> {
  // Try ALL phone numbers until we get a match (primary first, then alternates)
  const phonesToTry =
    context.allPhones.length > 0 ? context.allPhones : context.phone ? [context.phone] : [];

  if (phonesToTry.length === 0) return null;

  for (const phone of phonesToTry) {
    const { data, error } = await supabase.rpc('resolve_phone_activity_link_by_phone', {
      p_phone: phone,
      p_name: context.name,
      p_email: context.email,
    });

    if (error) {
      console.warn(
        `[phoneburner-webhook] Failed phone-based resolution for ${phone}: ${error.message}`,
      );
      continue;
    }

    const match = Array.isArray(data) ? data[0] : data;
    if (!match) continue;

    console.log(
      `[phoneburner-webhook] Phone DB match on ${phone}: contact_id=${match.contact_id}, listing_id=${match.listing_id}`,
    );

    return {
      contact_id: match.contact_id ?? null,
      listing_id: match.listing_id ?? null,
      remarketing_buyer_id: match.remarketing_buyer_id ?? null,
      contact_email: match.contact_email ?? null,
      source_entity: match.match_source ?? 'phone',
      phone,
      name: context.name,
    };
  }

  return null;
}

/**
 * Extract contact info + custom_fields from the (normalized) webhook payload.
 */
function extractContactInfo(payload: Record<string, unknown>) {
  const contact = (payload.contact || {}) as Record<string, unknown>;
  const customFields = (contact.custom_fields || payload.custom_fields || {}) as Record<
    string,
    unknown
  >;
  const customData = (payload.custom_data || {}) as Record<string, unknown>;
  const typedCustomFields = payload.typed_custom_fields || contact.typed_custom_fields;

  const sourcecoValue = readFlexibleField(customFields, typedCustomFields, [
    'sourceco_id',
    'sourceco_contact_id',
    'SourceCo ID',
  ]);
  const rawListingId = readFlexibleField(customFields, typedCustomFields, [
    'listing_id',
    'Listing ID',
  ]);
  const rawBuyerId = readFlexibleField(customFields, typedCustomFields, ['buyer_id', 'Buyer ID']);

  let contactId: string | null = null;
  let listingId: string | null = isUuid(rawListingId) ? rawListingId : null;

  if (sourcecoValue?.startsWith('listing-')) {
    const derivedListingId = sourcecoValue.replace('listing-', '');
    listingId = isUuid(derivedListingId) ? derivedListingId : listingId;
  } else if (isUuid(sourcecoValue)) {
    contactId = sourcecoValue;
  }

  const rawLeadId = (contact.lead_id || payload.lead_id || null) as string | null;
  if (rawLeadId?.startsWith('listing-')) {
    const derivedListingId = rawLeadId.replace('listing-', '');
    listingId = isUuid(derivedListingId) ? derivedListingId : listingId;
  } else if (rawLeadId && isUuid(rawLeadId)) {
    if ((customData.entity_type as string | undefined) === 'listings') {
      listingId = rawLeadId;
    } else if (!contactId) {
      contactId = rawLeadId;
    }
  }

  const pbContactId = (contact.id || contact.user_id || payload.contact_id || '') as string;

  // User/rep info — can be in `agent` or `owner` or `user` depending on event type
  const agent = (payload.agent || {}) as Record<string, unknown>;
  const owner = (payload.owner || {}) as Record<string, unknown>;
  const user = (payload.user || {}) as Record<string, unknown>;

  const userName = (
    agent.first_name
      ? `${agent.first_name} ${agent.last_name || ''}`.trim()
      : owner.first_name
        ? `${owner.first_name} ${owner.last_name || ''}`.trim()
        : user.name || payload.user_name || null
  ) as string | null;
  const userEmail = (agent.email || owner.email || user.email || payload.user_email || null) as
    | string
    | null;

  const entityType = (customData.entity_type || null) as string | null;
  const pushedBy = (customData.pushed_by || null) as string | null;
  const sessionSource = (customData.source || null) as string | null;

  // Contact email from the contact record
  const contactEmails = (contact.emails || []) as string[];
  const contactEmail = (contact.primary_email || contactEmails[0] || null) as string | null;
  const contactPhone = extractPhoneNumber(contact, payload);
  const contactName = buildContactName(contact);

  // Contact notes
  const contactNotes = (contact.notes || '') as string;

  // All phone numbers for multi-phone matching
  const allPhones = extractAllPhoneNumbers(contact, payload);

  return {
    contactId,
    pbContactId,
    userName,
    userEmail,
    entityType,
    pushedBy,
    sessionSource,
    contactEmail,
    contactPhone,
    contactName,
    contactNotes,
    allPhones,
    leadId: rawLeadId,
    listingId,
    remarketingBuyerId: isUuid(rawBuyerId) ? rawBuyerId : null,
  };
}

async function processEvent(
  supabase: ReturnType<typeof createClient>,
  eventType: string,
  payload: Record<string, unknown>,
  topLevelTranscript: string | null,
  topLevelStatus: string | null,
  requestId: string | null,
): Promise<string | null> {
  const {
    contactId,
    pbContactId,
    userName,
    userEmail,
    contactEmail,
    contactPhone,
    contactName,
    contactNotes,
    allPhones,
    leadId,
    listingId,
    remarketingBuyerId,
  } = extractContactInfo(payload);

  // ── Step 1: Match within session by phone (most reliable) ──
  // PhoneBurner webhooks don't return per-contact custom_fields, so phone
  // number is our primary signal. We try ALL phone numbers from the webhook
  // contact (Work, Mobile, etc.) since the primary may differ from push time.
  const requestMapping = await resolveRequestMapping(supabase, requestId, {
    sourceId: leadId,
    contactId,
    listingId,
    buyerId: remarketingBuyerId,
    phone: contactPhone,
    allPhones,
    email: contactEmail,
    name: contactName,
  });

  // ── Step 2: Waterfall matching (email/phone against contact_list_members + listings) ──
  const waterfallMapping = !requestMapping.matched
    ? await resolveWaterfallMapping(supabase, {
        phone: contactPhone,
        allPhones,
        email: contactEmail,
        name: contactName,
      })
    : null;

  // ── Step 3: DB phone RPC lookup (last resort — broadest, least accurate) ──
  const phoneMapping = !requestMapping.matched && !waterfallMapping
    ? await resolvePhoneMapping(supabase, {
        phone: contactPhone,
        allPhones,
        email: contactEmail,
        name: contactName,
      })
    : null;

  // ── Resolution priority: session match > waterfall > DB phone match > custom_fields ──
  const resolvedContactId =
    requestMapping.matched?.contact_id || waterfallMapping?.contact_id || phoneMapping?.contact_id || contactId || null;
  const resolvedListingId =
    requestMapping.matched?.listing_id || waterfallMapping?.listing_id || phoneMapping?.listing_id || listingId || null;
  const resolvedBuyerId =
    requestMapping.matched?.remarketing_buyer_id ||
    waterfallMapping?.remarketing_buyer_id ||
    phoneMapping?.remarketing_buyer_id ||
    remarketingBuyerId ||
    null;
  const resolvedContactEmail =
    requestMapping.matched?.contact_email || waterfallMapping?.contact_email || phoneMapping?.contact_email || contactEmail || null;
  const resolvedSessionId = requestMapping.phoneburnerSessionId;
  const matchSource = requestMapping.matched ? 'session' : waterfallMapping ? (waterfallMapping.source_entity || 'waterfall') : phoneMapping ? 'phone_rpc' : 'custom_fields';

  console.log(
    `[phoneburner-webhook] Resolution for phones=[${allPhones.join(',')}]: ` +
      `match_source=${matchSource}, session_match=${!!requestMapping.matched}, waterfall=${!!waterfallMapping}, phone_rpc=${!!phoneMapping}, ` +
      `contact_id=${resolvedContactId}, listing_id=${resolvedListingId}, buyer_id=${resolvedBuyerId}`,
  );

  switch (eventType) {
    case 'call_begin':
    case 'call.started': {
      const { data } = await supabase
        .from('contact_activities')
        .insert({
          request_id: requestId,
          activity_type: 'call_attempt',
          source_system: 'phoneburner',
          phoneburner_session_id: resolvedSessionId,
          phoneburner_call_id: String(payload.call_id || ''),
          phoneburner_contact_id: String(pbContactId),
          phoneburner_event_id: (payload.id || payload.event_id || null) as string | null,
          call_started_at:
            (payload.start_time as string) ||
            (payload.started_at as string) ||
            (payload.timestamp as string) ||
            new Date().toISOString(),
          call_outcome: 'dialing',
          call_direction: (payload.direction || 'outbound') as string,
          contact_id: resolvedContactId,
          remarketing_buyer_id: resolvedBuyerId,
          contact_email: resolvedContactEmail,
          user_name: userName,
          user_email: userEmail,
          phoneburner_lead_id: leadId,
          listing_id: resolvedListingId,
        })
        .select('id')
        .single();
      return data?.id || null;
    }

    case 'call_end':
    case 'call.ended':
    case 'disposition.set': {
      // --- Disposition ---
      const disposition = (payload.disposition || {}) as Record<string, unknown>;
      const dispositionCode = (disposition.code ||
        payload.disposition_id ||
        payload.disposition_code ||
        topLevelStatus ||
        '') as string;
      const dispositionLabel = (disposition.label ||
        payload.disposition_name ||
        payload.disposition_label ||
        (payload.status as string) ||
        topLevelStatus ||
        '') as string;

      const callNotes = (payload.call_notes || []) as string[];
      const notes = (disposition.notes ||
        payload.notes ||
        (Array.isArray(callNotes) && callNotes.length > 0 ? callNotes.join('\n') : '') ||
        '') as string;

      const callSummary = (payload.call_summary || {}) as Record<string, unknown>;
      const duration = Number(
        callSummary.total_duration_seconds ||
          payload.duration ||
          payload.call_duration ||
          payload.total_duration_seconds ||
          0,
      );
      const talkTime = (callSummary.talk_duration_seconds ||
        payload.talk_time ||
        payload.talk_duration_seconds ||
        null) as number | null;

      const recording = (payload.recording || {}) as Record<string, unknown>;
      const recordingUrl = (recording.url ||
        payload.recording_url ||
        payload.recording_link ||
        '') as string;
      const recordingUrlPublic = (recording.public_url ||
        payload.recording_url_public ||
        payload.recording_link_public ||
        '') as string;
      const recordingDuration = (recording.duration_seconds ||
        payload.recording_duration ||
        null) as number | null;

      const callStartedAt =
        ((payload.start_time ||
          payload.call_started_at ||
          callSummary.started_at ||
          payload.started_at ||
          payload.timestamp) as string) || new Date().toISOString();
      const callEndedAt =
        ((payload.end_time ||
          callSummary.ended_at ||
          payload.ended_at ||
          payload.timestamp) as string) || new Date().toISOString();

      const connected =
        payload.connected === 1 || payload.connected === true || payload.connected === '1';

      const { data } = await supabase
        .from('contact_activities')
        .insert({
          request_id: requestId,
          activity_type: 'call_completed',
          source_system: 'phoneburner',
          phoneburner_session_id: resolvedSessionId,
          phoneburner_call_id: String(payload.call_id || ''),
          phoneburner_contact_id: String(pbContactId),
          phoneburner_event_id: (payload.id || payload.event_id || null) as string | null,
          call_started_at: callStartedAt,
          call_ended_at: callEndedAt,
          call_duration_seconds: duration,
          talk_time_seconds: talkTime,
          call_outcome: dispositionCode ? 'dispositioned' : 'completed',
          call_connected: connected,
          call_direction: (payload.direction || 'outbound') as string,
          disposition_code: dispositionCode || null,
          disposition_label: dispositionLabel || null,
          disposition_notes: notes || null,
          recording_url: recordingUrl || null,
          recording_url_public: recordingUrlPublic || null,
          recording_duration_seconds: recordingDuration,
          call_transcript: topLevelTranscript || null,
          phoneburner_status: topLevelStatus || null,
          contact_notes: contactNotes || null,
          phoneburner_lead_id: leadId,
          listing_id: resolvedListingId,
          contact_id: resolvedContactId,
          remarketing_buyer_id: resolvedBuyerId,
          contact_email: resolvedContactEmail,
          user_name: userName,
          user_email: userEmail,
        })
        .select('id')
        .single();

      if (resolvedContactId) {
        await supabase
          .from('contacts')
          .update({ updated_at: new Date().toISOString() })
          .eq('id', resolvedContactId);
      }

      if (dispositionCode) {
        const { data: mapping } = await supabase
          .from('disposition_mappings')
          .select('*')
          .eq('phoneburner_disposition_code', dispositionCode)
          .maybeSingle();
        if (mapping) {
          console.log(
            `Disposition mapped: ${dispositionCode} → ${mapping.sourceco_contact_status} / ${mapping.sourceco_contact_stage}`,
          );
          if (resolvedContactId && (mapping.mark_do_not_call || mapping.mark_phone_invalid)) {
            const updates: Record<string, unknown> = {};
            if (mapping.mark_do_not_call) updates.do_not_contact = true;
            if (mapping.mark_phone_invalid) updates.phone_invalid = true;
            await supabase.from('contacts').update(updates).eq('id', resolvedContactId);
          }
        }
      }

      // ── Save transcript to deal_transcripts for unified processing ──
      const pbCallId = String(payload.call_id || '');
      if (topLevelTranscript && topLevelTranscript.trim().length > 0 && resolvedListingId) {
        await savePhoneBurnerTranscript(supabase, {
          listingId: resolvedListingId,
          phoneburnerCallId: pbCallId,
          transcriptText: topLevelTranscript,
          contactActivityId: data?.id || null,
          recordingUrl: recordingUrlPublic || recordingUrl || null,
          callDate: callStartedAt,
          durationMinutes: duration ? Math.round(duration / 60) : null,
          contactName,
          userName,
          dispositionLabel: dispositionLabel || null,
        });
      } else if (topLevelTranscript && topLevelTranscript.trim().length > 0 && !resolvedListingId) {
        console.log(
          `[phoneburner-webhook] Transcript available (${topLevelTranscript.length} chars) but no listing_id resolved for call ${pbCallId}. Saving to contact_activities only.`,
        );
      }

      return data?.id || null;
    }

    case 'contact_displayed':
    case 'contact.displayed': {
      const { data } = await supabase
        .from('contact_activities')
        .insert({
          request_id: requestId,
          activity_type: 'contact_displayed',
          source_system: 'phoneburner',
          phoneburner_session_id: resolvedSessionId,
          phoneburner_contact_id: String(pbContactId),
          call_started_at: new Date().toISOString(),
          call_outcome: 'displayed',
          contact_id: resolvedContactId,
          remarketing_buyer_id: resolvedBuyerId,
          contact_email: resolvedContactEmail,
          user_name: userName,
          user_email: userEmail,
          phoneburner_lead_id: leadId,
          listing_id: resolvedListingId,
        })
        .select('id')
        .single();
      return data?.id || null;
    }

    case 'callback.scheduled': {
      const callback = (payload.callback || {}) as Record<string, unknown>;
      const { data } = await supabase
        .from('contact_activities')
        .insert({
          request_id: requestId,
          activity_type: 'callback_scheduled',
          source_system: 'phoneburner',
          phoneburner_session_id: resolvedSessionId,
          phoneburner_contact_id: String(pbContactId),
          callback_scheduled_date: (callback.scheduled_for || payload.callback_date || null) as
            | string
            | null,
          disposition_notes: (callback.notes || payload.callback_notes || '') as string,
          contact_id: resolvedContactId,
          remarketing_buyer_id: resolvedBuyerId,
          contact_email: resolvedContactEmail,
          user_name: userName,
          user_email: userEmail,
          phoneburner_lead_id: leadId,
          listing_id: resolvedListingId,
        })
        .select('id')
        .single();
      return data?.id || null;
    }

    default:
      console.log(`Unhandled PhoneBurner event type: ${eventType}`);
      return null;
  }
}

/**
 * Save a PhoneBurner transcript into the unified deal_transcripts table.
 * Idempotent: skips if a transcript with the same phoneburner_call_id already exists.
 */
async function savePhoneBurnerTranscript(
  supabase: ReturnType<typeof createClient>,
  opts: {
    listingId: string;
    phoneburnerCallId: string;
    transcriptText: string;
    contactActivityId: string | null;
    recordingUrl: string | null;
    callDate: string;
    durationMinutes: number | null;
    contactName: string | null;
    userName: string | null;
    dispositionLabel: string | null;
  },
): Promise<void> {
  // Idempotency: check if transcript already saved for this call
  const { data: existing } = await supabase
    .from('deal_transcripts')
    .select('id')
    .eq('phoneburner_call_id', opts.phoneburnerCallId)
    .maybeSingle();

  if (existing) {
    console.log(
      `[phoneburner-webhook] Transcript for call ${opts.phoneburnerCallId} already exists (${existing.id}), skipping.`,
    );
    return;
  }

  const title = [
    'PhoneBurner Call',
    opts.contactName ? `with ${opts.contactName}` : null,
    opts.dispositionLabel ? `(${opts.dispositionLabel})` : null,
  ]
    .filter(Boolean)
    .join(' ');

  const { error } = await supabase.from('deal_transcripts').insert({
    listing_id: opts.listingId,
    transcript_text: opts.transcriptText,
    source: 'phoneburner',
    title,
    call_date: opts.callDate,
    duration_minutes: opts.durationMinutes,
    phoneburner_call_id: opts.phoneburnerCallId,
    contact_activity_id: opts.contactActivityId,
    recording_url: opts.recordingUrl,
    has_content: true,
    auto_linked: true,
  });

  if (error) {
    console.error(
      `[phoneburner-webhook] Failed to save transcript to deal_transcripts for call ${opts.phoneburnerCallId}:`,
      error,
    );
  } else {
    console.log(
      `[phoneburner-webhook] Saved PhoneBurner transcript (${opts.transcriptText.length} chars) to deal_transcripts for listing ${opts.listingId}`,
    );

    // Trigger enrichment processing (non-blocking)
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
      if (supabaseAnonKey) {
        fetch(`${supabaseUrl}/functions/v1/enrich-deal`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${supabaseAnonKey}`,
          },
          body: JSON.stringify({ dealId: opts.listingId }),
        }).catch((err) => {
          console.warn(`[phoneburner-webhook] Non-blocking enrich-deal call failed:`, err);
        });
      }
    } catch (enrichErr) {
      console.warn('[phoneburner-webhook] Failed to trigger enrichment:', enrichErr);
    }

    // Trigger call quality scoring (non-blocking)
    try {
      const scoreUrl = Deno.env.get('SUPABASE_URL')!;
      const scoreKey = Deno.env.get('SUPABASE_ANON_KEY');
      if (scoreKey) {
        fetch(`${scoreUrl}/functions/v1/score-call-transcript`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${scoreKey}`,
          },
          body: JSON.stringify({
            contact_activity_id: opts.contactActivityId,
            transcript_text: opts.transcriptText,
            rep_name: opts.userName,
            listing_id: opts.listingId,
            call_duration_seconds: opts.durationMinutes ? opts.durationMinutes * 60 : null,
          }),
        }).catch((err) => {
          console.warn(`[phoneburner-webhook] Non-blocking score-call-transcript call failed:`, err);
        });
      }
    } catch (scoreErr) {
      console.warn('[phoneburner-webhook] Failed to trigger call scoring:', scoreErr);
    }
  }
}
