import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.10';
import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';
import { requireAuth } from '../_shared/auth.ts';
import { selfHealFirm } from '../_shared/firm-self-heal.ts';

/**
 * get-agreement-document
 *
 * Returns the PDF URL for an agreement document (draft or signed).
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

    // Get document ID and signed status — use canonical nda_status / fee_agreement_status
    const documentCol = isNda ? 'nda_pandadoc_document_id' : 'fee_pandadoc_document_id';
    const statusCol = isNda ? 'nda_status' : 'fee_agreement_status';

    const { data: firm } = await supabaseAdmin
      .from('firm_agreements')
      .select(`${documentCol}, ${statusCol}`)
      .eq('id', firmId)
      .single();

    if (!firm) {
      return new Response(
        JSON.stringify({ error: 'Firm agreement not found' }),
        { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    const firmRecord = firm as Record<string, unknown>;
    const isSigned = firmRecord[statusCol] === 'signed';

    // Always fetch fresh from PandaDoc — cached PDF URLs can expire
    const documentId = firmRecord[documentCol];
    if (!documentId) {
      return new Response(
        JSON.stringify({ error: 'No document exists for this agreement' }),
        { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    // Fetch document from PandaDoc API
    const pandadocApiKey = Deno.env.get('PANDADOC_API_KEY');
    if (!pandadocApiKey) {
      return new Response(
        JSON.stringify({ error: 'PandaDoc not configured' }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    const fetchController = new AbortController();
    const fetchTimeout = setTimeout(() => fetchController.abort(), 15000);
    let docRes: Response;
    try {
      docRes = await fetch(
        `https://api.pandadoc.com/public/v1/documents/${documentId}/download`,
        {
          headers: { 'Authorization': `API-Key ${pandadocApiKey}` },
          signal: fetchController.signal,
        },
      );
    } finally {
      clearTimeout(fetchTimeout);
    }

    if (!docRes.ok) {
      const errText = await docRes.text();
      console.error('PandaDoc download API error:', docRes.status, errText);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch document' }),
        { status: 502, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    // PandaDoc download returns the PDF directly; use the redirect URL as the document URL
    const docUrl = docRes.url || `https://api.pandadoc.com/public/v1/documents/${documentId}/download`;

    if (!docUrl) {
      return new Response(
        JSON.stringify({ error: 'Document not available' }),
        { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    return new Response(
      JSON.stringify({
        documentUrl: docUrl,
        documentName: isNda ? 'NDA' : 'Fee Agreement',
        isSigned,
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
