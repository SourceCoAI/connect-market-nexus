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

serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  try {
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

    // 7. If email found, save to enriched_contacts
    if (resultEmail) {
      const fullName = `${request.first_name || ''} ${request.last_name || ''}`.trim();

      await supabase.from('enriched_contacts').upsert(
        {
          workspace_id: request.workspace_id,
          company_name: request.company_name || 'Unknown',
          full_name: fullName || 'Unknown',
          first_name: request.first_name || '',
          last_name: request.last_name || '',
          title: request.title || '',
          email: resultEmail,
          phone: null,
          linkedin_url: request.linkedin_url || '',
          confidence: 'high',
          source: 'clay_linkedin',
          enriched_at: new Date().toISOString(),
          search_query: `clay_linkedin:${request.linkedin_url}`,
        },
        { onConflict: 'workspace_id,linkedin_url', ignoreDuplicates: false },
      );

      // 8. Update contacts table if source_entity_id is a contact ID
      if (request.source_entity_id) {
        const { error: contactUpdateErr } = await supabase
          .from('contacts')
          .update({ email: resultEmail })
          .eq('id', request.source_entity_id);

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
