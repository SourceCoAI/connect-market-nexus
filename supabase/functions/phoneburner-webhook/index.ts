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
 * Authentication: None — accepts all incoming POST requests without
 * signature or authentication to ensure the dialer can always post
 * call activity updates. Signature is still checked and logged for
 * auditing purposes when PHONEBURNER_WEBHOOK_SECRET is configured.
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
  const webhookSecret = Deno.env.get('PHONEBURNER_WEBHOOK_SECRET');
  const supabase: ReturnType<typeof createClient> = createClient(supabaseUrl, serviceRoleKey);

  const rawBody = await req.text();

  // ── simple secret header check ──
  const headerSecret =
    req.headers.get('x-webhook-secret') || req.headers.get('X-Webhook-Secret');
  let signatureValid = false;
  if (webhookSecret) {
    if (headerSecret === webhookSecret) {
      signatureValid = true;
      console.log('PhoneBurner webhook received, secret verified');
    } else {
      console.warn('PhoneBurner webhook secret mismatch — rejecting');
      return jsonResponse({ error: 'Invalid webhook secret' }, 401, corsHeaders);
    }
  } else {
    console.warn('PHONEBURNER_WEBHOOK_SECRET not configured — accepting without auth');
  }

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

  const headerEventId =
    req.headers.get('x-phoneburner-event-id') || req.headers.get('X-Phoneburner-Event-Id');
  const eventId =
    headerEventId ||
    (normalizedPayload.call_id ? `${normalizedPayload.call_id}-${eventType}` : null) ||
    (normalizedPayload.id as string) ||
    crypto.randomUUID();

  console.log(`PhoneBurner webhook received: ${eventType}, id: ${eventId}`);

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
  const _customData = (normalizedPayload.custom_data || {}) as Record<string, unknown>;
  const sourceco_contact_id = (customFields.sourceco_id ||
    customFields.sourceco_contact_id ||
    null) as string | null;

  // ── log the raw webhook ──
  const { data: logEntry, error: logError } = await supabase
    .from('phoneburner_webhooks_log')
    .insert({
      event_id: eventId,
      event_type: eventType,
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

  const contactId = (customFields.sourceco_id || customFields.sourceco_contact_id || null) as
    | string
    | null;
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

  // Contact notes
  const contactNotes = (contact.notes || '') as string;

  // Lead ID (listing reference) — PB stores as "listing-<uuid>"
  const rawLeadId = (contact.lead_id || payload.lead_id || null) as string | null;
  const leadId = rawLeadId;
  // Extract listing UUID from "listing-<uuid>" format
  const listingId = rawLeadId?.startsWith('listing-') ? rawLeadId.replace('listing-', '') : null;

  return {
    contactId,
    pbContactId,
    customFields,
    customData,
    userName,
    userEmail,
    entityType,
    pushedBy,
    sessionSource,
    contactEmail,
    contactNotes,
    leadId,
    listingId,
  };
}

async function processEvent(
  supabase: ReturnType<typeof createClient>,
  eventType: string,
  payload: Record<string, unknown>,
  topLevelTranscript: string | null,
  topLevelStatus: string | null,
): Promise<string | null> {
  const {
    contactId,
    pbContactId,
    userName,
    userEmail,
    contactEmail,
    contactNotes,
    leadId,
    listingId,
  } = extractContactInfo(payload);

  switch (eventType) {
    case 'call_begin':
    case 'call.started': {
      const { data } = await supabase
        .from('contact_activities')
        .insert({
          activity_type: 'call_attempt',
          source_system: 'phoneburner',
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
          contact_id: contactId,
          contact_email: contactEmail,
          user_name: userName,
          user_email: userEmail,
          phoneburner_lead_id: leadId,
          listing_id: listingId,
        })
        .select('id')
        .single();
      return data?.id || null;
    }

    case 'call_end':
    case 'call.ended':
    case 'disposition.set': {
      // --- Disposition ---
      // PB sends `status` at top level as the disposition label
      // Also check nested disposition object for structured data
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

      // Notes from various possible locations
      const callNotes = (payload.call_notes || []) as string[];
      const notes = (disposition.notes ||
        payload.notes ||
        (Array.isArray(callNotes) && callNotes.length > 0 ? callNotes.join('\n') : '') ||
        '') as string;

      // --- Duration ---
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

      // --- Recording ---
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

      // --- Timing ---
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

      // --- Connected flag ---
      const connected =
        payload.connected === 1 || payload.connected === true || payload.connected === '1';

      const { data } = await supabase
        .from('contact_activities')
        .insert({
          activity_type: 'call_completed',
          source_system: 'phoneburner',
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
          listing_id: listingId,
          contact_id: contactId,
          contact_email: contactEmail,
          user_name: userName,
          user_email: userEmail,
        })
        .select('id')
        .single();

      // Update last_contacted_date on the source contact record
      if (contactId) {
        const rawId = contactId.replace(/^(rm-|buyer-)/, '');
        await supabase
          .from('buyer_contacts')
          .update({ last_contacted_date: new Date().toISOString() })
          .eq('id', rawId);
      }

      // Look up disposition mapping and apply status updates
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
          if (contactId && (mapping.mark_do_not_call || mapping.mark_phone_invalid)) {
            const rawId = contactId.replace(/^(rm-|buyer-)/, '');
            const updates: Record<string, unknown> = {};
            if (mapping.mark_do_not_call) updates.do_not_contact = true;
            if (mapping.mark_phone_invalid) updates.phone_invalid = true;
            await supabase.from('buyer_contacts').update(updates).eq('id', rawId);
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
          activity_type: 'contact_displayed',
          source_system: 'phoneburner',
          phoneburner_contact_id: String(pbContactId),
          call_started_at: new Date().toISOString(),
          call_outcome: 'displayed',
          contact_id: contactId,
          contact_email: contactEmail,
          user_name: userName,
          user_email: userEmail,
          phoneburner_lead_id: leadId,
          listing_id: listingId,
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
          activity_type: 'callback_scheduled',
          source_system: 'phoneburner',
          phoneburner_contact_id: String(pbContactId),
          callback_scheduled_date: (callback.scheduled_for || payload.callback_date || null) as
            | string
            | null,
          disposition_notes: (callback.notes || payload.callback_notes || '') as string,
          contact_id: contactId,
          contact_email: contactEmail,
          user_name: userName,
          user_email: userEmail,
          phoneburner_lead_id: leadId,
          listing_id: listingId,
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
