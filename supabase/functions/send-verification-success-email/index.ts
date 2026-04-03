import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';
import { sendEmail } from '../_shared/email-sender.ts';
import { wrapEmailHtml } from '../_shared/email-template-wrapper.ts';

interface VerificationSuccessRequest {
  email: string;
  firstName: string;
  lastName: string;
}

function buildVerificationSuccessHtml(userName: string, loginUrl: string, email: string): string {
  return wrapEmailHtml({
    bodyHtml: `
    <p>Hi ${userName},</p>
    <p>Your email address has been verified.</p>
    <p>Our team will review your account within 24 hours during business days. You will receive an email once approved with full marketplace access.</p>
    <p style="font-weight: 600; margin: 24px 0 8px 0;">Your registration progress</p>
    <table style="width: 100%; border-collapse: collapse; margin: 0 0 24px 0;">
      <tr><td style="padding: 8px 12px; font-size: 14px; color: #1A1A1A;">Account created</td><td style="padding: 8px 12px; font-size: 14px; color: #1A1A1A; text-align: right;">Complete</td></tr>
      <tr><td style="padding: 8px 12px; font-size: 14px; color: #1A1A1A;">Email verified</td><td style="padding: 8px 12px; font-size: 14px; color: #1A1A1A; text-align: right;">Complete</td></tr>
      <tr><td style="padding: 8px 12px; font-size: 14px; color: #6B6B6B;">Admin approval</td><td style="padding: 8px 12px; font-size: 14px; color: #6B6B6B; text-align: right;">Pending</td></tr>
      <tr><td style="padding: 8px 12px; font-size: 14px; color: #6B6B6B;">Start browsing deals</td><td style="padding: 8px 12px; font-size: 14px; color: #6B6B6B; text-align: right;">Pending</td></tr>
    </table>
    <p>While you wait, log in and complete your profile.</p>
    <div style="text-align: center; margin: 32px 0;">
      <a href="${loginUrl}" style="display: inline-block; background: #000000; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 15px;">Log In</a>
    </div>`,
    preheader: 'Your email has been verified. Next step: admin review.',
    recipientEmail: email,
  });
}

const handler = async (req: Request): Promise<Response> => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') return corsPreflightResponse(req);

  try {
    const { email, firstName, lastName }: VerificationSuccessRequest = await req.json();
    if (!email) throw new Error('Email is required');

    const userName = firstName && lastName ? `${firstName} ${lastName}` : firstName || 'there';
    const loginUrl = 'https://marketplace.sourcecodeals.com/login';

    const result = await sendEmail({
      templateName: 'verification_success',
      to: email,
      toName: userName,
      subject: 'Email verified. Next step: admin review.',
      htmlContent: buildVerificationSuccessHtml(userName, loginUrl, email),
      textContent: `Email verified.\n\nHi ${userName}, your email address has been verified.\n\nOur team will review your account within 24 hours.\n\nLog in: ${loginUrl}\n\nThe SourceCo Team`,
      senderName: 'SourceCo',
      replyTo: 'support@sourcecodeals.com',
      isTransactional: true,
    });

    if (!result.success) throw new Error(result.error);

    return new Response(JSON.stringify({ success: true, messageId: result.providerMessageId }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  } catch (error: unknown) {
    console.error('Error in send-verification-success-email:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error), success: false }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    );
  }
};

serve(handler);
