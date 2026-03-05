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

  const rawBody = await req.text();
  const signatureValid = true; // no auth required — always accepted

  console.log('PhoneBurner webhook received (no auth required)');

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
  return !!value &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
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

function extractPhoneNumber(contact: Record<string, unknown>, payload: Record<string, unknown>): string | null {
  const phones = Array.isArray(contact.phones) ? (contact.phones as Array<Record<string, unknown>>) : [];
  const firstPhone = phones.find((entry) => entry?.number)?.number as string | undefined;
  return normalizePhone(
    (contact.phone as string) ||
      firstPhone ||
      (payload.phone as string) ||
      (payload.phone_number as string) ||
      null,
  );
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
  const customFields = (contact.custom_fields || payload.custom_fields || {}) as Record<string, unknown>;
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
      console.warn(`[phoneburner-webhook] Failed to resolve request_id ${requestId}: ${error.message}`);
    }
    return { phoneburnerSessionId: null, matched: null };
  }

  const sessionContacts = Array.isArray(session.session_contacts)
    ? (session.session_contacts as SessionContactLink[])
    : [];

  if (sessionContacts.length === 0) {
    return { phoneburnerSessionId: session.id, matched: null };
  }

  const ranked = sessionContacts
    .map((entry) => ({ entry, score: scoreSessionContactMatch(entry, context) }))
    .sort((a, b) => b.score - a.score);

  if (ranked[0] && ranked[0].score > 0) {
    return { phoneburnerSessionId: session.id, matched: ranked[0].entry };
  }

  if (sessionContacts.length === 1) {
    return { phoneburnerSessionId: session.id, matched: sessionContacts[0] };
  }

  return { phoneburnerSessionId: session.id, matched: null };
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
    leadId,
    listingId,
    remarketingBuyerId,
  } = extractContactInfo(payload);

  const requestMapping = await resolveRequestMapping(supabase, requestId, {
    sourceId: leadId,
    contactId,
    listingId,
    buyerId: remarketingBuyerId,
    phone: contactPhone,
    email: contactEmail,
    name: contactName,
  });

  const resolvedContactId = contactId || requestMapping.matched?.contact_id || null;
  const resolvedListingId = listingId || requestMapping.matched?.listing_id || null;
  const resolvedBuyerId = remarketingBuyerId || requestMapping.matched?.remarketing_buyer_id || null;
  const resolvedContactEmail = contactEmail || requestMapping.matched?.contact_email || null;
  const resolvedSessionId = requestMapping.phoneburnerSessionId;

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
