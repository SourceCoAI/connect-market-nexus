import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';
import { sendEmail } from '../_shared/email-sender.ts';
import { wrapEmailHtml } from '../_shared/email-template-wrapper.ts';

interface OwnerInquiryNotification {
  name: string;
  email: string;
  phone: string;
  companyName: string;
  businessWebsite: string | null;
  revenueRange: string;
  saleTimeline: string;
  message: string | null;
}

const formatRevenueRange = (range: string): string => {
  const labels: Record<string, string> = {
    under_1m: 'Under $1M', '1m_5m': '$1M - $5M', '5m_10m': '$5M - $10M',
    '10m_25m': '$10M - $25M', '25m_50m': '$25M - $50M', '50m_plus': '$50M+',
  };
  return labels[range] || range;
};

const formatSaleTimeline = (timeline: string): string => {
  const labels: Record<string, string> = {
    actively_exploring: 'Actively exploring now', within_6_months: 'Within 6 months',
    '6_12_months': '6-12 months', '1_2_years': '1-2 years', just_exploring: 'Just exploring',
  };
  return labels[timeline] || timeline;
};

const handler = async (req: Request): Promise<Response> => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') return corsPreflightResponse(req);

  try {
    const data: OwnerInquiryNotification = await req.json();
    console.log('Sending owner inquiry notification for:', data.companyName);

    const htmlContent = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #6d2c36 0%, #8b3a47 100%); color: white; padding: 30px; border-radius: 12px; margin-bottom: 20px;">
          <h1 style="margin: 0; font-size: 24px; font-weight: 600;">🏢 New Owner Inquiry</h1>
          <p style="margin: 10px 0 0 0; opacity: 0.9;">A business owner has submitted an inquiry through the /sell form.</p>
        </div>
        <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
          <h2 style="margin: 0 0 15px 0; color: #1e293b; font-size: 18px;">Contact Information</h2>
          <div style="margin-bottom: 12px;"><strong style="color: #475569;">Name:</strong> ${data.name}</div>
          <div style="margin-bottom: 12px;"><strong style="color: #475569;">Email:</strong> <a href="mailto:${data.email}" style="color: #6d2c36;">${data.email}</a></div>
          <div style="margin-bottom: 12px;"><strong style="color: #475569;">Phone:</strong> <a href="tel:${data.phone}" style="color: #6d2c36;">${data.phone}</a></div>
          <div style="margin-bottom: 12px;"><strong style="color: #475569;">Company:</strong> ${data.companyName}</div>
          ${data.businessWebsite ? `<div style="margin-bottom: 12px;"><strong style="color: #475569;">Website:</strong> <a href="${data.businessWebsite}" target="_blank" style="color: #6d2c36;">${data.businessWebsite}</a></div>` : ''}
        </div>
        <div style="background: #fef3c7; padding: 20px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #f59e0b;">
          <h2 style="margin: 0 0 15px 0; color: #1e293b; font-size: 18px;">Business Details</h2>
          <div style="margin-bottom: 12px;"><strong style="color: #475569;">Estimated Revenue:</strong> ${formatRevenueRange(data.revenueRange)}</div>
          <div style="margin-bottom: 12px;"><strong style="color: #475569;">Sale Timeline:</strong> ${formatSaleTimeline(data.saleTimeline)}</div>
        </div>
        ${data.message ? `
        <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
          <h2 style="margin: 0 0 15px 0; color: #1e293b; font-size: 18px;">Message</h2>
          <div style="background: white; padding: 15px; border-radius: 6px; border-left: 4px solid #6d2c36;">${data.message.replace(/\n/g, '<br>')}</div>
        </div>` : ''}
        <div style="text-align: center; margin: 30px 0;">
          <a href="https://marketplace.sourcecodeals.com/admin/marketplace/users" style="background: #6d2c36; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 500;">View in Admin Dashboard</a>
        </div>
        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e2e8f0; color: #64748b; font-size: 14px;">
          <p>This notification was sent automatically when a business owner submitted an inquiry through the /sell form.</p>
        </div>
      </div>`;

    const recipientEmail = Deno.env.get('OWNER_INQUIRY_RECIPIENT_EMAIL') || 'adam.haile@sourcecodeals.com';

    const result = await sendEmail({
      templateName: 'owner_inquiry',
      to: recipientEmail,
      toName: Deno.env.get('OWNER_INQUIRY_RECIPIENT_NAME') || 'Adam Haile',
      subject: `🏢 New Owner Inquiry: ${data.companyName} (${formatRevenueRange(data.revenueRange)})`,
      htmlContent,
      senderName: 'SourceCo Marketplace',
      replyTo: data.email,
      isTransactional: true,
    });

    if (!result.success) throw new Error(result.error || 'Failed to send notification');

    return new Response(JSON.stringify({ success: true, message: 'Notification sent' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200,
    });
  } catch (error: unknown) {
    console.error('Error in send-owner-inquiry-notification:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) || 'Failed to send notification' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 },
    );
  }
};

serve(handler);
