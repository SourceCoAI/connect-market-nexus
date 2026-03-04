/**
 * generate-tracked-link: Creates a tracked document link for buyer distribution
 *
 * Admin-only. Generates a unique tracked link for a deal document, records
 * the release in the immutable document_release_log, and captures the buyer's
 * current NDA/fee agreement status at time of release.
 *
 * POST body:
 *   - deal_id: UUID
 *   - document_id: UUID
 *   - buyer_id: UUID (optional — buyers.id)
 *   - buyer_email: string
 *   - buyer_name: string
 *   - buyer_firm: string (optional)
 *   - release_notes: string (optional)
 *
 * Validations:
 *   - 403 if document_type = 'full_detail_memo'
 *   - 400 if document_type = 'anonymous_teaser' and deal.project_name is null
 *   - 401 if no valid JWT
 *
 * Returns: { link_url, release_log_id, tracked_link_id }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders } from '../_shared/cors.ts';
import { requireAdmin } from '../_shared/auth.ts';

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
    const { deal_id, document_id, buyer_id, buyer_email, buyer_name, buyer_firm, release_notes } =
      await req.json();

    // ── Validate required fields ──

    if (!deal_id || !document_id || !buyer_email || !buyer_name) {
      return new Response(
        JSON.stringify({ error: 'deal_id, document_id, buyer_email, and buyer_name are required' }),
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

    // ── Document type validations ──

    if (document.document_type === 'full_detail_memo') {
      return new Response(
        JSON.stringify({
          error:
            'Full detail memos cannot be distributed via tracked link. Use data room access instead.',
        }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // ── Fetch deal ──

    const { data: deal, error: dealError } = await supabaseAdmin
      .from('listings')
      .select('id, project_name')
      .eq('id', deal_id)
      .single();

    if (dealError || !deal) {
      return new Response(JSON.stringify({ error: 'Deal not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (document.document_type === 'anonymous_teaser' && !deal.project_name) {
      return new Response(
        JSON.stringify({
          error:
            'Cannot distribute anonymous teaser: deal does not have a project_name assigned. Set a project codename first.',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
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

    // ── Generate unique link token ──

    const linkToken = crypto.randomUUID();
    const baseUrl = Deno.env.get('BASE_URL') || 'https://app.sourcecoconnect.com';
    const linkUrl = `${baseUrl}/view/${linkToken}`;

    // ── INSERT tracked link ──

    const { data: trackedLink, error: linkError } = await supabaseAdmin
      .from('document_tracked_links')
      .insert({
        deal_id,
        document_id,
        buyer_id: buyer_id || null,
        buyer_email,
        buyer_name,
        buyer_firm: buyer_firm || null,
        link_token: linkToken,
        is_active: true,
        open_count: 0,
        created_by: auth.userId,
      })
      .select()
      .single();

    if (linkError) {
      console.error('Failed to create tracked link:', linkError);
      return new Response(JSON.stringify({ error: 'Failed to create tracked link' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── INSERT immutable release log ──

    const { data: releaseLog, error: releaseError } = await supabaseAdmin
      .from('document_release_log')
      .insert({
        deal_id,
        document_id,
        tracked_link_id: trackedLink.id,
        release_method: 'tracked_link',
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

    console.log(
      `Tracked link created: ${trackedLink.id} for document ${document_id} -> ${buyer_email} by admin ${auth.userId}`,
    );

    return new Response(
      JSON.stringify({
        link_url: linkUrl,
        release_log_id: releaseLog.id,
        tracked_link_id: trackedLink.id,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('Generate tracked link error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
