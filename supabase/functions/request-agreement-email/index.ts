import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.10';
import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';
import { requireAuth } from '../_shared/auth.ts';
import { selfHealFirm } from '../_shared/firm-self-heal.ts';
import { sendViaBervo } from '../_shared/brevo-sender.ts';

/**
 * request-agreement-email
 * Buyer-facing: sends the NDA or Fee Agreement document via email.
 * Replaces get-buyer-nda-embed and get-buyer-fee-embed.
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

    // Auth: any authenticated user
    const auth = await requireAuth(req);
    if (!auth.authenticated || !auth.userId) {
      return new Response(JSON.stringify({ error: auth.error }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    const { documentType } = await req.json() as { documentType: 'nda' | 'fee_agreement' };
    if (!documentType || !['nda', 'fee_agreement'].includes(documentType)) {
      return new Response(JSON.stringify({ error: 'Invalid documentType' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    const userId = auth.userId;

    // Get user profile
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

    const buyerName = [profile.first_name, profile.last_name].filter(Boolean).join(' ') || profile.email;
    const buyerEmail = profile.email;

    // Resolve firm (with self-heal)
    const { data: firmIdResult } = await supabaseAdmin.rpc('resolve_user_firm_id', { p_user_id: userId });
    let firmId = firmIdResult;

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

    // Insert document request
    const { data: docRequest, error: insertErr } = await supabaseAdmin
      .from('document_requests')
      .insert({
        firm_id: firmId,
        user_id: userId,
        agreement_type: documentType,
        status: 'requested',
        requested_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (insertErr) {
      console.error('[request-agreement-email] Insert error:', insertErr);
    }

    // Build PDF download link if available in storage
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

    // Update firm_agreements with request timestamp
    const requestedAtCol = documentType === 'nda' ? 'nda_requested_at' : 'fee_agreement_requested_at';
    const requestedByCol = documentType === 'nda' ? 'nda_requested_by' : 'fee_agreement_requested_by';
    await supabaseAdmin
      .from('firm_agreements')
      .update({
        [requestedAtCol]: new Date().toISOString(),
        [requestedByCol]: userId,
      })
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
          user_id: userId,
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
