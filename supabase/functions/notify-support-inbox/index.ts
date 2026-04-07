/**
 * notify-support-inbox — Send a notification email to support@sourcecodeals.com
 * whenever a buyer sends a message, requests documents, or an admin replies.
 *
 * Fire-and-forget from client. Lightweight, no auth required (verify_jwt=false).
 */

import { getCorsHeaders } from '../_shared/cors.ts';
import { sendEmail, SUPPORT_REPLY_TO, NOREPLY_SENDER_EMAIL, NOREPLY_SENDER_NAME } from '../_shared/email-sender.ts';
import { wrapEmailHtml } from '../_shared/email-template-wrapper.ts';


const SUPPORT_EMAIL = 'support@sourcecodeals.com';
const ADMIN_BASE = 'https://marketplace.sourcecodeals.com/admin';

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const {
      type,
      buyerName,
      buyerEmail,
      dealTitle,
      messagePreview,
      documentType,
      adminName,
    } = await req.json();

    if (!type || !buyerName) {
      return new Response(
        JSON.stringify({ error: 'type and buyerName are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    let subject = '';
    let bodyHtml = '';
    let ctaUrl = '';
    let ctaLabel = '';

    const deal = dealTitle || 'General';

    switch (type) {
      case 'new_message': {
        subject = `New Message from ${buyerName} re: ${deal}`;
        const preview = messagePreview
          ? `<p style="margin:16px 0 0;padding:16px;background:#F5F5F3;font-size:14px;line-height:1.6;color:#333;">${escapeHtml(messagePreview)}</p>`
          : '';
        bodyHtml = `
          <p style="margin:0 0 8px;font-size:15px;"><strong>${escapeHtml(buyerName)}</strong>${buyerEmail ? ` (${escapeHtml(buyerEmail)})` : ''} sent a message about <strong>${escapeHtml(deal)}</strong>.</p>
          ${preview}
        `;
        ctaUrl = `${ADMIN_BASE}/messages`;
        ctaLabel = 'View in Message Center';
        break;
      }

      case 'document_request': {
        const docLabel = documentType === 'nda' ? 'NDA' : documentType === 'fee_agreement' ? 'Fee Agreement' : (documentType || 'Documents');
        subject = `${buyerName} requested ${docLabel}`;
        bodyHtml = `
          <p style="margin:0 0 8px;font-size:15px;"><strong>${escapeHtml(buyerName)}</strong>${buyerEmail ? ` (${escapeHtml(buyerEmail)})` : ''} has requested their <strong>${escapeHtml(docLabel)}</strong>.</p>
          <p style="margin:8px 0 0;font-size:14px;color:#666;">Please prepare and send the document at your earliest convenience.</p>
        `;
        ctaUrl = `${ADMIN_BASE}/documents`;
        ctaLabel = 'View Document Tracking';
        break;
      }

      case 'admin_reply': {
        const admin = adminName || 'An admin';
        subject = `${admin} replied to ${buyerName} re: ${deal}`;
        bodyHtml = `
          <p style="margin:0 0 8px;font-size:15px;"><strong>${escapeHtml(admin)}</strong> replied to <strong>${escapeHtml(buyerName)}</strong> about <strong>${escapeHtml(deal)}</strong>.</p>
          ${messagePreview ? `<p style="margin:16px 0 0;padding:16px;background:#F5F5F3;font-size:14px;line-height:1.6;color:#333;">${escapeHtml(messagePreview)}</p>` : ''}
        `;
        ctaUrl = `${ADMIN_BASE}/messages`;
        ctaLabel = 'View in Message Center';
        break;
      }

      default:
        return new Response(
          JSON.stringify({ error: `Unknown type: ${type}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
    }

    const ctaHtml = `
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0 0;">
        <tr><td style="background:#000;padding:12px 28px;">
          <a href="${ctaUrl}" style="color:#fff;text-decoration:none;font-family:'Montserrat','Helvetica Neue',Arial,sans-serif;font-size:14px;font-weight:600;letter-spacing:0.02em;">${ctaLabel}</a>
        </td></tr>
      </table>
    `;

    const fullHtml = wrapEmailHtml({
      bodyHtml: bodyHtml + ctaHtml,
      preheader: subject,
      showFooter: false,
    });

    await sendEmail({
      templateName: 'support-inbox-notification',
      to: SUPPORT_EMAIL,
      subject,
      htmlContent: fullHtml,
      replyTo: SUPPORT_REPLY_TO,
      senderName: NOREPLY_SENDER_NAME,
      senderEmail: NOREPLY_SENDER_EMAIL,
    });

    return new Response(
      JSON.stringify({ ok: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('notify-support-inbox error:', err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
