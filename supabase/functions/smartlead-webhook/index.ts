/**
 * Smartlead Webhook Receiver
 *
 * Receives webhook events from Smartlead (email replied, bounced,
 * unsubscribed, etc.) and logs them for processing.
 *
 * This endpoint does NOT require JWT auth — it uses a shared secret
 * (SMARTLEAD_WEBHOOK_SECRET) to verify incoming requests.
 *
 * Configure this URL in Smartlead campaign webhook settings:
 *   POST {SUPABASE_URL}/functions/v1/smartlead-webhook
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';
import { timingSafeEqual } from '../_shared/security.ts';

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

  // ─── Verify webhook secret (mandatory) ──────────────────────────────────
  const webhookSecret = Deno.env.get('SMARTLEAD_WEBHOOK_SECRET');
  if (!webhookSecret) {
    console.error('[smartlead-webhook] SMARTLEAD_WEBHOOK_SECRET is not set — rejecting request');
    return new Response(JSON.stringify({ error: 'Server misconfigured' }), {
      status: 500,
      headers: jsonHeaders,
    });
  }

  const providedSecret =
    req.headers.get('x-webhook-secret') || new URL(req.url).searchParams.get('secret');

  if (!providedSecret || !timingSafeEqual(providedSecret, webhookSecret)) {
    console.warn('[smartlead-webhook] Invalid webhook secret');
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: jsonHeaders,
    });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    const payload = await req.json();

    // Extract event details from Smartlead webhook payload
    const eventType = payload.event_type || payload.event || payload.type || 'unknown';

    const campaignId = payload.campaign_id || payload.sl_campaign_id || null;

    const leadEmail = payload.lead_email || payload.email || payload.to_email || null;

    // Log the webhook event
    const { error: insertError } = await supabase.from('smartlead_webhook_events').insert({
      smartlead_campaign_id: campaignId,
      event_type: eventType,
      lead_email: leadEmail,
      payload,
      processed: false,
    });

    if (insertError) {
      console.error('[smartlead-webhook] Insert error:', insertError);
      return new Response(JSON.stringify({ error: 'Failed to log event' }), {
        status: 500,
        headers: jsonHeaders,
      });
    }

    // ─── Process specific event types ──────────────────────────────────
    if (campaignId && leadEmail) {
      // Update local lead tracking based on event type
      const { data: localCampaign } = await supabase
        .from('smartlead_campaigns')
        .select('id')
        .eq('smartlead_campaign_id', campaignId)
        .single();

      if (localCampaign) {
        const updateFields: Record<string, unknown> = {
          last_activity_at: new Date().toISOString(),
        };

        // Map Smartlead event types to local categories
        switch (eventType) {
          case 'EMAIL_REPLIED':
          case 'REPLIED':
            updateFields.lead_category = 'replied';
            updateFields.lead_status = 'replied';
            break;
          case 'EMAIL_BOUNCED':
          case 'BOUNCED':
            updateFields.lead_category = 'bounced';
            updateFields.lead_status = 'bounced';
            break;
          case 'UNSUBSCRIBED':
            updateFields.lead_category = 'unsubscribed';
            updateFields.lead_status = 'unsubscribed';
            break;
          case 'EMAIL_OPENED':
          case 'OPENED':
            updateFields.lead_status = 'opened';
            break;
          case 'LINK_CLICKED':
          case 'CLICKED':
            updateFields.lead_status = 'clicked';
            break;
          case 'INTERESTED':
            updateFields.lead_category = 'interested';
            updateFields.lead_status = 'interested';
            break;
          case 'NOT_INTERESTED':
            updateFields.lead_category = 'not_interested';
            updateFields.lead_status = 'not_interested';
            break;
        }

        await supabase
          .from('smartlead_campaign_leads')
          .update(updateFields)
          .eq('campaign_id', localCampaign.id)
          .eq('email', leadEmail);
      }

      // Mark as processed
      // (The event was just inserted — update by matching the latest unprocessed
      // event for this campaign/email combo)
      await supabase
        .from('smartlead_webhook_events')
        .update({ processed: true, processed_at: new Date().toISOString() })
        .eq('smartlead_campaign_id', campaignId)
        .eq('lead_email', leadEmail)
        .eq('event_type', eventType)
        .eq('processed', false)
        .order('created_at', { ascending: false })
        .limit(1);
    }

    console.log(
      `[smartlead-webhook] Processed ${eventType} for campaign ${campaignId}, lead ${leadEmail}`,
    );

    return new Response(JSON.stringify({ success: true }), {
      headers: jsonHeaders,
    });
  } catch (err) {
    console.error('[smartlead-webhook] Error:', err);
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : 'Internal error',
      }),
      { status: 500, headers: jsonHeaders },
    );
  }
});
