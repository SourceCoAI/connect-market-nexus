import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4';
import { sendViaBervo } from '../_shared/brevo-sender.ts';
import { logEmailDelivery } from '../_shared/email-logger.ts';
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
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin: 0; padding: 0; background-color: #ffffff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <div style="max-width: 600px; margin: 0 auto; padding: 40px 24px;">
    <!-- Header -->
    <div style="margin-bottom: 32px;">
      <div style="font-size: 11px; font-weight: 600; letter-spacing: 0.8px; color: #94a3b8; text-transform: uppercase; margin-bottom: 8px;">
        SOURCECO
      </div>
    </div>

    <!-- Subject Line -->
    <h1 style="color: #0f172a; font-size: 20px; font-weight: 700; margin: 0 0 24px 0; line-height: 1.4;">
      Regarding Your Interest in ${companyName}
    </h1>

    <!-- Body -->
    <div style="color: #334155; font-size: 15px; line-height: 1.7;">
      <p style="margin: 0 0 16px 0;">
        Thank you for your interest in ${companyName}.
      </p>

      <p style="margin: 0 0 16px 0;">
        After careful review, this opportunity is no longer available for your profile at this time. We are intentional about limiting buyer introductions so that every connection made is a genuine fit for both sides &mdash; and we've noted your interest should anything change.
      </p>

      <p style="margin: 0 0 16px 0;">
        We're committed to finding you the right match.
      </p>

      <p style="margin: 24px 0 4px 0;">
        Sincerely,
      </p>
      <p style="margin: 0; font-weight: 600;">
        The SourceCo Team
      </p>
    </div>

    <!-- Footer -->
    <div style="margin-top: 48px; padding-top: 24px; border-top: 1px solid #e2e8f0; text-align: center;">
      <p style="color: #94a3b8; font-size: 12px; margin: 0;">
        This is an automated notification from SourceCo
      </p>
    </div>
  </div>
</body>
</html>`;
}

function buildPlainText(buyerName: string, companyName: string): string {
  return `Regarding Your Interest in ${companyName}

Thank you for your interest in ${companyName}.

After careful review, this opportunity is no longer available for your profile at this time. We are intentional about limiting buyer introductions so that every connection made is a genuine fit for both sides — and we've noted your interest should anything change.

We're committed to finding you the right match.

Sincerely,
The SourceCo Team`;
}

const handler = async (req: Request): Promise<Response> => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(req);
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const { connectionRequestId, buyerEmail, buyerName, companyName }: BuyerRejectionRequest =
      await req.json();

    if (!buyerEmail || !companyName) {
      return new Response(
        JSON.stringify({ success: false, error: 'buyerEmail and companyName are required' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    // Idempotency check: skip if rejection email already sent for this connection request
    if (connectionRequestId) {
      const { data: existingEmail } = await supabase
        .from('email_delivery_logs')
        .select('id')
        .eq('correlation_id', `buyer-rejection-${connectionRequestId}`)
        .eq('status', 'sent')
        .maybeSingle();

      if (existingEmail) {
        console.log("[notify-buyer-rejection] Already sent for connectionRequestId:", connectionRequestId);
        return new Response(
          JSON.stringify({ success: true, message: "Rejection email already sent", duplicate: true }),
          { headers: { "Content-Type": "application/json", ...corsHeaders } },
        );
      }
    }

    const subject = `Regarding Your Interest in ${companyName}`;
    const htmlContent = buildRejectionHtml(buyerName, companyName);
    const textContent = buildPlainText(buyerName, companyName);
    const correlationId = `buyer-rejection-${connectionRequestId || crypto.randomUUID()}`;

    // Idempotency check: skip if a rejection email with this correlationId was already sent
    const { data: existingLog } = await supabase
      .from('email_delivery_logs')
      .select('id')
      .eq('correlation_id', correlationId)
      .eq('status', 'sent')
      .limit(1)
      .maybeSingle();

    if (existingLog) {
      console.log(
        '[notify-buyer-rejection] Skipping duplicate rejection email for correlationId:',
        correlationId,
      );
      return new Response(
        JSON.stringify({
          success: true,
          skipped: true,
          message: 'Rejection email already sent',
          correlation_id: correlationId,
        }),
        { headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    console.log(
      '[notify-buyer-rejection] Sending rejection email to:',
      buyerEmail,
      'for:',
      companyName,
    );

    const result = await sendViaBervo({
      to: buyerEmail,
      toName: buyerName,
      subject,
      htmlContent,
      textContent,
      senderName: 'SourceCo',
      senderEmail: Deno.env.get('SENDER_EMAIL') || 'support@sourcecodeals.com',
      replyToEmail: Deno.env.get('SENDER_EMAIL') || 'adam.haile@sourcecodeals.com',
      replyToName: Deno.env.get('SENDER_NAME') || 'Adam Haile',
    });

    // Log the delivery attempt
    await logEmailDelivery(supabase, {
      email: buyerEmail,
      emailType: 'buyer_rejection',
      status: result.success ? 'sent' : 'failed',
      correlationId,
      errorMessage: result.success ? undefined : result.error,
    });

    if (!result.success) {
      console.error('[notify-buyer-rejection] Failed to send:', result.error);
      throw new Error(result.error || 'Failed to send rejection email');
    }

    console.log('[notify-buyer-rejection] Email sent successfully:', result.messageId);

    return new Response(
      JSON.stringify({
        success: true,
        message_id: result.messageId,
        recipient: buyerEmail,
        correlation_id: correlationId,
      }),
      { headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    );
  } catch (error: unknown) {
    console.error('[notify-buyer-rejection] Error:', error);

    return new Response(JSON.stringify({ success: false, error: error instanceof Error ? error.message : String(error) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
};

serve(handler);
