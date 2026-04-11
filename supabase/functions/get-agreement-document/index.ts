import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.10';
import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';
import { requireAuth } from '../_shared/auth.ts';
import { selfHealFirm } from '../_shared/firm-self-heal.ts';

/**
 * get-agreement-document
 *
 * Returns the status for an agreement document (NDA or fee agreement).
 * Uses deterministic firm resolution via resolve_user_firm_id RPC.
 */

serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(req);
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const auth = await requireAuth(req);
    if (!auth.authenticated || !auth.userId) {
      return new Response(JSON.stringify({ error: auth.error }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    const userId = auth.userId;

    // Parse request body
    const body = await req.json().catch(() => ({}));
    const documentType: string = body.documentType;
    if (documentType !== 'nda' && documentType !== 'fee_agreement') {
      return new Response(
        JSON.stringify({ error: 'Invalid documentType. Must be "nda" or "fee_agreement".' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    const isNda = documentType === 'nda';

    // Deterministic firm resolution via DB function
    const { data: firmId, error: resolveErr } = await supabaseAdmin.rpc('resolve_user_firm_id', {
      p_user_id: userId,
    });

    let resolvedFirmId = firmId;
    if (resolveErr || !resolvedFirmId) {
      // Self-heal
      const { data: profileForHeal } = await supabaseAdmin
        .from('profiles')
        .select('email, company')
        .eq('id', userId)
        .single();
      if (profileForHeal) {
        const result = await selfHealFirm(supabaseAdmin, userId, profileForHeal);
        if (result) resolvedFirmId = result.firmId;
      }
      if (!resolvedFirmId) {
        return new Response(
          JSON.stringify({ error: 'No firm found' }),
          { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
        );
      }
    }

    // Get agreement status from firm_agreements
    const statusCol = isNda ? 'nda_status' : 'fee_agreement_status';

    const { data: firm } = await supabaseAdmin
      .from('firm_agreements')
      .select(statusCol)
      .eq('id', resolvedFirmId)
      .single();

    if (!firm) {
      return new Response(
        JSON.stringify({ error: 'Firm agreement not found' }),
        { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    const firmRecord = firm as Record<string, unknown>;
    const isSigned = firmRecord[statusCol] === 'signed';

    return new Response(
      JSON.stringify({
        documentName: isNda ? 'NDA' : 'Fee Agreement',
        isSigned,
        status: firmRecord[statusCol] || 'not_started',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    );
  } catch (error: unknown) {
    console.error('Error in get-agreement-document:', error instanceof Error ? error.message : String(error));
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    );
  }
});
