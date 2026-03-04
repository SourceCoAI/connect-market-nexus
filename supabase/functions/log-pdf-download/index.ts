/**
 * log-pdf-download: Logs a PDF download release and generates a signed URL
 *
 * Admin-only. Records the document distribution in the immutable
 * document_release_log (method = 'pdf_download') and returns a short-lived
 * signed URL so the admin can immediately download the PDF for the buyer.
 *
 * POST body:
 *   - deal_id: UUID
 *   - document_id: UUID
 *   - buyer_name: string
 *   - buyer_email: string
 *   - buyer_id: UUID (optional — buyers.id)
 *   - buyer_firm: string (optional)
 *   - release_notes: string (optional)
 *
 * Validations:
 *   - 403 if document_type = 'full_detail_memo'
 *
 * Returns: { download_url, release_log_id }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders } from '../_shared/cors.ts';
import { requireAdmin } from '../_shared/auth.ts';

const BUCKET_NAME = 'deal-documents';
const SIGNED_URL_EXPIRY = 60; // 60 seconds

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

  const auth = await requireAdmin(req, supabaseAdmin);
  if (!auth.isAdmin) {
    return new Response(JSON.stringify({ error: auth.error }), {
      status: auth.authenticated ? 403 : 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const { deal_id, document_id, buyer_name, buyer_email, buyer_id, buyer_firm, release_notes } =
      await req.json();

    // ── Validate required fields ──

    if (!deal_id || !document_id || !buyer_name || !buyer_email) {
      return new Response(
        JSON.stringify({ error: 'deal_id, document_id, buyer_name, and buyer_email are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // ── Fetch document (scoped to deal_id for ownership check) ──

    const { data: document, error: docError } = await supabaseAdmin
      .from('deal_documents')
      .select('id, deal_id, document_type, file_path, title, status')
      .eq('id', document_id)
      .eq('deal_id', deal_id)
      .single();

    if (docError || !document) {
      return new Response(JSON.stringify({ error: 'Document not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Document type validation ──

    if (document.document_type === 'full_detail_memo') {
      return new Response(
        JSON.stringify({
          error:
            'Full detail memos cannot be distributed via PDF download. Use data room access instead.',
        }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // ── Look up buyer NDA / fee agreement status ──

    const emailDomain = buyer_email.split('@')[1]?.toLowerCase() || '';

    let ndaStatus: string | null = null;
    let feeAgreementStatus: string | null = null;

    if (emailDomain) {
      const { data: firmAgreement } = await supabaseAdmin
        .from('firm_agreements')
        .select('nda_status, fee_agreement_status')
        .eq('email_domain', emailDomain)
        .limit(1)
        .maybeSingle();

      if (firmAgreement) {
        ndaStatus = firmAgreement.nda_status;
        feeAgreementStatus = firmAgreement.fee_agreement_status;
      }
    }

    // ── INSERT immutable release log ──

    const { data: releaseLog, error: releaseError } = await supabaseAdmin
      .from('document_release_log')
      .insert({
        deal_id,
        document_id,
        release_method: 'pdf_download',
        buyer_id: buyer_id || null,
        buyer_email,
        buyer_name,
        buyer_firm: buyer_firm || null,
        nda_status_at_release: ndaStatus,
        fee_agreement_status_at_release: feeAgreementStatus,
        release_notes: release_notes || null,
        released_by: auth.userId,
      })
      .select()
      .single();

    if (releaseError) {
      console.error('Failed to create release log:', releaseError);
      return new Response(JSON.stringify({ error: 'Failed to log document release' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Generate signed download URL ──

    if (!document.file_path) {
      return new Response(JSON.stringify({ error: 'Document file not found in storage' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: signedUrlData, error: urlError } = await supabaseAdmin.storage
      .from(BUCKET_NAME)
      .createSignedUrl(document.file_path, SIGNED_URL_EXPIRY, {
        download: true,
      });

    if (urlError || !signedUrlData) {
      console.error('Signed URL error:', urlError);
      return new Response(JSON.stringify({ error: 'Failed to generate download URL' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(
      `PDF download logged: document ${document_id} -> ${buyer_email} by admin ${auth.userId} (release_log: ${releaseLog.id})`,
    );

    return new Response(
      JSON.stringify({
        download_url: signedUrlData.signedUrl,
        release_log_id: releaseLog.id,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('Log PDF download error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
