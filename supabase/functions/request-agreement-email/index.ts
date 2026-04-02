import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.10';
import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';
import { requireAuth } from '../_shared/auth.ts';
import { selfHealFirm } from '../_shared/firm-self-heal.ts';
import { sendViaBervo } from '../_shared/brevo-sender.ts';

/**
 * request-agreement-email
 * Sends NDA or Fee Agreement via email.
 * Updates both document_requests (ops queue) and firm_agreements (canonical status).
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
        const healResult = await selfHealFirm(supabaseAdmin, userId);
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
      return new Response(JSON.stringify({ success: true, alreadySigned: true, message: 'Document already signed.' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    // Insert document request with recipient tracking
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
      })
      .select('id')
      .single();

    if (insertErr) {
      console.error('[request-agreement-email] Insert error:', insertErr);
    }

    const docLabel = documentType === 'nda' ? 'NDA (Non-Disclosure Agreement)' : 'Fee Agreement';
    const pdfFileName = documentType === 'nda' ? 'NDA.pdf' : 'FeeAgreement.pdf';
    const { data: pdfUrl } = supabaseAdmin.storage
      .from('agreement-templates')
      .getPublicUrl(pdfFileName);

    const downloadLink = pdfUrl?.publicUrl
      ? `<p style="margin:20px 0; text-align:center;">
          <a href="${pdfUrl.publicUrl}" style="background:#1e293b;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:500;display:inline-block;">
            Download ${docLabel}
          </a>
        </p>`
      : '';

    // Send email via Brevo
    const emailResult = await sendViaBervo({
      to: buyerEmail,
      toName: buyerName,
      subject: `Your ${docLabel} from SourceCo`,
      senderEmail: 'support@sourcecodeals.com',
      senderName: 'SourceCo',
      replyToEmail: 'support@sourcecodeals.com',
      replyToName: 'SourceCo Support',
      isTransactional: true,
      htmlContent: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #0E101A; margin-bottom: 16px;">Your ${docLabel}</h2>
          <p style="color: #555; line-height: 1.6;">Hi ${buyerName},</p>
          <p style="color: #555; line-height: 1.6;">
            Thank you for your interest in working with SourceCo. ${downloadLink ? 'Please download your document using the button below.' : 'Your document will be sent to you shortly by our team.'}
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
            SourceCo Deals &middot; support@sourcecodeals.com
          </p>
        </div>
      `,
    });

    // Update document request status
    if (docRequest?.id) {
      await supabaseAdmin
        .from('document_requests')
        .update({
          status: emailResult.success ? 'email_sent' : 'requested',
          email_sent_at: emailResult.success ? new Date().toISOString() : null,
        })
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
          metadata: { firm_id: firmId, document_type: documentType, request_id: docRequest?.id },
        }));
        await supabaseAdmin.from('admin_notifications').insert(notifications);
      }
    } catch (err) {
      console.warn('[request-agreement-email] Admin notification error:', err);
    }

    if (!emailResult.success) {
      console.error('[request-agreement-email] Email send failed:', emailResult.error);
      return new Response(JSON.stringify({
        success: false,
        error: 'Failed to send email. Our team has been notified. Please try again later.',
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    return new Response(JSON.stringify({
      success: true,
      message: `${docLabel} sent to ${buyerEmail}. Check your inbox and reply with the signed copy.`,
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
