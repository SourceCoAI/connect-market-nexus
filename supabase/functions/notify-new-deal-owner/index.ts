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

    const htmlContent = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); padding: 32px 24px; border-radius: 8px; margin-bottom: 24px;">
          <div style="font-size: 11px; font-weight: 600; letter-spacing: 0.8px; color: #94a3b8; margin: 0 0 8px 0; text-transform: uppercase;">SOURCECO PIPELINE</div>
          <h1 style="color: #ffffff; font-size: 24px; font-weight: 700; margin: 0; line-height: 1.3;">New Deal Assigned to You</h1>
          <p style="color: #cbd5e1; font-size: 14px; margin: 8px 0 0 0;">You've been assigned as the owner of a deal</p>
        </div>
        <div style="background: #eff6ff; border-left: 4px solid #3b82f6; padding: 16px 20px; border-radius: 4px; margin-bottom: 24px;">
          <p style="margin: 0; color: #1e40af; font-weight: 500; font-size: 14px;">
            Hi ${newOwnerName}, you've been assigned as the owner of "${dealTitle}"${assignedByName ? ` by ${assignedByName}` : ''}.
          </p>
        </div>
        <div style="background: #f8fafc; padding: 24px; border-radius: 8px; margin-bottom: 24px; border: 1px solid #e2e8f0;">
          <h2 style="margin: 0 0 16px 0; color: #0f172a; font-size: 16px; font-weight: 700;">Deal Information</h2>
          ${companyName ? `
          <table style="width: 100%; margin-bottom: 12px;">
            <tr>
              <td style="color: #64748b; font-size: 13px; font-weight: 500; padding-right: 16px; vertical-align: top; width: 120px;">Company</td>
              <td style="color: #0f172a; font-size: 14px; font-weight: 600;">${companyName}</td>
            </tr>
          </table>
          ` : ''}
          <table style="width: 100%; margin-bottom: 12px;">
            <tr>
              <td style="color: #64748b; font-size: 13px; font-weight: 500; padding-right: 16px; vertical-align: top; width: 120px;">Contact</td>
              <td style="color: #0f172a; font-size: 14px; font-weight: 600;">${dealTitle}</td>
            </tr>
          </table>
          ${listingTitle ? `
          <table style="width: 100%; margin-bottom: 12px;">
            <tr>
              <td style="color: #64748b; font-size: 13px; font-weight: 500; padding-right: 16px; vertical-align: top; width: 120px;">Listing</td>
              <td style="color: #0f172a; font-size: 14px; font-weight: 600;">${listingTitle}</td>
            </tr>
          </table>
          ` : ''}
          ${buyerName ? `
          <table style="width: 100%; margin-bottom: 12px;">
            <tr>
              <td style="color: #64748b; font-size: 13px; font-weight: 500; padding-right: 16px; vertical-align: top; width: 120px;">Buyer</td>
              <td style="color: #0f172a; font-size: 14px; font-weight: 600;">
                ${buyerName}
                ${buyerEmail ? `<span style="color: #64748b; font-weight: 400;"> • ${buyerEmail}</span>` : ''}
              </td>
            </tr>
          </table>
          ` : ''}
          ${buyerCompany ? `
          <table style="width: 100%; margin-bottom: 12px;">
            <tr>
              <td style="color: #64748b; font-size: 13px; font-weight: 500; padding-right: 16px; vertical-align: top; width: 120px;">Buyer Company</td>
              <td style="color: #0f172a; font-size: 14px; font-weight: 600;">${buyerCompany}</td>
            </tr>
          </table>
          ` : ''}
        </div>
        <div style="text-align: center; margin-bottom: 32px;">
          <a href="https://marketplace.sourcecodeals.com/admin/deals/pipeline?deal=${dealId}"
             style="background-color: #d7b65c; color: #ffffff; font-size: 14px; font-weight: 600; text-decoration: none; text-align: center; display: inline-block; padding: 12px 32px; border-radius: 6px;">
            View Deal Details
          </a>
        </div>
        <div style="background: #fffbeb; padding: 20px; border-radius: 8px; margin-bottom: 24px; border: 1px solid #fde68a;">
          <h3 style="margin: 0 0 8px 0; color: #92400e; font-size: 14px; font-weight: 700;">Your Responsibilities:</h3>
          <ul style="margin: 0; padding-left: 20px; color: #78350f; font-size: 13px; line-height: 1.6;">
            <li>Review the deal details and buyer information</li>
            <li>Follow up with the buyer in a timely manner</li>
            <li>Keep the deal status and stage updated in the pipeline</li>
            <li>Document important communications and next steps</li>
          </ul>
        </div>
        <div style="color: #94a3b8; font-size: 12px; line-height: 20px; text-align: center; margin-top: 24px;">
          This is an automated notification from SourceCo Pipeline
          <br />
          <span style="color: #cbd5e1; font-size: 11px;">Deal ID: ${dealId}</span>
        </div>
      </div>
    `;

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
