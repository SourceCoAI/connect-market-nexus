import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';
import { sendEmail } from '../_shared/email-sender.ts';
import { wrapEmailHtml } from '../_shared/email-template-wrapper.ts';

interface NewOwnerNotificationRequest {
  dealId: string;
  dealTitle: string;
  listingTitle?: string;
  companyName?: string;
  newOwnerName: string;
  newOwnerEmail: string;
  buyerName?: string;
  buyerEmail?: string;
  buyerCompany?: string;
  assignedByName?: string;
}

const handler = async (req: Request): Promise<Response> => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(req);
  }

  try {
    const {
      dealId, dealTitle, listingTitle, companyName, newOwnerName, newOwnerEmail,
      buyerName, buyerEmail, buyerCompany, assignedByName,
    }: NewOwnerNotificationRequest = await req.json();

    const subject = `New Deal Assigned: ${dealTitle}`;

    const htmlContent = wrapEmailHtml({
      bodyHtml: `
        <p style="margin: 0 0 16px;">Hi ${newOwnerName},</p>
        <p style="margin: 0 0 16px;">You have been assigned as the owner of <strong>${dealTitle}</strong>${assignedByName ? ` by ${assignedByName}` : ''}.</p>
        <div style="background: #F7F6F3; padding: 20px; border-radius: 6px; margin: 0 0 20px;">
          <p style="font-weight: 600; margin: 0 0 12px;">Deal Information</p>
          ${companyName ? `<p style="margin: 0 0 8px; font-size: 14px;"><strong>Company:</strong> ${companyName}</p>` : ''}
          <p style="margin: 0 0 8px; font-size: 14px;"><strong>Contact:</strong> ${dealTitle}</p>
          ${listingTitle ? `<p style="margin: 0 0 8px; font-size: 14px;"><strong>Listing:</strong> ${listingTitle}</p>` : ''}
          ${buyerName ? `<p style="margin: 0 0 8px; font-size: 14px;"><strong>Buyer:</strong> ${buyerName}${buyerEmail ? ` (${buyerEmail})` : ''}</p>` : ''}
          ${buyerCompany ? `<p style="margin: 0 0 8px; font-size: 14px;"><strong>Buyer Company:</strong> ${buyerCompany}</p>` : ''}
        </div>
        <div style="text-align: center; margin: 28px 0;">
          <a href="https://marketplace.sourcecodeals.com/admin/deals/pipeline?deal=${dealId}" style="background-color: #000000; color: #ffffff; font-size: 14px; font-weight: 600; text-decoration: none; display: inline-block; padding: 14px 28px; border-radius: 6px;">View Deal Details</a>
        </div>
        <div style="background: #F7F6F3; padding: 16px; border-radius: 6px;">
          <p style="font-weight: 600; margin: 0 0 8px; font-size: 14px;">Your Responsibilities</p>
          <ul style="margin: 0; padding-left: 20px; font-size: 14px; line-height: 1.6;">
            <li>Review the deal details and buyer information</li>
            <li>Follow up with the buyer in a timely manner</li>
            <li>Keep the deal status and stage updated in the pipeline</li>
            <li>Document important communications and next steps</li>
          </ul>
        </div>`,
      preheader: `You have been assigned a new deal: ${dealTitle}`,
      recipientEmail: newOwnerEmail,
    });

    console.log('Sending new owner notification to:', newOwnerEmail);

    const result = await sendEmail({
      templateName: 'notify_new_deal_owner',
      to: newOwnerEmail,
      toName: newOwnerName,
      subject,
      htmlContent,
      isTransactional: true,
    });

    if (!result.success) {
      throw new Error(result.error || 'Failed to send email');
    }

    console.log('Email sent successfully to new owner:', result.providerMessageId);

    return new Response(JSON.stringify({ success: true, messageId: result.providerMessageId }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    console.error('Error sending new owner notification:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
};

serve(handler);
