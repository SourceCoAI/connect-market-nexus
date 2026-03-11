import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';
import { requireAdmin } from '../_shared/auth.ts';
import { logEmailDelivery } from '../_shared/email-logger.ts';

/**
 * send-templated-approval-email
 * Sends one of two approval email templates based on whether the buyer's NDA is already signed.
 * Version A: NDA not signed — includes NDA CTA
 * Version B: NDA signed — confirms full access
 *
 * Called by the admin approval flow. Falls back to the existing send-approval-email
 * if the admin wants to send a custom message instead.
 */

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
    const BREVO_API_KEY = Deno.env.get('BREVO_API_KEY');
    if (!BREVO_API_KEY) {
      throw new Error('BREVO_API_KEY is not configured');
    }

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Missing Supabase configuration');
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // AUTH: Admin-only
    const auth = await requireAdmin(req, supabase);
    if (!auth.isAdmin) {
      return new Response(JSON.stringify({ error: auth.error }), {
        status: auth.authenticated ? 403 : 401,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    const { userId, userEmail }: SendTemplatedApprovalRequest = await req.json();

    // Get user profile
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

    // Check NDA status via firm membership
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
      // Version B — NDA already signed
      subject = "You're in — full access is live.";
      htmlContent = `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #333; line-height: 1.6; max-width: 600px; margin: 0 auto; padding: 20px;">
  <p>Hi ${firstName},</p>
  <p>You're in. Your NDA is already on file — you have full access to the deal pipeline right now.</p>
  <p style="margin: 24px 0;"><a href="${siteUrl}/marketplace" style="display: inline-block; background-color: #1e293b; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 500;">Browse Deals</a></p>
  <h3 style="color: #0e101a; font-size: 16px; margin: 24px 0 8px 0;">Before you submit your first request</h3>
  <ul style="padding-left: 20px; color: #374151;">
    <li>Every deal is off-market — you won't find these anywhere else</li>
    <li>We introduce a small number of buyers per deal. Tell us specifically why you're a strong fit — generic messages rarely get selected</li>
    <li>Your first introduction request will prompt you to sign a fee agreement — success-only, nothing owed unless a deal closes, covers every introduction we make on your behalf</li>
  </ul>
  <p>Questions? Reply to this email.</p>
  <p style="color: #6b7280; margin-top: 32px;">&mdash; The SourceCo Team</p>
</div>`;
      textContent = `Hi ${firstName},

Your SourceCo account is approved and your NDA is already on file. You have full access right now.

Browse deals: ${siteUrl}/marketplace

A few things to know:
- We introduce 1-3 buyers per deal. When you request access, explain why you're a fit.
- All deals are off-market - you won't find these anywhere else.
- Our fee is success-only. You only pay if a deal closes.

Questions? Reply to this email.

— The SourceCo Team`;
    } else {
      // Version A — NDA not signed (most common)
      subject = "You're approved — one step to full access.";
      htmlContent = `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #333; line-height: 1.6; max-width: 600px; margin: 0 auto; padding: 20px;">
  <p>Hi ${firstName},</p>
  <p>You're approved.</p>
  <p>Before you can browse deal details and request introductions, you'll need to sign your NDA. It covers your use of the platform — one signature, and you're in for good. Takes about 60 seconds.</p>
  <p style="margin: 24px 0;"><a href="${siteUrl}/pending-approval" style="display: inline-block; background-color: #1e293b; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 500;">Sign Your NDA</a></p>
  <h3 style="color: #0e101a; font-size: 16px; margin: 24px 0 8px 0;">A few things to know before you start</h3>
  <ul style="padding-left: 20px; color: #374151;">
    <li>Every deal on SourceCo is off-market — you won't find these anywhere else</li>
    <li>We introduce a small number of buyers per deal. When you request an introduction, tell us specifically why you're a strong fit — generic messages rarely get selected</li>
    <li>Before your first introduction request, you'll be asked to sign a fee agreement. It's success-only — nothing owed unless a deal closes</li>
  </ul>
  <p>Questions? Reply to this email.</p>
  <p style="color: #6b7280; margin-top: 32px;">&mdash; The SourceCo Team</p>
</div>`;
      textContent = `Hi ${firstName}, you're approved. Sign your NDA to get full access: ${siteUrl}/pending-approval\n\nA few things to know:\n- Every deal is off-market\n- We introduce a small number of buyers per deal — be specific about why you're a fit\n- Your first introduction request will prompt a fee agreement — success-only, nothing owed unless a deal closes\n\nQuestions? Reply to this email.\n\n— The SourceCo Team`;
    }

    // Send via Brevo
    const emailResponse = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'api-key': BREVO_API_KEY,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        sender: {
          name: 'SourceCo',
          email: Deno.env.get('NOREPLY_EMAIL') || 'noreply@sourcecodeals.com',
        },
        to: [{ email, name: firstName }],
        subject,
        htmlContent,
        textContent,
      }),
    });

    const emailResult = await emailResponse.json();

    if (!emailResponse.ok) {
      console.error('Brevo API error:', emailResult);
      await logEmailDelivery(supabase, {
        email,
        emailType: 'templated_approval',
        status: 'failed',
        correlationId: crypto.randomUUID(),
        errorMessage: emailResult.message || 'Brevo API error',
      });
      throw new Error(`Email API error: ${emailResult.message || 'Unknown error'}`);
    }

    console.log('Templated approval email sent successfully:', emailResult);

    await logEmailDelivery(supabase, {
      email,
      emailType: 'templated_approval',
      status: 'sent',
      correlationId: crypto.randomUUID(),
    });

    return new Response(
      JSON.stringify({
        success: true,
        version: ndaSigned ? 'B_nda_signed' : 'A_nda_unsigned',
        messageId: emailResult.messageId || 'unknown',
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      },
    );
  } catch (error: unknown) {
    console.error('Error in send-templated-approval-email:', error);
    return new Response(
      JSON.stringify({
        error:
          error instanceof Error ? error.message : String(error) || 'Failed to send approval email',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      },
    );
  }
};

serve(handler);
