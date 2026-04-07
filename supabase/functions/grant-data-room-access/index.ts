/**
 * grant-data-room-access: Grants a buyer access to a deal's data room
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders } from '../_shared/cors.ts';
import { requireAdmin, escapeHtml } from '../_shared/auth.ts';
import { sendEmail } from '../_shared/email-sender.ts';
import { wrapEmailHtml } from '../_shared/email-template-wrapper.ts';

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
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
    const { deal_id, buyer_email, buyer_name, buyer_firm, buyer_id, document_ids } = await req.json();

    if (!deal_id || !buyer_email || !buyer_name) {
      return new Response(JSON.stringify({ error: 'deal_id, buyer_email, and buyer_name are required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const emailTrimmed = buyer_email.trim().toLowerCase();
    if (!emailTrimmed.includes('@') || emailTrimmed.indexOf('@') === 0 || emailTrimmed.indexOf('@') === emailTrimmed.length - 1) {
      return new Response(JSON.stringify({ error: 'Invalid buyer_email format' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: deal, error: dealError } = await supabaseAdmin.from('listings').select('id, project_name, title, internal_company_name').eq('id', deal_id).single();
    if (dealError || !deal) {
      return new Response(JSON.stringify({ error: 'Deal not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const emailDomain = emailTrimmed.split('@')[1] || '';
    let ndaStatus: string | null = null;
    let feeAgreementStatus: string | null = null;
    let warning: string | undefined;

    if (emailDomain) {
      const { data: firmAgreement } = await supabaseAdmin.from('firm_agreements').select('nda_status, fee_agreement_status').eq('email_domain', emailDomain).limit(1).maybeSingle();
      if (firmAgreement) {
        ndaStatus = firmAgreement.nda_status;
        feeAgreementStatus = firmAgreement.fee_agreement_status;
      }
    }

    const unsignedItems: string[] = [];
    if (ndaStatus !== 'signed') unsignedItems.push('NDA');
    if (feeAgreementStatus !== 'signed') unsignedItems.push('Fee Agreement');
    if (unsignedItems.length > 0) {
      warning = `Buyer does not have a signed ${unsignedItems.join(' or ')}. Data room access granted anyway.`;
    }

    const { data: existingAccess } = await supabaseAdmin.from('deal_data_room_access').select('id, access_token, granted_document_ids').eq('deal_id', deal_id).eq('buyer_email', emailTrimmed).maybeSingle();

    let accessRecord;

    if (existingAccess) {
      const newAccessToken = crypto.randomUUID().replaceAll('-', '');
      let mergedDocumentIds: string[] | null = document_ids || null;
      if (document_ids && document_ids.length > 0 && existingAccess.granted_document_ids && existingAccess.granted_document_ids.length > 0) {
        const merged = new Set([...existingAccess.granted_document_ids, ...document_ids]);
        mergedDocumentIds = [...merged];
      }

      const { data: updated, error: updateError } = await supabaseAdmin.from('deal_data_room_access').update({
        access_token: newAccessToken, buyer_name, buyer_firm: buyer_firm || null, buyer_id: buyer_id || null,
        granted_document_ids: mergedDocumentIds, granted_by: auth.userId, granted_at: new Date().toISOString(),
        is_active: true, revoked_at: null, revoked_by: null,
        nda_signed_at: ndaStatus === 'signed' ? new Date().toISOString() : null,
        fee_agreement_signed_at: feeAgreementStatus === 'signed' ? new Date().toISOString() : null,
      }).eq('id', existingAccess.id).select().single();

      if (updateError) {
        return new Response(JSON.stringify({ error: 'Failed to update data room access' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      accessRecord = updated;
    } else {
      const { data: inserted, error: insertError } = await supabaseAdmin.from('deal_data_room_access').insert({
        deal_id, buyer_email: emailTrimmed, buyer_name, buyer_firm: buyer_firm || null, buyer_id: buyer_id || null,
        granted_document_ids: document_ids || null, granted_by: auth.userId, is_active: true,
        nda_signed_at: ndaStatus === 'signed' ? new Date().toISOString() : null,
        fee_agreement_signed_at: feeAgreementStatus === 'signed' ? new Date().toISOString() : null,
      }).select().single();

      if (insertError) {
        return new Response(JSON.stringify({ error: 'Failed to create data room access' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      accessRecord = inserted;
    }

    // Log document releases
    let documentsToLog: { id: string; title: string }[] = [];
    if (document_ids && document_ids.length > 0) {
      const { data: docs } = await supabaseAdmin.from('deal_documents').select('id, title').in('id', document_ids).eq('deal_id', deal_id);
      documentsToLog = docs || [];
    } else {
      const { data: docs } = await supabaseAdmin.from('deal_documents').select('id, title').eq('deal_id', deal_id).eq('document_type', 'data_room_file').eq('status', 'active');
      documentsToLog = docs || [];
    }

    for (const doc of documentsToLog) {
      await supabaseAdmin.from('document_release_log').insert({
        deal_id, document_id: doc.id, buyer_id: buyer_id || null, buyer_name, buyer_firm: buyer_firm || null,
        buyer_email: emailTrimmed, release_method: 'data_room_grant',
        nda_status_at_release: ndaStatus, fee_agreement_status_at_release: feeAgreementStatus, released_by: auth.userId,
      });
    }

    // Send email
    const baseUrl = Deno.env.get('BASE_URL') || 'https://app.sourcecoconnect.com';
    const dataRoomUrl = `${baseUrl}/dataroom/${accessRecord.access_token}`;
    const projectName = escapeHtml(deal.project_name || deal.title || 'Confidential');
    const escapedBuyerName = escapeHtml(buyer_name);

    const emailResult = await sendEmail({
      templateName: 'data_room_access',
      to: emailTrimmed,
      toName: buyer_name,
      subject: `Data room access granted: Project ${deal.project_name || deal.title || 'Confidential'}`,
      htmlContent: buildDataRoomEmailHtml(projectName, escapedBuyerName, dataRoomUrl, emailTrimmed),
      senderName: 'SourceCo Notifications',
      senderEmail: 'noreply@sourcecodeals.com',
      replyTo: 'noreply@sourcecodeals.com',
      isTransactional: true,
      metadata: { dealId: deal_id },
    });

    if (!emailResult.success) {
      console.error('Failed to send data room access email:', emailResult.error);
    }

    const response: Record<string, unknown> = {
      success: true, data_room_url: dataRoomUrl, access_id: accessRecord.id,
      email_sent: emailResult.success, documents_granted: documentsToLog.length, re_grant: !!existingAccess,
    };
    if (warning) response.warning = warning;

    return new Response(JSON.stringify(response), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error('Grant data room access error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});

function buildDataRoomEmailHtml(projectName: string, buyerName: string, dataRoomUrl: string, buyerEmail: string): string {
  return wrapEmailHtml({
    bodyHtml: `
    <p>Hi ${buyerName},</p>
    <p>You have been granted access to the data room for Project ${projectName}.</p>
    <p>The data room contains deal details, supporting documentation, and diligence materials. Your access link is personal. Do not share or forward it. All access is tracked.</p>
    <div style="text-align: center; margin: 28px 0;">
      <a href="${dataRoomUrl}" style="display: inline-block; background: #000000; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 15px;">Open Data Room</a>
    </div>
    <p>If you have questions about the materials, <a href="https://marketplace.sourcecodeals.com/messages" style="color: #000000; font-weight: 600;">message us directly on the platform</a>. Your deal team monitors all conversations there. Please do not reply to this email.</p>
    <p style="color: #6B6B6B; margin-top: 32px;">The SourceCo Team</p>
    <p style="font-size: 12px; color: #9B9B9B; margin-top: 16px;">This communication is confidential and intended solely for the named recipient.</p>`,
    preheader: `Data room access granted for Project ${projectName}`,
    recipientEmail: buyerEmail,
  });
}
