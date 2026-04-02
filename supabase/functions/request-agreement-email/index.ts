import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.10';
import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';
import { requireAuth } from '../_shared/auth.ts';
import { selfHealFirm } from '../_shared/firm-self-heal.ts';
import { sendViaBervo } from '../_shared/brevo-sender.ts';
import { logEmailDelivery } from '../_shared/email-logger.ts';

/**
 * request-agreement-email
 * Sends NDA or Fee Agreement via email.
 * Updates both document_requests (ops queue) and firm_agreements (canonical status).
 * Logs to email_delivery_logs for full observability.
 */

serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') return corsPreflightResponse(req);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const auth = await requireAuth(req);
    if (!auth.authenticated || !auth.userId) {
      return new Response(JSON.stringify({ error: auth.error }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    const body = await req.json() as {
      documentType: 'nda' | 'fee_agreement';
      recipientEmail?: string;
      recipientName?: string;
      firmId?: string;
    };
    const { documentType, recipientEmail: overrideEmail, recipientName: overrideName, firmId: overrideFirmId } = body;
    if (!documentType || !['nda', 'fee_agreement'].includes(documentType)) {
      return new Response(JSON.stringify({ error: 'Invalid documentType' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    const userId = auth.userId;
    const correlationId = crypto.randomUUID();

    console.log(`[request-agreement-email] START | type=${documentType} | caller=${userId} | correlationId=${correlationId}`);

    // Check if caller is admin
    const { data: callerRole } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .in('role', ['admin', 'owner'])
      .maybeSingle();
    const isAdmin = !!callerRole;

    let buyerEmail: string;
    let buyerName: string;
    let firmId: string | null;
    let targetUserId: string = userId;
    let adminId: string | null = null;

    if (isAdmin && overrideEmail) {
      adminId = userId;
      buyerEmail = overrideEmail;
      buyerName = overrideName || overrideEmail;
      firmId = overrideFirmId || null;

      // For admin-triggered sends, try to resolve the buyer's user_id
      if (!firmId) {
        const { data: buyerProfile } = await supabaseAdmin
          .from('profiles')
          .select('id')
          .eq('email', overrideEmail)
          .maybeSingle();
        if (buyerProfile) {
          targetUserId = buyerProfile.id;
          const { data: firmIdResult } = await supabaseAdmin.rpc('resolve_user_firm_id', { p_user_id: buyerProfile.id });
          firmId = firmIdResult;
        } else {
          // No matching platform user — keep targetUserId as null marker
          targetUserId = userId; // admin is the actor, not the target
        }
      }

      if (!firmId) {
        if (targetUserId !== userId) {
          const { data: healProfile } = await supabaseAdmin
            .from('profiles').select('email, company').eq('id', targetUserId).maybeSingle();
          const healResult = await selfHealFirm(supabaseAdmin, targetUserId, {
            email: healProfile?.email ?? overrideEmail,
            company: healProfile?.company,
          });
          firmId = healResult?.firmId ?? null;
        }
        if (!firmId && overrideFirmId) firmId = overrideFirmId;
        if (!firmId) {
          return new Response(JSON.stringify({ error: 'No firm found for this buyer.' }), {
            status: 404,
            headers: { 'Content-Type': 'application/json', ...corsHeaders },
          });
        }
      }
    } else {
      const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('email, first_name, last_name, company')
        .eq('id', userId)
        .single();

      if (!profile?.email) {
        return new Response(JSON.stringify({ error: 'Profile not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }

      buyerName = [profile.first_name, profile.last_name].filter(Boolean).join(' ') || profile.email;
      buyerEmail = profile.email;

      const { data: firmIdResult } = await supabaseAdmin.rpc('resolve_user_firm_id', { p_user_id: userId });
      firmId = firmIdResult;

      if (!firmId) {
        const healResult = await selfHealFirm(supabaseAdmin, userId, {
          email: profile.email,
          company: profile.company,
        });
        firmId = healResult?.firmId ?? null;
      }

      if (!firmId) {
        return new Response(JSON.stringify({ error: 'No firm found. Please contact support.' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }
    }

    // Check if already signed
    const { data: firm } = await supabaseAdmin
      .from('firm_agreements')
      .select('nda_status, fee_agreement_status')
      .eq('id', firmId)
      .single();

    const statusCol = documentType === 'nda' ? 'nda_status' : 'fee_agreement_status';
    if (firm && (firm as Record<string, unknown>)[statusCol] === 'signed') {
      console.log(`[request-agreement-email] Already signed | type=${documentType} | firmId=${firmId}`);
      return new Response(JSON.stringify({ success: true, alreadySigned: true, message: 'Document already signed.' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    // Insert document request with correlation tracking
    const { data: docRequest, error: insertErr } = await supabaseAdmin
      .from('document_requests')
      .insert({
        firm_id: firmId,
        user_id: targetUserId,
        agreement_type: documentType,
        status: 'requested',
        requested_at: new Date().toISOString(),
        recipient_email: buyerEmail,
        recipient_name: buyerName,
        requested_by_admin_id: adminId,
        email_correlation_id: correlationId,
      })
      .select('id')
      .single();

    if (insertErr) {
      console.error('[request-agreement-email] Insert error:', insertErr);
    }

    console.log(`[request-agreement-email] Request created | requestId=${docRequest?.id} | recipient=${buyerEmail} | firmId=${firmId} | correlationId=${correlationId}`);

    const docLabel = documentType === 'nda' ? 'NDA (Non-Disclosure Agreement)' : 'Fee Agreement';
    const docFileName = documentType === 'nda' ? 'NDA.docx' : 'FeeAgreement.docx';

    // Fetch the actual document to attach (same approach as legacy send-nda-email)
    let attachmentList: Array<{ name: string; content: string }> = [];
    let downloadLink = '';
    try {
      const { data: fileData, error: fileErr } = await supabaseAdmin.storage
        .from('agreement-templates')
        .download(docFileName);
      if (!fileErr && fileData) {
        const arrayBuffer = await fileData.arrayBuffer();
        const base64Content = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
        attachmentList = [{ name: docFileName, content: base64Content }];
        console.log(`[request-agreement-email] Attached ${docFileName} (${arrayBuffer.byteLength} bytes)`);
      } else {
        console.warn(`[request-agreement-email] Could not download ${docFileName}: ${fileErr?.message}`);
        const { data: docUrl } = supabaseAdmin.storage.from('agreement-templates').getPublicUrl(docFileName);
        if (docUrl?.publicUrl) {
          downloadLink = `<p style="margin:20px 0; text-align:center;">
            <a href="${docUrl.publicUrl}" style="background:#1e293b;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:500;display:inline-block;">
              Download ${docLabel} Document
            </a>
          </p>`;
        }
      }
    } catch (dlErr) {
      console.warn('[request-agreement-email] Attachment fetch error:', dlErr);
    }

    // Use the same sender identity as known-working notification emails
    const senderEmail = Deno.env.get('SENDER_EMAIL') || 'notifications@sourcecodeals.com';

    // Send email via Brevo — matching the proven sender pattern
    const emailResult = await sendViaBervo({
      to: buyerEmail,
      toName: buyerName,
      subject: `Your ${docLabel} from SourceCo`,
      senderEmail,
      senderName: 'SourceCo',
      replyToEmail: 'adam.haile@sourcecodeals.com',
      replyToName: 'Adam Haile',
      isTransactional: true,
      attachment: attachmentList.length > 0 ? attachmentList : undefined,
      htmlContent: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #0E101A; margin-bottom: 16px;">Your ${docLabel}</h2>
          <p style="color: #555; line-height: 1.6;">Hi ${buyerName},</p>
          <p style="color: #555; line-height: 1.6;">
            Thank you for your interest in working with SourceCo. ${attachmentList.length > 0 ? 'Please find the document attached to this email.' : downloadLink ? 'Please download your document using the button below.' : 'Your document will be sent to you shortly by our team.'}
          </p>
          ${downloadLink}
          <p style="color: #555; line-height: 1.6;">
            <strong>To complete the signing process:</strong>
          </p>
          <ol style="color: #555; line-height: 1.8;">
            <li>Review the document carefully</li>
            <li>Sign where indicated</li>
            <li>Reply to this email with the signed copy attached</li>
          </ol>
          <p style="color: #555; line-height: 1.6;">
            If you have any questions or need modifications, simply reply to this email and we'll get back to you promptly.
          </p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
          <p style="color: #999; font-size: 12px;">
            SourceCo Deals &middot; adam.haile@sourcecodeals.com
          </p>
        </div>
      `,
    });

    // Log delivery to email_delivery_logs
    console.log(`[request-agreement-email] Brevo result | success=${emailResult.success} | messageId=${emailResult.messageId || 'none'} | error=${emailResult.error || 'none'} | correlationId=${correlationId}`);

    await logEmailDelivery(supabaseAdmin, {
      email: buyerEmail,
      emailType: `agreement_${documentType}`,
      status: emailResult.success ? 'sent' : 'failed',
      correlationId,
      errorMessage: emailResult.error,
    });

    // Update document request with provider details
    if (docRequest?.id) {
      const updatePayload: Record<string, unknown> = {
        status: emailResult.success ? 'email_sent' : 'requested',
        email_sent_at: emailResult.success ? new Date().toISOString() : null,
        email_provider_message_id: emailResult.messageId || null,
        last_email_error: emailResult.error || null,
      };

      await supabaseAdmin
        .from('document_requests')
        .update(updatePayload)
        .eq('id', docRequest.id);
    }

    // Update firm_agreements: request timestamp + canonical status to 'sent'
    const now = new Date().toISOString();
    const requestedAtCol = documentType === 'nda' ? 'nda_requested_at' : 'fee_agreement_requested_at';
    const requestedByCol = documentType === 'nda' ? 'nda_requested_by' : 'fee_agreement_requested_by';
    const sentAtCol = documentType === 'nda' ? 'nda_sent_at' : 'fee_agreement_sent_at';
    const emailSentAtCol = documentType === 'nda' ? 'nda_email_sent_at' : 'fee_agreement_email_sent_at';

    const firmUpdate: Record<string, unknown> = {
      [requestedAtCol]: now,
      [requestedByCol]: userId,
    };

    if (emailResult.success) {
      firmUpdate[statusCol] = 'sent';
      firmUpdate[sentAtCol] = now;
      firmUpdate[emailSentAtCol] = now;
    }

    await supabaseAdmin
      .from('firm_agreements')
      .update(firmUpdate)
      .eq('id', firmId);

    // Notify all admins
    try {
      const { data: adminRoles } = await supabaseAdmin
        .from('user_roles')
        .select('user_id')
        .in('role', ['admin', 'owner']);

      const admins = (adminRoles || []).map((r: { user_id: string }) => r.user_id);
      if (admins.length > 0) {
        const notifications = admins.map((adminId: string) => ({
          admin_id: adminId,
          notification_type: 'document_signing_requested',
          title: `${docLabel} Requested`,
          message: `${buyerName} (${buyerEmail}) has requested their ${docLabel}. Check your email inbox.`,
          user_id: targetUserId,
          metadata: { firm_id: firmId, document_type: documentType, request_id: docRequest?.id, correlation_id: correlationId },
        }));
        await supabaseAdmin.from('admin_notifications').insert(notifications);
      }
    } catch (err) {
      console.warn('[request-agreement-email] Admin notification error:', err);
    }

    if (!emailResult.success) {
      console.error(`[request-agreement-email] FAILED | recipient=${buyerEmail} | type=${documentType} | error=${emailResult.error} | correlationId=${correlationId}`);
      return new Response(JSON.stringify({
        success: false,
        error: 'Failed to send email. Our team has been notified. Please try again later.',
        correlationId,
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    console.log(`[request-agreement-email] SUCCESS | recipient=${buyerEmail} | type=${documentType} | brevoMessageId=${emailResult.messageId} | correlationId=${correlationId}`);

    return new Response(JSON.stringify({
      success: true,
      message: `${docLabel} sent to ${buyerEmail}. Check your inbox and reply with the signed copy.`,
      correlationId,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });

  } catch (err) {
    console.error('[request-agreement-email] Error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
});
