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
      dealId,
      dealTitle,
      listingTitle,
      companyName,
      newOwnerName,
      newOwnerEmail,
      buyerName,
      buyerEmail,
      buyerCompany,
      assignedByName,
    }: NewOwnerNotificationRequest = await req.json();

    const subject = `✨ New Deal Assigned: ${dealTitle}`;

    const htmlContent = wrapEmailHtml({
      bodyHtml: `
        <div style="background: #eff6ff; border-left: 4px solid #3b82f6; padding: 16px 20px; border-radius: 4px; margin-bottom: 24px;">
          <p style="margin: 0; color: #1e40af; font-weight: 500; font-size: 14px;">
            Hi ${newOwnerName}, you've been assigned as the owner of "${dealTitle}"${assignedByName ? ` by ${assignedByName}` : ''}.
          </p>
        </div>
        <div style="background: #f8fafc; padding: 24px; border-radius: 8px; margin-bottom: 24px; border: 1px solid #e2e8f0;">
          <h2 style="margin: 0 0 16px 0; color: #0f172a; font-size: 16px; font-weight: 700;">Deal Information</h2>
          ${companyName ? `<p style="margin: 0 0 8px 0; font-size: 13px;"><span style="color: #64748b;">Company:</span> <strong style="color: #0f172a;">${companyName}</strong></p>` : ''}
          <p style="margin: 0 0 8px 0; font-size: 13px;"><span style="color: #64748b;">Contact:</span> <strong style="color: #0f172a;">${dealTitle}</strong></p>
          ${listingTitle ? `<p style="margin: 0 0 8px 0; font-size: 13px;"><span style="color: #64748b;">Listing:</span> <strong style="color: #0f172a;">${listingTitle}</strong></p>` : ''}
          ${buyerName ? `<p style="margin: 0 0 8px 0; font-size: 13px;"><span style="color: #64748b;">Buyer:</span> <strong style="color: #0f172a;">${buyerName}${buyerEmail ? ` • ${buyerEmail}` : ''}</strong></p>` : ''}
          ${buyerCompany ? `<p style="margin: 0 0 8px 0; font-size: 13px;"><span style="color: #64748b;">Buyer Company:</span> <strong style="color: #0f172a;">${buyerCompany}</strong></p>` : ''}
        </div>
        <div style="text-align: center; margin-bottom: 32px;">
          <a href="https://marketplace.sourcecodeals.com/admin/deals/pipeline?deal=${dealId}" style="background-color: #1a1a2e; color: #ffffff; font-size: 14px; font-weight: 600; text-decoration: none; display: inline-block; padding: 12px 32px; border-radius: 6px;">View Deal Details</a>
        </div>
        <div style="background: #fffbeb; padding: 20px; border-radius: 8px; border: 1px solid #fde68a;">
          <h3 style="margin: 0 0 8px 0; color: #92400e; font-size: 14px; font-weight: 700;">Your Responsibilities:</h3>
          <ul style="margin: 0; padding-left: 20px; color: #78350f; font-size: 13px; line-height: 1.6;">
            <li>Review the deal details and buyer information</li>
            <li>Follow up with the buyer in a timely manner</li>
            <li>Keep the deal status and stage updated in the pipeline</li>
            <li>Document important communications and next steps</li>
          </ul>
        </div>`,
      preheader: `You've been assigned a new deal: ${dealTitle}`,
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
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }
};

serve(handler);
