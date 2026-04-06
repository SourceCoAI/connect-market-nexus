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
      subject = "Your account is active. Full access is live.";
      htmlContent = wrapEmailHtml({
        bodyHtml: `
  <p>Hi ${firstName},</p>
  <p>Your account is approved and your NDA is on file. You have full access to the deal pipeline now.</p>
  <p style="margin: 24px 0;"><a href="${siteUrl}/marketplace" style="display: inline-block; background-color: #000000; color: #ffffff; padding: 14px 28px; border-radius: 6px; text-decoration: none; font-weight: 600;">Browse Deals</a></p>
  <p style="font-weight: 600; margin: 24px 0 8px 0;">Before you submit your first request</p>
  <ul style="padding-left: 20px; line-height: 1.8;">
    <li>Every deal is off-market. You will not find these anywhere else.</li>
    <li>We introduce a small number of buyers per deal. Tell us specifically why you are a strong fit. Generic messages rarely get selected.</li>
    <li>Before your first introduction, you will need a Fee Agreement in place. It is success-only. Nothing is owed unless a deal closes. You can request it anytime from any listing page, or reply to this email.</li>
  </ul>
  <p>Questions? Reply to this email.</p>
  <p style="color: #6B6B6B; margin-top: 32px;">The SourceCo Team</p>`,
        preheader: 'Your NDA is on file. Browse deals and request introductions now.',
        recipientEmail: email,
      });
      textContent = `Hi ${firstName},\n\nYour SourceCo account is approved and your NDA is on file. You have full access now.\n\nBrowse deals: ${siteUrl}/marketplace\n\nQuestions? Reply to this email.\n\nThe SourceCo Team`;
    } else {
      subject = "Welcome to SourceCo — Your account is approved";
      htmlContent = wrapEmailHtml({
        bodyHtml: `
  <p>Hi ${firstName},</p>
  <p>Your account has been approved. You now have access to our curated pipeline of off-market acquisition opportunities.</p>
  <p style="margin: 24px 0;"><a href="${siteUrl}/marketplace" style="display: inline-block; background-color: #000000; color: #ffffff; padding: 14px 28px; border-radius: 6px; text-decoration: none; font-weight: 600;">Browse the Marketplace</a></p>
  <p style="font-weight: 600; margin: 24px 0 8px 0;">Unlock full access</p>
  <p>To view full deal details, access data rooms, and request introductions, you will need to sign two standard documents: an NDA and a Fee Agreement. You can request these from your profile or any listing page. It takes about 60 seconds.</p>
  <p style="font-weight: 600; margin: 24px 0 8px 0;">A few things to know</p>
  <ul style="padding-left: 20px; line-height: 1.8;">
    <li>Every deal on SourceCo is off-market. You will not find these anywhere else.</li>
    <li>We introduce a small number of buyers per deal. When you request an introduction, tell us specifically why you are a strong fit. Generic messages rarely get selected.</li>
    <li>The Fee Agreement is success-only. Nothing is owed unless a deal closes. It covers every introduction we make on your behalf.</li>
  </ul>
  <p>Questions? Reply to this email.</p>
  <p style="color: #6B6B6B; margin-top: 32px;">The SourceCo Team</p>`,
        preheader: 'Your account is approved. Browse off-market acquisition opportunities now.',
        recipientEmail: email,
      });
      textContent = `Hi ${firstName},\n\nYour account has been approved. You now have access to our curated pipeline of off-market acquisition opportunities.\n\nBrowse the Marketplace: ${siteUrl}/marketplace\n\nTo unlock full access, sign your NDA and Fee Agreement from your profile or any listing page.\n\nQuestions? Reply to this email.\n\nThe SourceCo Team`;
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
