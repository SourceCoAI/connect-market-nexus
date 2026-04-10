/**
 * Clay Webhook — LinkedIn Results Receiver
 *
 * Receives enriched contact data back from Clay after its waterfall enrichment.
 * Clay sends results to this endpoint after processing a LinkedIn URL lookup.
 * Correlation is done via request_id (echoed back by Clay).
 *
 * Idempotency: duplicate request_id callbacks are safely ignored.
 *
 * POST /clay-webhook-linkedin
 * Body: { request_id, email, ... } (flexible — user configures Clay output)
 */

import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.10';
import { timingSafeEqual } from '../_shared/security.ts';

serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  try {
    // 0. Verify webhook secret
    const webhookSecret = Deno.env.get('CLAY_WEBHOOK_SECRET');
    if (webhookSecret) {
      const providedSecret =
        req.headers.get('x-webhook-secret') || new URL(req.url).searchParams.get('secret');
      if (!providedSecret || !timingSafeEqual(providedSecret, webhookSecret)) {
        console.warn('[clay-webhook-linkedin] Invalid webhook secret');
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
      }
    }

    // 1. Parse payload
    let payload: Record<string, unknown>;
    try {
      payload = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
    }

    // 2. Extract request_id — required for correlation
    const requestId = payload.request_id as string;
    if (!requestId || typeof requestId !== 'string') {
      console.error('[clay-webhook-linkedin] Missing request_id in payload');
      return new Response(JSON.stringify({ error: 'request_id is required' }), { status: 400 });
    }

    console.log(`[clay-webhook-linkedin] Received callback for request_id: ${requestId}`);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // 3. Look up the tracking row
    const { data: request, error: lookupErr } = await supabase
      .from('clay_enrichment_requests')
      .select('*')
      .eq('request_id', requestId)
      .maybeSingle();

    if (lookupErr) {
      console.error(`[clay-webhook-linkedin] DB lookup error: ${lookupErr.message}`);
      return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500 });
    }

    if (!request) {
      console.warn(`[clay-webhook-linkedin] No matching request found for: ${requestId}`);
      return new Response(JSON.stringify({ success: true, note: 'No matching request' }), {
        status: 200,
      });
    }

    // 4. Idempotency — skip if already completed
    if (request.status === 'completed') {
      console.log(`[clay-webhook-linkedin] Duplicate callback skipped for: ${requestId}`);
      return new Response(JSON.stringify({ success: true, note: 'Duplicate callback' }), {
        status: 200,
      });
    }

    // 5. Extract email from flexible payload
    const resultEmail = (payload.email as string) || null;

    // 6. Update tracking row
    const { error: updateErr } = await supabase
      .from('clay_enrichment_requests')
      .update({
        status: resultEmail ? 'completed' : 'failed',
        result_email: resultEmail,
        result_data: payload,
        completed_at: new Date().toISOString(),
        raw_callback_payload: payload,
      })
      .eq('request_id', requestId);

    if (updateErr) {
      console.error(`[clay-webhook-linkedin] Update failed: ${updateErr.message}`);
    }

    // 7. If email found, save to contacts via RPC
    if (resultEmail) {
      const fullName = `${request.first_name || ''} ${request.last_name || ''}`.trim();

      await supabase.rpc('contacts_upsert', {
        p_identity: {
          email: resultEmail,
          linkedin_url: request.linkedin_url || null,
        },
        p_fields: {
          first_name: request.first_name || 'Unknown',
          last_name: request.last_name || '',
          title: request.title || null,
          email: resultEmail,
          linkedin_url: request.linkedin_url || null,
          contact_type: 'buyer',
        },
        p_source: 'clay_linkedin',
        p_enrichment: {
          provider: 'clay_linkedin',
          confidence: 'high',
          source_query: `clay_linkedin:${request.linkedin_url}`,
        },
      });

      // 8. Update source entity with result
      if (request.source_entity_id) {
        if (request.source_function === 'find-valuation-lead-contacts') {
          // Valuation lead enrichment — save email as work_email (not overwriting submission email)
          const leadUpdates: Record<string, unknown> = { updated_at: new Date().toISOString() };
          if (resultEmail) leadUpdates.work_email = resultEmail;

          if (Object.keys(leadUpdates).length > 1) {
            const { error: leadUpdateErr } = await supabase
              .from('valuation_leads')
              .update(leadUpdates)
              .eq('id', request.source_entity_id);

            if (leadUpdateErr) {
              console.warn(
                `[clay-webhook-linkedin] Valuation lead update failed for ${request.source_entity_id}: ${leadUpdateErr.message}`,
              );
            } else {
              console.log(
                `[clay-webhook-linkedin] Updated valuation_lead ${request.source_entity_id} with work_email via Clay`,
              );
            }
          }
        } else {
          // Default: update contacts table via RPC
          const { error: contactUpdateErr } = await supabase.rpc('contacts_upsert', {
            p_identity: { email: resultEmail },
            p_fields: { email: resultEmail },
            p_source: 'clay_linkedin',
            p_enrichment: { provider: 'clay_linkedin', confidence: 'high', source_query: `clay_linkedin:${request.linkedin_url}` },
          });

          if (contactUpdateErr) {
            console.warn(
              `[clay-webhook-linkedin] Contact update failed for ${request.source_entity_id}: ${contactUpdateErr.message}`,
            );
          } else {
            console.log(
              `[clay-webhook-linkedin] Updated contact ${request.source_entity_id} with Clay result`,
            );
          }
        }
      }

      console.log(
        `[clay-webhook-linkedin] Enrichment saved — email: ${resultEmail} for ${fullName}`,
      );
    } else {
      console.log(`[clay-webhook-linkedin] No email found by Clay for request: ${requestId}`);
    }

    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (error: unknown) {
    console.error('[clay-webhook-linkedin] Handler error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500 });
  }
});
