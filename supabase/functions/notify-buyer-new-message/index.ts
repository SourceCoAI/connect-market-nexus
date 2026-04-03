/**
 * Edge function: notify-buyer-new-message
 *
 * Sends an email notification to a buyer when an admin sends them
 * a new message in a deal thread. Looks up the buyer's email and
 * deal title from the connection_request_id, then sends via Brevo.
 *
 * Called from the frontend after an admin message is successfully inserted.
 */

import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4';
import { sendViaBervo } from '../_shared/brevo-sender.ts';
import { logEmailDelivery } from '../_shared/email-logger.ts';
import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';
import { requireAuth, escapeHtml, escapeHtmlWithBreaks } from '../_shared/auth.ts';

interface NewMessageNotificationRequest {
  connection_request_id: string;
  message_preview: string;
}

function buildMessageNotificationHtml(
  buyerName: string,
  dealTitle: string,
  messagePreview: string,
  loginUrl: string,
): string {
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
      <div style="font-size: 11px; font-weight: 600; letter-spacing: 1.2px; color: #9A9A9A; text-transform: uppercase; margin-bottom: 8px;">
        SOURCECO
      </div>
    </div>

    <!-- Subject Line -->
    <h1 style="color: #0E101A; font-size: 20px; font-weight: 700; margin: 0 0 24px 0; line-height: 1.4;">
      New Message Regarding ${escapeHtml(dealTitle)}
    </h1>

    <!-- Body -->
    <div style="color: #3A3A3A; font-size: 15px; line-height: 1.7;">
      <p style="margin: 0 0 16px 0;">
        Hi ${escapeHtml(buyerName)},
      </p>

      <p style="margin: 0 0 16px 0;">
        You have a new message from the SourceCo team regarding <strong>${escapeHtml(dealTitle)}</strong>.
      </p>

      <!-- Message preview -->
      <div style="background: #FCF9F0; border-left: 4px solid #DEC76B; padding: 16px; border-radius: 0 8px 8px 0; margin: 0 0 24px 0;">
        <p style="margin: 0; color: #3A3A3A; font-size: 14px; font-style: italic;">
          "${escapeHtmlWithBreaks(messagePreview)}"
        </p>
      </div>

      <p style="margin: 0 0 24px 0;">
        Log in to your dashboard to view the full message and reply.
      </p>
    </div>

    <!-- CTA -->
    <div style="text-align: center; margin: 32px 0;">
      <a href="${loginUrl}"
         style="display: inline-block; background: #0E101A; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px;">
        View Message
      </a>
    </div>

    <!-- Footer -->
    <div style="margin-top: 48px; padding-top: 24px; border-top: 1px solid #E5DDD0;">
      <p style="color: #9A9A9A; font-size: 12px; margin: 0;">
        This is an automated notification from SourceCo. You received this because an admin sent you a message on the SourceCo Marketplace.
      </p>
    </div>
  </div>
</body>
</html>`;
}

function buildPlainText(
  buyerName: string,
  dealTitle: string,
  messagePreview: string,
  loginUrl: string,
): string {
  return `Hi ${buyerName},

You have a new message from the SourceCo team regarding ${dealTitle}.

"${messagePreview}"

Log in to your dashboard to view the full message and reply:
${loginUrl}

--
This is an automated notification from SourceCo.`;
}

const handler = async (req: Request): Promise<Response> => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(req);
  }

  try {
    // AUTH: Requires authenticated user (admin sending message)
    const auth = await requireAuth(req);
    if (!auth.authenticated) {
      return new Response(JSON.stringify({ error: auth.error }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    const { connection_request_id, message_preview }: NewMessageNotificationRequest =
      await req.json();

    if (!connection_request_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'connection_request_id is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    // Look up the connection request to get buyer info and listing title
    const { data: request, error: reqError } = await supabase
      .from('connection_requests')
      .select(
        `
        id, user_id, listing_id,
        user:profiles!connection_requests_user_id_profiles_fkey(first_name, last_name, email),
        listing:listings!connection_requests_listing_id_fkey(title)
      `,
      )
      .eq('id', connection_request_id)
      .single();

    if (reqError || !request) {
      console.error('[notify-buyer-new-message] Failed to look up connection request:', reqError);
      return new Response(
        JSON.stringify({ success: false, error: 'Connection request not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    const buyer = request.user as { first_name?: string; last_name?: string; email?: string } | null;
    const listing = request.listing as { title?: string } | null;

    if (!buyer?.email) {
      console.error(
        '[notify-buyer-new-message] Buyer email not found for request:',
        connection_request_id,
      );
      return new Response(JSON.stringify({ success: false, error: 'Buyer email not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    const buyerName = `${buyer.first_name || ''} ${buyer.last_name || ''}`.trim() || 'there';
    const dealTitle = listing?.title || 'a deal';
    const preview = (message_preview || '').substring(0, 200);
    const loginUrl = 'https://marketplace.sourcecodeals.com/my-requests';
    const correlationId = `admin-message-${connection_request_id}-${Date.now()}`;

    console.log(
      '[notify-buyer-new-message] Sending notification to:',
      buyer.email,
      'for deal:',
      dealTitle,
    );

    const subject = `New message from SourceCo re: ${escapeHtml(dealTitle)}`;
    const htmlContent = buildMessageNotificationHtml(buyerName, dealTitle, preview, loginUrl);
    const textContent = buildPlainText(buyerName, dealTitle, preview, loginUrl);

    const result = await sendViaBervo({
      to: buyer.email,
      toName: buyerName,
      subject,
      htmlContent,
      textContent,
      senderName: 'SourceCo',
      senderEmail: Deno.env.get('SENDER_EMAIL') || 'adam.haile@sourcecodeals.com',
      replyToEmail: Deno.env.get('SENDER_EMAIL') || 'adam.haile@sourcecodeals.com',
      replyToName: Deno.env.get('SENDER_NAME') || 'Adam Haile',
    });

    // Log the delivery attempt
    await logEmailDelivery(supabase, {
      email: buyer.email,
      emailType: 'admin_message_notification',
      status: result.success ? 'sent' : 'failed',
      correlationId,
      errorMessage: result.success ? undefined : result.error,
    });

    if (!result.success) {
      console.error('[notify-buyer-new-message] Failed to send:', result.error);
      throw new Error(result.error || 'Failed to send message notification email');
    }

    console.log('[notify-buyer-new-message] Email sent successfully:', result.messageId);

    return new Response(
      JSON.stringify({
        success: true,
        message_id: result.messageId,
        recipient: buyer.email,
        correlation_id: correlationId,
      }),
      { headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    );
  } catch (error: unknown) {
    console.error('[notify-buyer-new-message] Error:', error);

    return new Response(JSON.stringify({ success: false, error: error instanceof Error ? error.message : String(error) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
};

serve(handler);
