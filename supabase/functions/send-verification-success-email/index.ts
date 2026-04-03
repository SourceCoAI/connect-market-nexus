import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';
import { sendEmail } from '../_shared/email-sender.ts';

interface VerificationSuccessRequest {
  email: string;
  firstName: string;
  lastName: string;
}

function buildVerificationSuccessHtml(userName: string, loginUrl: string): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
<body style="margin: 0; padding: 0; background-color: #ffffff; font-family: 'Montserrat', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <div style="max-width: 600px; margin: 0 auto; padding: 40px 24px;">
    <div style="margin-bottom: 32px;">
      <div style="font-size: 11px; font-weight: 600; letter-spacing: 1.2px; color: #9A9A9A; text-transform: uppercase; margin-bottom: 8px;">SOURCECO</div>
    </div>
    <h1 style="color: #0E101A; font-size: 20px; font-weight: 700; margin: 0 0 24px 0; line-height: 1.4;">Email Verified Successfully</h1>
    <div style="color: #3A3A3A; font-size: 15px; line-height: 1.7;">
      <p style="margin: 0 0 16px 0;">Great news, <strong>${userName}</strong>! Your email address has been successfully verified.</p>
      <div style="background: #FCF9F0; border-left: 4px solid #DEC76B; padding: 16px; border-radius: 0 8px 8px 0; margin: 0 0 24px 0;">
        <p style="margin: 0 0 4px 0; font-size: 12px; color: #9A9A9A; font-weight: 600;">WHAT HAPPENS NEXT</p>
        <p style="margin: 0; color: #3A3A3A; font-size: 14px;">Our team will review your account within 24 hours during business days. You'll receive an email once approved with full marketplace access.</p>
      </div>
      <p style="margin: 0 0 8px 0; font-weight: 600;">Your Registration Progress</p>
      <table style="width: 100%; border-collapse: collapse; margin: 0 0 24px 0;">
        <tr><td style="padding: 8px 12px; font-size: 14px; color: #10b981;">✓ Account Created</td></tr>
        <tr><td style="padding: 8px 12px; font-size: 14px; color: #10b981;">✓ Email Verified</td></tr>
        <tr><td style="padding: 8px 12px; font-size: 14px; color: #9A9A9A;">⏳ Admin Approval (pending)</td></tr>
        <tr><td style="padding: 8px 12px; font-size: 14px; color: #9A9A9A;">⏳ Start Browsing Deals</td></tr>
      </table>
      <p style="margin: 0 0 24px 0;">While you wait, feel free to log in and complete your profile.</p>
    </div>
    <div style="text-align: center; margin: 32px 0;">
      <a href="${loginUrl}" style="display: inline-block; background: #0E101A; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px;">Log In to Your Account</a>
    </div>
    <div style="margin-top: 48px; padding-top: 24px; border-top: 1px solid #E5DDD0;">
      <p style="color: #9A9A9A; font-size: 12px; margin: 0;">This is an automated notification from SourceCo. If you have questions, email us at adam.haile@sourcecodeals.com</p>
    </div>
  </div>
</body>
</html>`;
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
      subject: "Email Verified Successfully — What's Next",
      htmlContent: buildVerificationSuccessHtml(userName, loginUrl),
      textContent: `Email Verified Successfully!\n\nGreat news, ${userName}! Your email address has been verified.\n\nWhat happens next?\n- Our team will review your account within 24 hours.\n- You'll receive an email once approved.\n\nLog in: ${loginUrl}\n\n— The SourceCo Team`,
      senderName: 'SourceCo',
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
