/**
 * Ingest Outreach Webhook — Unified webhook endpoint for buyer outreach events
 *
 * Receives POST requests from Smartlead, HeyReach, and PhoneBurner.
 * Normalizes events and writes to buyer_outreach_events table.
 *
 * Tool identification via ?source= query parameter:
 *   ?source=smartlead
 *   ?source=heyreach
 *   ?source=phoneburner
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

interface OutreachEvent {
  deal_id: string;
  buyer_id: string;
  channel: 'email' | 'linkedin' | 'phone';
  tool: 'smartlead' | 'heyreach' | 'phoneburner';
  event_type: string;
  event_timestamp: string;
  external_id?: string;
  notes?: string;
}

// Smartlead event normalization
function normalizeSmartleadEvent(payload: Record<string, unknown>): OutreachEvent | null {
  const eventType = payload.event_type as string || payload.event as string;
  const customFields = (payload.custom_fields || payload.lead?.custom_fields || {}) as Record<string, string>;
  const dealId = customFields.sourceco_deal_id;
  const buyerId = customFields.sourceco_buyer_id;

  if (!dealId || !buyerId) {
    console.warn('[ingest-webhook] Smartlead event missing sourceco IDs:', { eventType, customFields });
    return null;
  }

  let normalizedType: string | null = null;
  switch (eventType) {
    case 'email_opened':
      normalizedType = 'opened';
      break;
    case 'email_clicked':
      normalizedType = 'clicked';
      break;
    case 'email_replied':
      normalizedType = 'replied';
      break;
    case 'email_unsubscribed':
      normalizedType = 'unsubscribed';
      break;
    default:
      console.log('[ingest-webhook] Unknown Smartlead event:', eventType);
      return null;
  }

  return {
    deal_id: dealId,
    buyer_id: buyerId,
    channel: 'email',
    tool: 'smartlead',
    event_type: normalizedType,
    event_timestamp: (payload.timestamp as string) || new Date().toISOString(),
    external_id: (payload.lead_id as string) || (payload.id as string) || undefined,
  };
}

// HeyReach event normalization
function normalizeHeyReachEvent(payload: Record<string, unknown>): OutreachEvent | null {
  const eventType = payload.eventType as string || payload.event_type as string || payload.type as string;
  const customFields = (payload.customUserFields || payload.custom_fields || []) as Array<{ fieldName: string; fieldValue: string }>;

  const fieldMap = new Map(customFields.map(f => [f.fieldName, f.fieldValue]));
  const dealId = fieldMap.get('sourceco_deal_id') || (payload.sourceco_deal_id as string);
  const buyerId = fieldMap.get('sourceco_buyer_id') || (payload.sourceco_buyer_id as string);

  if (!dealId || !buyerId) {
    console.warn('[ingest-webhook] HeyReach event missing sourceco IDs:', { eventType });
    return null;
  }

  let normalizedType: string | null = null;
  switch (eventType) {
    case 'MESSAGE_SENT':
      normalizedType = 'launched';
      break;
    case 'MESSAGE_REPLIED':
      normalizedType = 'replied';
      break;
    case 'CONNECTION_ACCEPTED':
      // Log but no status change — still insert for tracking
      normalizedType = 'launched';
      break;
    case 'CAMPAIGN_COMPLETED':
      return null; // No event to record
    default:
      console.log('[ingest-webhook] Unknown HeyReach event:', eventType);
      return null;
  }

  return {
    deal_id: dealId,
    buyer_id: buyerId,
    channel: 'linkedin',
    tool: 'heyreach',
    event_type: normalizedType,
    event_timestamp: (payload.timestamp as string) || new Date().toISOString(),
    external_id: (payload.leadId as string) || (payload.id as string) || undefined,
    notes: eventType === 'CONNECTION_ACCEPTED' ? 'LinkedIn connection accepted' : undefined,
  };
}

// PhoneBurner event normalization
function normalizePhoneBurnerEvent(payload: Record<string, unknown>): OutreachEvent | null {
  const eventType = payload.event_type as string || payload.disposition as string || payload.type as string;
  const customFields = (payload.custom_fields || []) as Array<{ name: string; value: string }>;
  const cfMap = new Map(customFields.map(f => [f.name, f.value]));

  const dealId = cfMap.get('sourceco_deal_id') || (payload.sourceco_deal_id as string);
  const buyerId = cfMap.get('sourceco_buyer_id') || (payload.sourceco_buyer_id as string);

  if (!dealId || !buyerId) {
    console.warn('[ingest-webhook] PhoneBurner event missing sourceco IDs:', { eventType });
    return null;
  }

  let normalizedType: string | null = null;
  switch (eventType) {
    case 'call_answered':
    case 'ANSWERED':
      normalizedType = 'call_answered';
      break;
    case 'left_voicemail':
    case 'VOICEMAIL':
      normalizedType = 'call_voicemail';
      break;
    case 'no_answer':
    case 'NO_ANSWER':
      normalizedType = 'call_no_answer';
      break;
    default:
      console.log('[ingest-webhook] Unknown PhoneBurner event:', eventType);
      return null;
  }

  return {
    deal_id: dealId,
    buyer_id: buyerId,
    channel: 'phone',
    tool: 'phoneburner',
    event_type: normalizedType,
    event_timestamp: (payload.timestamp as string) || (payload.call_time as string) || new Date().toISOString(),
    external_id: (payload.contact_id as string) || (payload.id as string) || undefined,
  };
}

Deno.serve(async (req) => {
  // Webhooks don't need CORS — they come from tool servers, not browsers
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const url = new URL(req.url);
  const source = url.searchParams.get('source');

  if (!source || !['smartlead', 'heyreach', 'phoneburner'].includes(source)) {
    return new Response(JSON.stringify({ error: 'Invalid or missing source parameter' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Validate webhook signature
  const signingSecret = Deno.env.get(`${source.toUpperCase()}_WEBHOOK_SECRET`);
  if (signingSecret) {
    const signature = req.headers.get('x-webhook-signature') ||
      req.headers.get('x-signature') ||
      req.headers.get('authorization');

    if (!signature || signature !== signingSecret) {
      console.warn(`[ingest-webhook] Invalid signature for ${source}`);
      return new Response(JSON.stringify({ error: 'Invalid webhook signature' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    const payload = await req.json();

    let event: OutreachEvent | null = null;
    switch (source) {
      case 'smartlead':
        event = normalizeSmartleadEvent(payload);
        break;
      case 'heyreach':
        event = normalizeHeyReachEvent(payload);
        break;
      case 'phoneburner':
        event = normalizePhoneBurnerEvent(payload);
        break;
    }

    if (!event) {
      return new Response(JSON.stringify({ ok: true, message: 'Event skipped — not mappable' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { error } = await supabase
      .from('buyer_outreach_events')
      .insert(event);

    if (error) {
      console.error('[ingest-webhook] Insert error:', error);
      return new Response(JSON.stringify({ error: 'Failed to record event' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ ok: true, event_type: event.event_type }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[ingest-webhook] Unhandled error:', err);
    return new Response(JSON.stringify({
      error: err instanceof Error ? err.message : 'Internal error',
    }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});
