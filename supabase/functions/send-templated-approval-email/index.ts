import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';
import { requireAdmin } from '../_shared/auth.ts';
import { sendEmail } from '../_shared/email-sender.ts';
import { wrapEmailHtml } from '../_shared/email-template-wrapper.ts';

interface SendTemplatedApprovalRequest {
  userId: string;
  userEmail: string;
}

const handler = async (req: Request): Promise<Response> => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(req);
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Missing Supabase configuration');
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const auth = await requireAdmin(req, supabase);
    if (!auth.isAdmin) {
      return new Response(JSON.stringify({ error: auth.error }), {
        status: auth.authenticated ? 403 : 401,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    const { userId, userEmail }: SendTemplatedApprovalRequest = await req.json();

    const { data: profile } = await supabase
      .from('profiles')
      .select('first_name, last_name, email')
      .eq('id', userId)
      .single();

    const firstName = profile?.first_name || 'there';
    const email = userEmail || profile?.email;

    if (!email) {
      throw new Error('No email address found for user');
    }

    let ndaSigned = false;
    const { data: membership } = await supabase
      .from('firm_members')
      .select('firm_id')
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle();

    if (membership) {
      const { data: firm } = await supabase
        .from('firm_agreements')
        .select('nda_signed')
        .eq('id', membership.firm_id)
        .single();

      ndaSigned = firm?.nda_signed || false;
    }

    const siteUrl = Deno.env.get('SITE_URL') || 'https://marketplace.sourcecodeals.com';

    let subject: string;
    let htmlContent: string;
    let textContent: string;

    if (ndaSigned) {
      subject = "You're in — full access is live.";
      htmlContent = wrapEmailHtml({
        bodyHtml: `
  <p>Hi ${firstName},</p>
  <p>You're in. Your NDA is already on file — you have full access to the deal pipeline right now.</p>
  <p style="margin: 24px 0;"><a href="${siteUrl}/marketplace" style="display: inline-block; background-color: #1e293b; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 500;">Browse Deals</a></p>
  <h3 style="font-size: 16px; margin: 24px 0 8px 0;">Before you submit your first request</h3>
  <ul style="padding-left: 20px;">
    <li>Every deal is off-market — you won't find these anywhere else</li>
    <li>We introduce a small number of buyers per deal. Tell us specifically why you're a strong fit — generic messages rarely get selected</li>
    <li>Your first introduction request will prompt you to sign a fee agreement — success-only, nothing owed unless a deal closes, covers every introduction we make on your behalf</li>
  </ul>
  <p>Questions? Reply to this email.</p>
  <p style="color: #6b7280; margin-top: 32px;">&mdash; The SourceCo Team</p>`,
        preheader: 'Your NDA is on file. Browse deals and request introductions now.',
        recipientEmail: email,
      });
      textContent = `Hi ${firstName},\n\nYour SourceCo account is approved and your NDA is already on file. You have full access right now.\n\nBrowse deals: ${siteUrl}/marketplace\n\nQuestions? Reply to this email.\n\n— The SourceCo Team`;
    } else {
      subject = "You're approved — one step to full access.";
      htmlContent = wrapEmailHtml({
        bodyHtml: `
  <p>Hi ${firstName},</p>
  <p>You're approved.</p>
  <p>Before you can browse deal details and request introductions, you'll need to sign your NDA. It covers your use of the platform — one signature, and you're in for good. Takes about 60 seconds.</p>
  <p style="margin: 24px 0;"><a href="${siteUrl}/pending-approval" style="display: inline-block; background-color: #1e293b; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 500;">Sign Your NDA</a></p>
  <h3 style="font-size: 16px; margin: 24px 0 8px 0;">A few things to know before you start</h3>
  <ul style="padding-left: 20px;">
    <li>Every deal on SourceCo is off-market — you won't find these anywhere else</li>
    <li>We introduce a small number of buyers per deal. When you request an introduction, tell us specifically why you're a strong fit — generic messages rarely get selected</li>
    <li>Before your first introduction request, you'll be asked to sign a fee agreement. It's success-only — nothing owed unless a deal closes</li>
  </ul>
  <p>Questions? Reply to this email.</p>
  <p style="color: #6b7280; margin-top: 32px;">&mdash; The SourceCo Team</p>`,
        preheader: 'Sign your NDA in 60 seconds and the full deal pipeline is yours.',
        recipientEmail: email,
      });
      textContent = `Hi ${firstName}, you're approved. Sign your NDA to get full access: ${siteUrl}/pending-approval\n\nQuestions? Reply to this email.\n\n— The SourceCo Team`;
    }

    const result = await sendEmail({
      templateName: 'templated_approval',
      to: email,
      toName: firstName,
      subject,
      htmlContent,
      textContent,
      senderName: 'SourceCo',
      isTransactional: true,
      metadata: { userId, version: ndaSigned ? 'B_nda_signed' : 'A_nda_unsigned' },
    });

    if (!result.success) {
      throw new Error(`Email API error: ${result.error}`);
    }

    console.log('Templated approval email sent successfully:', result.providerMessageId);

    return new Response(
      JSON.stringify({
        success: true,
        version: ndaSigned ? 'B_nda_signed' : 'A_nda_unsigned',
        messageId: result.providerMessageId || 'unknown',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    );
  } catch (error: unknown) {
    console.error('Error in send-templated-approval-email:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : String(error) || 'Failed to send approval email',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    );
  }
};

serve(handler);
