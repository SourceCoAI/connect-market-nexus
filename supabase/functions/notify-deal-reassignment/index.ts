import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { sendEmail } from '../_shared/email-sender.ts';
import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';
import { wrapEmailHtml } from '../_shared/email-template-wrapper.ts';

interface DealReassignmentRequest {
  dealId: string;
  dealTitle: string;
  listingTitle?: string;
  companyName?: string;
  previousOwnerId: string;
  previousOwnerName: string;
  previousOwnerEmail: string;
  newOwnerId?: string;
  newOwnerName?: string;
  newOwnerEmail?: string;
}

const handler = async (req: Request): Promise<Response> => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(req);
  }

  try {
    const {
      dealId, dealTitle, listingTitle, companyName,
      previousOwnerName, previousOwnerEmail,
      newOwnerId, newOwnerName, newOwnerEmail,
    }: DealReassignmentRequest = await req.json();

    const subject = newOwnerId
      ? `Deal "${dealTitle}" has been reassigned`
      : `Deal "${dealTitle}" has been unassigned`;

    const htmlContent = wrapEmailHtml({
      bodyHtml: `
        <p>Hi ${previousOwnerName},</p>
        <p>${newOwnerId ? `Your deal has been reassigned to ${newOwnerName}.` : 'Your deal has been unassigned.'}</p>
        <div style="background: #F7F6F3; padding: 24px; margin: 24px 0;">
          ${companyName ? `<p style="margin: 0 0 4px; font-size: 14px; color: #6B6B6B;">Company: ${companyName}</p>` : ''}
          <p style="margin: 0 0 4px; font-size: 14px; color: #6B6B6B;">Deal: ${dealTitle}</p>
          ${listingTitle ? `<p style="margin: 0 0 4px; font-size: 14px; color: #6B6B6B;">Listing: ${listingTitle}</p>` : ''}
          <p style="margin: 0 0 4px; font-size: 14px; color: #6B6B6B;">Previous Owner: ${previousOwnerName}</p>
          ${newOwnerId ? `<p style="margin: 0; font-size: 14px; color: #6B6B6B;">New Owner: ${newOwnerName} (${newOwnerEmail})</p>` : ''}
        </div>
        <div style="text-align: center; margin: 28px 0;">
          <a href="https://marketplace.sourcecodeals.com/admin/deals/pipeline?deal=${dealId}" style="background: #000000; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 14px; display: inline-block;">Open Deal in Pipeline</a>
        </div>`,
      preheader: `Deal "${dealTitle}" has been ${newOwnerId ? 'reassigned' : 'unassigned'}`,
      recipientEmail: previousOwnerEmail,
    });

    const result = await sendEmail({
      templateName: 'deal_reassignment',
      to: previousOwnerEmail,
      toName: previousOwnerName,
      subject,
      htmlContent,
      isTransactional: true,
      metadata: { dealId },
    });

    if (!result.success) {
      throw new Error(result.error || 'Failed to send email');
    }

    console.log('Deal reassignment notification sent successfully:', result.providerMessageId);

    return new Response(
      JSON.stringify({ success: true, message_id: result.providerMessageId, recipient: previousOwnerEmail }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error: unknown) {
    console.error('Error in notify-deal-reassignment:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    );
  }
};

serve(handler);
