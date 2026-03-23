/**
 * Clay Webhook — Phone Results Receiver
 *
 * Receives enriched contact data back from Clay after its waterfall enrichment.
 * Clay sends results to this endpoint after processing a LinkedIn URL phone lookup.
 * Correlation is done via request_id (echoed back by Clay).
 *
 * Idempotency: duplicate request_id callbacks are safely ignored.
 *
 * NO auth/secret/signature check — DO NOT re-add.
 *
 * POST /clay-webhook-phone
 * Body: { request_id, phone, ... } (flexible — user configures Clay output)
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
      console.error('[clay-webhook-phone] Missing request_id in payload');
      return new Response(JSON.stringify({ error: 'request_id is required' }), { status: 400 });
    }

    console.log(`[clay-webhook-phone] Received callback for request_id: ${requestId}`);

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
      console.error(`[clay-webhook-phone] DB lookup error: ${lookupErr.message}`);
      return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500 });
    }

    if (!request) {
      console.warn(`[clay-webhook-phone] No matching request found for: ${requestId}`);
      return new Response(JSON.stringify({ success: true, note: 'No matching request' }), {
        status: 200,
      });
    }

    // 4. Idempotency — skip if already completed
    if (request.status === 'completed') {
      console.log(`[clay-webhook-phone] Duplicate callback skipped for: ${requestId}`);
      return new Response(JSON.stringify({ success: true, note: 'Duplicate callback' }), {
        status: 200,
      });
    }

    // 5. Extract phone from flexible payload
    const resultPhone =
      [
        payload.phone,
        payload.mobile,
        payload.mobile_phone,
        payload.mobileNumber,
        payload.mobile_number,
        payload.phone_number,
        payload.cell,
        payload.cell_phone,
        payload.direct_phone,
      ].find((value): value is string => typeof value === 'string' && value.trim().length > 0)
        ?.trim() || null;

    // 6. Update tracking row
    const { error: updateErr } = await supabase
      .from('clay_enrichment_requests')
      .update({
        status: resultPhone ? 'completed' : 'failed',
        result_phone: resultPhone,
        result_data: payload,
        completed_at: new Date().toISOString(),
        raw_callback_payload: payload,
      })
      .eq('request_id', requestId);

    if (updateErr) {
      console.error(`[clay-webhook-phone] Update failed: ${updateErr.message}`);
    }

    // 7. If phone found, save to enriched_contacts
    if (resultPhone) {
      const fullName = `${request.first_name || ''} ${request.last_name || ''}`.trim();

      await supabase.from('enriched_contacts').upsert(
        {
          workspace_id: request.workspace_id,
          company_name: request.company_name || 'Unknown',
          full_name: fullName || 'Unknown',
          first_name: request.first_name || '',
          last_name: request.last_name || '',
          title: request.title || '',
          email: null,
          phone: resultPhone,
          linkedin_url: request.linkedin_url || '',
          confidence: 'high',
          source: 'clay_phone',
          enriched_at: new Date().toISOString(),
          search_query: `clay_phone:${request.linkedin_url}`,
        },
        { onConflict: 'workspace_id,linkedin_url', ignoreDuplicates: false },
      );

      // 8. Update source entity with result
      if (request.source_entity_id) {
        if (request.source_function === 'find-valuation-lead-contacts') {
          // Valuation lead enrichment — update valuation_leads table
          const leadUpdates: Record<string, unknown> = {
            phone: resultPhone,
            updated_at: new Date().toISOString(),
          };
          // Clay may also return an email alongside phone — save as work_email
          const bonusEmail = (payload.email as string) || (payload.work_email as string) || null;
          if (bonusEmail) leadUpdates.work_email = bonusEmail;

          if (Object.keys(leadUpdates).length > 1) {
            const { error: leadUpdateErr } = await supabase
              .from('valuation_leads')
              .update(leadUpdates)
              .eq('id', request.source_entity_id);

            if (leadUpdateErr) {
              console.warn(
                `[clay-webhook-phone] Valuation lead update failed for ${request.source_entity_id}: ${leadUpdateErr.message}`,
              );
            } else {
              console.log(
                `[clay-webhook-phone] Updated valuation_lead ${request.source_entity_id} with phone via Clay`,
              );
            }
          }
        } else {
          // Default: update contacts table
          const { error: contactUpdateErr } = await supabase
            .from('contacts')
            .update({ phone: resultPhone })
            .eq('id', request.source_entity_id);

          if (contactUpdateErr) {
            console.warn(
              `[clay-webhook-phone] Contact update failed for ${request.source_entity_id}: ${contactUpdateErr.message}`,
            );
          } else {
            console.log(
              `[clay-webhook-phone] Updated contact ${request.source_entity_id} with Clay result`,
            );
          }
        }
      }

      console.log(
        `[clay-webhook-phone] Enrichment saved — phone: ${resultPhone} for ${fullName}`,
      );
    } else {
      console.log(`[clay-webhook-phone] No phone found by Clay for request: ${requestId}`);
    }

    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (error: unknown) {
    console.error('[clay-webhook-phone] Handler error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500 });
  }
});
