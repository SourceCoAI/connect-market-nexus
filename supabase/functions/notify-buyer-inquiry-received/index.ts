import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { sendEmail } from '../_shared/email-sender.ts';
import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';
import { escapeHtml, escapeHtmlWithBreaks } from '../_shared/auth.ts';
import { wrapEmailHtml } from '../_shared/email-template-wrapper.ts';

interface InquiryReceivedRequest {
  buyer_email: string;
  buyer_name: string;
  deal_title: string;
  message_preview: string;
}

function buildConfirmationHtml(buyerName: string, dealTitle: string, messagePreview: string, messagesUrl: string, buyerEmail: string): string {
  return wrapEmailHtml({
    bodyHtml: `
    <p>Hi ${escapeHtml(buyerName)},</p>
    <p>Thank you for reaching out about <strong>${escapeHtml(dealTitle)}</strong>. We have received your message and a team member will review it shortly.</p>
    <div style="background: #F7F6F3; padding: 20px; margin: 24px 0;">
      <p style="margin: 0; font-size: 14px; font-style: italic;">"${escapeHtmlWithBreaks(messagePreview)}"</p>
    </div>
    <p>When we respond, you will receive an email notification. Please reply directly on the platform to keep all communication in one place. Do not reply to this email.</p>
    <div style="text-align: center; margin: 28px 0;">
      <a href="${messagesUrl}" style="display: inline-block; background: #000000; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 14px;">Go to Messages</a>
    </div>`,
    preheader: `We received your message about ${escapeHtml(dealTitle)}`,
    recipientEmail: buyerEmail,
  });
}

const handler = async (req: Request): Promise<Response> => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') return corsPreflightResponse(req);

  try {
    const { buyer_email, buyer_name, deal_title, message_preview }: InquiryReceivedRequest = await req.json();

    if (!buyer_email) {
      return new Response(JSON.stringify({ success: false, error: 'buyer_email is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }

    const name = buyer_name || 'there';
    const title = deal_title || 'a deal';
    const preview = (message_preview || '').substring(0, 300);
    const messagesUrl = 'https://marketplace.sourcecodeals.com/messages';

    const subject = `We received your message about ${title}`;
    const htmlContent = buildConfirmationHtml(name, title, preview, messagesUrl, buyer_email);

    const result = await sendEmail({
      templateName: 'inquiry-received-confirmation',
      to: buyer_email,
      toName: name,
      subject,
      htmlContent,
      senderName: 'SourceCo Notifications',
      senderEmail: 'noreply@sourcecodeals.com',
      replyTo: 'noreply@sourcecodeals.com',
      isTransactional: true,
    });

    if (!result.success) throw new Error(result.error || 'Failed to send inquiry confirmation email');

    console.log('[notify-buyer-inquiry-received] Email sent to:', buyer_email, 'messageId:', result.providerMessageId);

    return new Response(
      JSON.stringify({ success: true, message_id: result.providerMessageId }),
      { headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    );
  } catch (error: unknown) {
    console.error('[notify-buyer-inquiry-received] Error:', error);
    return new Response(JSON.stringify({ success: false, error: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }
};

serve(handler);
