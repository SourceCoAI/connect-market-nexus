import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4';
import { sendEmail } from '../_shared/email-sender.ts';
import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';

interface BuyerRejectionRequest {
  connectionRequestId: string;
  buyerEmail: string;
  buyerName: string;
  companyName: string;
}

function buildRejectionHtml(buyerName: string, companyName: string): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
<body style="margin: 0; padding: 0; background-color: #ffffff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <div style="max-width: 600px; margin: 0 auto; padding: 40px 24px;">
    <div style="margin-bottom: 32px;">
      <div style="font-size: 11px; font-weight: 600; letter-spacing: 0.8px; color: #94a3b8; text-transform: uppercase; margin-bottom: 8px;">SOURCECO</div>
    </div>
    <h1 style="color: #0f172a; font-size: 20px; font-weight: 700; margin: 0 0 24px 0; line-height: 1.4;">Regarding Your Interest in ${companyName}</h1>
    <div style="color: #334155; font-size: 15px; line-height: 1.7;">
      <p style="margin: 0 0 16px 0;">Thank you for your interest in ${companyName}.</p>
      <p style="margin: 0 0 16px 0;">After careful review, this opportunity is no longer available for your profile at this time. We are intentional about limiting buyer introductions so that every connection made is a genuine fit for both sides &mdash; and we've noted your interest should anything change.</p>
      <p style="margin: 0 0 16px 0;">We're committed to finding you the right match.</p>
      <p style="margin: 24px 0 4px 0;">Sincerely,</p>
      <p style="margin: 0; font-weight: 600;">The SourceCo Team</p>
    </div>
    <div style="margin-top: 48px; padding-top: 24px; border-top: 1px solid #e2e8f0; text-align: center;">
      <p style="color: #94a3b8; font-size: 12px; margin: 0;">This is an automated notification from SourceCo</p>
    </div>
  </div>
</body>
</html>`;
}

const handler = async (req: Request): Promise<Response> => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') return corsPreflightResponse(req);

  try {
    const { connectionRequestId, buyerEmail, buyerName, companyName }: BuyerRejectionRequest = await req.json();

    if (!buyerEmail || !companyName) {
      return new Response(JSON.stringify({ success: false, error: 'buyerEmail and companyName are required' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }

    console.log('[notify-buyer-rejection] Sending rejection email to:', buyerEmail, 'for:', companyName);

    const subject = `Regarding Your Interest in ${companyName}`;
    const htmlContent = buildRejectionHtml(buyerName, companyName);
    const textContent = `Thank you for your interest in ${companyName}. After careful review, this opportunity is no longer available for your profile at this time. Sincerely, The SourceCo Team`;

    const result = await sendEmail({
      templateName: 'buyer_rejection',
      to: buyerEmail,
      toName: buyerName,
      subject,
      htmlContent,
      textContent,
      senderName: 'SourceCo',
      isTransactional: true,
      metadata: { connectionRequestId },
    });

    if (!result.success) {
      console.error('[notify-buyer-rejection] Failed to send:', result.error);
      throw new Error(result.error || 'Failed to send rejection email');
    }

    console.log('[notify-buyer-rejection] Email sent successfully:', result.providerMessageId);

    return new Response(
      JSON.stringify({ success: true, message_id: result.providerMessageId, recipient: buyerEmail, correlation_id: result.correlationId }),
      { headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    );
  } catch (error: unknown) {
    console.error('[notify-buyer-rejection] Error:', error);
    return new Response(JSON.stringify({ success: false, error: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }
};

serve(handler);
