/**
 * grant-data-room-access: Grants a buyer access to a deal's data room
 *
 * Admin-only. Upserts a deal_data_room_access record, logs each granted
 * document in the immutable document_release_log (method = 'data_room_grant'),
 * and emails the buyer their unique data room URL.
 *
 * POST body:
 *   - deal_id: UUID
 *   - buyer_email: string
 *   - buyer_name: string
 *   - buyer_firm: string (optional)
 *   - buyer_id: UUID (optional — buyers.id)
 *   - document_ids: UUID[] (optional — specific documents to grant; null = all data_room_files)
 *
 * Returns: { success: true, data_room_url, warning?, access_id }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders } from '../_shared/cors.ts';
import { requireAdmin, escapeHtml } from '../_shared/auth.ts';
import { sendViaBervo } from '../_shared/brevo-sender.ts';

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
    const { deal_id, buyer_email, buyer_name, buyer_firm, buyer_id, document_ids } =
      await req.json();

    // ── Validate required fields ──

    if (!deal_id || !buyer_email || !buyer_name) {
      return new Response(
        JSON.stringify({ error: 'deal_id, buyer_email, and buyer_name are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Basic email format validation
    const emailTrimmed = buyer_email.trim().toLowerCase();
    if (
      !emailTrimmed.includes('@') ||
      emailTrimmed.indexOf('@') === 0 ||
      emailTrimmed.indexOf('@') === emailTrimmed.length - 1
    ) {
      return new Response(JSON.stringify({ error: 'Invalid buyer_email format' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Fetch deal info ──

    const { data: deal, error: dealError } = await supabaseAdmin
      .from('listings')
      .select('id, project_name, title, internal_company_name')
      .eq('id', deal_id)
      .single();

    if (dealError || !deal) {
      return new Response(JSON.stringify({ error: 'Deal not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── 1. Look up buyer NDA / fee agreement status ──

    const emailDomain = emailTrimmed.split('@')[1] || '';
    let ndaStatus: string | null = null;
    let feeAgreementStatus: string | null = null;
    let warning: string | undefined;

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

    // Warn if NDA or fee agreement not signed — but do NOT block
    const unsignedItems: string[] = [];
    if (ndaStatus !== 'signed') {
      unsignedItems.push('NDA');
    }
    if (feeAgreementStatus !== 'signed') {
      unsignedItems.push('Fee Agreement');
    }
    if (unsignedItems.length > 0) {
      warning = `Buyer does not have a signed ${unsignedItems.join(' or ')}. Data room access granted anyway.`;
    }

    // ── 2. UPSERT into deal_data_room_access ──

    // Check if an access record already exists for this deal + buyer_email
    const { data: existingAccess } = await supabaseAdmin
      .from('deal_data_room_access')
      .select('id, access_token, granted_document_ids')
      .eq('deal_id', deal_id)
      .eq('buyer_email', emailTrimmed)
      .maybeSingle();

    let accessRecord;

    if (existingAccess) {
      // Generate new access_token on re-grant so old/revoked URLs no longer work
      const newAccessToken = crypto.randomUUID().replaceAll('-', '');

      // Merge document grants: if both old and new are specific lists, union them.
      // If either is null (= all docs), keep null (= all docs).
      let mergedDocumentIds: string[] | null = document_ids || null;
      if (
        document_ids &&
        document_ids.length > 0 &&
        existingAccess.granted_document_ids &&
        existingAccess.granted_document_ids.length > 0
      ) {
        const merged = new Set([...existingAccess.granted_document_ids, ...document_ids]);
        mergedDocumentIds = [...merged];
      }

      // Update existing record
      const { data: updated, error: updateError } = await supabaseAdmin
        .from('deal_data_room_access')
        .update({
          access_token: newAccessToken,
          buyer_name,
          buyer_firm: buyer_firm || null,
          buyer_id: buyer_id || null,
          granted_document_ids: mergedDocumentIds,
          granted_by: auth.userId,
          granted_at: new Date().toISOString(),
          is_active: true,
          revoked_at: null,
          revoked_by: null,
          nda_signed_at: ndaStatus === 'signed' ? new Date().toISOString() : null,
          fee_agreement_signed_at:
            feeAgreementStatus === 'signed' ? new Date().toISOString() : null,
        })
        .eq('id', existingAccess.id)
        .select()
        .single();

      if (updateError) {
        console.error('Failed to update data room access:', updateError);
        return new Response(JSON.stringify({ error: 'Failed to update data room access' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      accessRecord = updated;
    } else {
      // Insert new record
      const { data: inserted, error: insertError } = await supabaseAdmin
        .from('deal_data_room_access')
        .insert({
          deal_id,
          buyer_email: emailTrimmed,
          buyer_name,
          buyer_firm: buyer_firm || null,
          buyer_id: buyer_id || null,
          granted_document_ids: document_ids || null,
          granted_by: auth.userId,
          is_active: true,
          nda_signed_at: ndaStatus === 'signed' ? new Date().toISOString() : null,
          fee_agreement_signed_at:
            feeAgreementStatus === 'signed' ? new Date().toISOString() : null,
        })
        .select()
        .single();

      if (insertError) {
        console.error('Failed to create data room access:', insertError);
        return new Response(JSON.stringify({ error: 'Failed to create data room access' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      accessRecord = inserted;
    }

    // ── 3. INSERT into document_release_log for each granted document ──

    // Determine which documents to log
    let documentsToLog: { id: string; title: string }[] = [];

    if (document_ids && document_ids.length > 0) {
      // Specific documents
      const { data: docs, error: docsError } = await supabaseAdmin
        .from('deal_documents')
        .select('id, title')
        .in('id', document_ids)
        .eq('deal_id', deal_id);

      if (docsError) {
        console.error('Failed to fetch granted documents:', docsError);
      } else {
        documentsToLog = docs || [];
      }
    } else {
      // All data_room_files for this deal
      const { data: docs, error: docsError } = await supabaseAdmin
        .from('deal_documents')
        .select('id, title')
        .eq('deal_id', deal_id)
        .eq('document_type', 'data_room_file')
        .eq('status', 'active');

      if (docsError) {
        console.error('Failed to fetch deal data room files:', docsError);
      } else {
        documentsToLog = docs || [];
      }
    }

    // Insert release log entries
    for (const doc of documentsToLog) {
      const { error: releaseError } = await supabaseAdmin.from('document_release_log').insert({
        deal_id,
        document_id: doc.id,
        buyer_id: buyer_id || null,
        buyer_name,
        buyer_firm: buyer_firm || null,
        buyer_email: emailTrimmed,
        release_method: 'data_room_grant',
        nda_status_at_release: ndaStatus,
        fee_agreement_status_at_release: feeAgreementStatus,
        released_by: auth.userId,
      });

      if (releaseError) {
        console.error(`Failed to create release log for document ${doc.id}:`, releaseError);
      }
    }

    // ── 4. Send email to buyer with data room URL ──

    const baseUrl = Deno.env.get('BASE_URL') || 'https://app.sourcecoconnect.com';
    const dataRoomUrl = `${baseUrl}/dataroom/${accessRecord.access_token}`;

    const projectName = escapeHtml(deal.project_name || deal.title || 'Confidential');
    const escapedBuyerName = escapeHtml(buyer_name);

    const emailResult = await sendViaBervo({
      to: emailTrimmed,
      toName: buyer_name,
      subject: `Data room open — Project ${deal.project_name || deal.title || 'Confidential'}`,
      htmlContent: buildDataRoomEmailHtml(projectName, escapedBuyerName, dataRoomUrl),
      senderName: 'SourceCo Deal Team',
      replyToEmail: Deno.env.get('ADMIN_NOTIFICATION_EMAIL') || 'deals@sourcecodeals.com',
      replyToName: 'SourceCo Deal Team',
    });

    if (!emailResult.success) {
      console.error('Failed to send data room access email:', emailResult.error);
      // Continue — access record and logs are already created; email failure is non-fatal
    }

    console.log(
      `Data room access granted: deal ${deal_id} -> ${emailTrimmed} by admin ${auth.userId} (access_id: ${accessRecord.id}, documents: ${documentsToLog.length})`,
    );

    // ── 5. Return response ──

    const response: Record<string, unknown> = {
      success: true,
      data_room_url: dataRoomUrl,
      access_id: accessRecord.id,
      email_sent: emailResult.success,
      documents_granted: documentsToLog.length,
      re_grant: !!existingAccess,
    };

    if (warning) {
      response.warning = warning;
    }

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Grant data room access error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function buildDataRoomEmailHtml(
  projectName: string,
  buyerName: string,
  dataRoomUrl: string,
): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: Arial, Helvetica, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { padding-bottom: 20px; border-bottom: 2px solid #6366f1; margin-bottom: 20px; }
    .header h1 { color: #1e293b; font-size: 22px; margin: 0; }
    .content { margin: 20px 0; }
    .cta-button { display: inline-block; background: #6366f1; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px; margin: 20px 0; }
    .note { background: #f8fafc; border-left: 4px solid #6366f1; padding: 12px 16px; margin: 20px 0; font-size: 14px; color: #475569; }
    .signature { margin-top: 30px; padding-top: 20px; border-top: 1px solid #e0e0e0; color: #666; font-size: 14px; }
    .disclaimer { font-size: 12px; color: #94a3b8; margin-top: 20px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>Data Room Access — Project ${projectName}</h1>
  </div>
  <div class="content">
    <p>Hi ${buyerName},</p>
    <p>You've been granted access to the data room for <strong>Project ${projectName}</strong>.</p>
    <p>The data room contains deal details, supporting documentation, and diligence materials. Your access link is personal — please don't share or forward it. All access is tracked.</p>
    <p><a href="${dataRoomUrl}" class="cta-button">Open Data Room</a></p>
    <p>If you have questions about the materials or want to discuss the opportunity, reply to this email — it goes directly to our deal team.</p>
  </div>
  <div class="signature">
    <p>SourceCo Deal Team<br>SourceCo</p>
  </div>
  <div class="disclaimer">
    <p>This communication is confidential and intended solely for the named recipient. All materials in the data room are subject to the terms of your non-disclosure agreement.</p>
  </div>
</body>
</html>`;
}
