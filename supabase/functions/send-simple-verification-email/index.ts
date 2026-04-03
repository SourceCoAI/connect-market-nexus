import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4';

import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';
import { requireAdmin } from '../_shared/auth.ts';
import { sendEmail } from '../_shared/email-sender.ts';
import { wrapEmailHtml } from '../_shared/email-template-wrapper.ts';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
);

interface EmailRequest {
  email: string;
  firstName?: string;
  lastName?: string;
}

const handler = async (req: Request): Promise<Response> => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(req);
  }

  try {
    const auth = await requireAdmin(req, supabase);
    if (!auth.isAdmin) {
      return new Response(JSON.stringify({ error: auth.error }), {
        status: auth.authenticated ? 403 : 401,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    const { email, firstName = '', lastName = '' }: EmailRequest = await req.json();

    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: 'recovery',
      email: email,
      options: { redirectTo: 'https://marketplace.sourcecodeals.com/' },
    });

    if (linkError || !linkData.properties?.action_link) {
      throw new Error('Failed to generate verification link');
    }

    const verificationLink = linkData.properties.action_link;
    const displayName = firstName && lastName ? `${firstName} ${lastName}` : firstName || 'Valued User';

    const textContent = `Hi ${displayName},

We want to apologize for the delay in your email verification. Due to some technical problems with our email delivery system over the past few days, some verification emails were not delivered as expected.

These technical issues have now been resolved, and we're personally ensuring that all affected users receive their verification emails.

Please verify your email address via the link below:

What happens next:
- Our team will pre-approved your account and you'll get access within 30 minutes of verifying your email address
- You'll receive an email confirmation once your access is granted
- After approval, you'll have complete access to browse off-market listings

Please verify your email below:
${verificationLink}

Questions? Reply back to this email.

Thank you for your patience.

Adam Haile
SourceCo
adam.haile@sourcecodeals.com`;

    const result = await sendEmail({
      templateName: 'verification',
      to: email,
      toName: displayName,
      subject: 'Email Verification - Technical Issue Resolved',
      htmlContent: wrapEmailHtml({
        bodyHtml: `<div style="white-space: pre-wrap;">${textContent}</div>`,
        preheader: 'Your email verification link is ready',
        recipientEmail: email,
      }),
      textContent,
      senderName: 'Adam Haile',
      replyTo: 'adam.haile@sourcecodeals.com',
      isTransactional: true,
    });

    if (!result.success) {
      throw new Error(result.error || 'Failed to send email');
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Verification email sent successfully',
        messageId: result.providerMessageId,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    );
  } catch (error: unknown) {
    console.error('Error in simple verification email function:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    );
  }
};

serve(handler);
