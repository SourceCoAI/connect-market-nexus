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

    const htmlContent = wrapEmailHtml({
      bodyHtml: `
        <p style="font-size: 18px; font-weight: 600; margin: 0 0 20px;">New Owner Inquiry</p>
        <p style="margin: 0 0 16px;">A business owner has submitted an inquiry through the /sell form.</p>
        <div style="background: #F7F6F3; padding: 20px; border-radius: 6px; margin: 0 0 20px;">
          <p style="font-weight: 600; margin: 0 0 12px;">Contact Information</p>
          <div style="margin-bottom: 8px;"><strong>Name:</strong> ${data.name}</div>
          <div style="margin-bottom: 8px;"><strong>Email:</strong> <a href="mailto:${data.email}" style="color: #1A1A1A; text-decoration: underline;">${data.email}</a></div>
          <div style="margin-bottom: 8px;"><strong>Phone:</strong> <a href="tel:${data.phone}" style="color: #1A1A1A; text-decoration: underline;">${data.phone}</a></div>
          <div style="margin-bottom: 8px;"><strong>Company:</strong> ${data.companyName}</div>
          ${data.businessWebsite ? `<div style="margin-bottom: 8px;"><strong>Website:</strong> <a href="${data.businessWebsite}" target="_blank" style="color: #1A1A1A; text-decoration: underline;">${data.businessWebsite}</a></div>` : ''}
        </div>
        <div style="background: #F7F6F3; padding: 20px; border-radius: 6px; margin: 0 0 20px;">
          <p style="font-weight: 600; margin: 0 0 12px;">Business Details</p>
          <div style="margin-bottom: 8px;"><strong>Estimated Revenue:</strong> ${formatRevenueRange(data.revenueRange)}</div>
          <div style="margin-bottom: 8px;"><strong>Sale Timeline:</strong> ${formatSaleTimeline(data.saleTimeline)}</div>
        </div>
        ${data.message ? `
        <div style="background: #F7F6F3; padding: 20px; border-radius: 6px; margin: 0 0 20px;">
          <p style="font-weight: 600; margin: 0 0 12px;">Message</p>
          <p style="margin: 0;">${data.message.replace(/\n/g, '<br>')}</p>
        </div>` : ''}
        <div style="text-align: center; margin: 28px 0;">
          <a href="https://marketplace.sourcecodeals.com/admin/marketplace/users" style="background: #000000; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 14px; display: inline-block;">View in Admin Dashboard</a>
        </div>`,
      preheader: `New owner inquiry: ${data.companyName} (${formatRevenueRange(data.revenueRange)})`,
    });

    const recipientEmail = Deno.env.get('OWNER_INQUIRY_RECIPIENT_EMAIL') || 'adam.haile@sourcecodeals.com';

    const result = await sendEmail({
      templateName: 'owner_inquiry',
      to: recipientEmail,
      toName: Deno.env.get('OWNER_INQUIRY_RECIPIENT_NAME') || 'Adam Haile',
      subject: `New Owner Inquiry: ${data.companyName} (${formatRevenueRange(data.revenueRange)})`,
      htmlContent,
      senderName: 'SourceCo',
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
