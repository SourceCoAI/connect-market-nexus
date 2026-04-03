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
      ? `🔄 Your deal "${dealTitle}" has been reassigned`
      : `📌 Your deal "${dealTitle}" has been unassigned`;

    const htmlContent = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: white; padding: 30px; border-radius: 12px; margin-bottom: 20px;">
          <h1 style="margin: 0; font-size: 24px; font-weight: 600;">Deal Reassignment Notice</h1>
          <p style="margin: 10px 0 0 0; opacity: 0.9;">FYI: A deal you own has been reassigned</p>
        </div>
        <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 16px; border-radius: 4px; margin-bottom: 20px;">
          <p style="margin: 0; color: #78350f; font-weight: 500;">
            Hi ${previousOwnerName}, ${newOwnerId ? `your deal has been reassigned to ${newOwnerName}` : 'your deal has been unassigned'}.
          </p>
        </div>
        <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
          <h2 style="margin: 0 0 15px 0; color: #1e293b; font-size: 18px;">Deal Information</h2>
          <table style="width: 100%; border-collapse: collapse;">
            ${companyName ? `<tr><td style="padding: 8px 0; color: #475569; font-weight: 500;">Company:</td><td style="padding: 8px 0; color: #1e293b; font-weight: 600;">${companyName}</td></tr>` : ''}
            <tr><td style="padding: 8px 0; color: #475569; font-weight: 500;">Deal Title:</td><td style="padding: 8px 0; color: #1e293b;">${dealTitle}</td></tr>
            ${listingTitle ? `<tr><td style="padding: 8px 0; color: #475569; font-weight: 500;">Listing:</td><td style="padding: 8px 0; color: #1e293b;">${listingTitle}</td></tr>` : ''}
            <tr><td style="padding: 8px 0; color: #475569; font-weight: 500;">Previous Owner:</td><td style="padding: 8px 0; color: #1e293b;">${previousOwnerName}</td></tr>
            ${newOwnerId ? `<tr><td style="padding: 8px 0; color: #475569; font-weight: 500;">New Owner:</td><td style="padding: 8px 0; color: #1e293b;">${newOwnerName} (${newOwnerEmail})</td></tr>` : ''}
          </table>
        </div>
        <div style="text-align: center; margin: 30px 0;">
          <a href="https://marketplace.sourcecodeals.com/admin/deals/pipeline?deal=${dealId}" style="background: #f59e0b; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px; display: inline-block;">Open Deal in Pipeline</a>
        </div>
        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e2e8f0; color: #64748b; font-size: 12px; text-align: center;">
          <p style="margin: 0;">This is an automated notification from SourceCo Pipeline</p>
        </div>
      </div>
    `;

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
