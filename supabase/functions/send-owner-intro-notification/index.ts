import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';
import { sendEmail } from '../_shared/email-sender.ts';
import { wrapEmailHtml } from '../_shared/email-template-wrapper.ts';

interface OwnerIntroRequest {
  dealId: string; listingId: string; buyerName: string; buyerEmail: string;
  buyerCompany?: string; dealValue?: number; dealTitle: string;
  dealOwnerName?: string; dealOwnerEmail?: string;
}

const handler = async (req: Request): Promise<Response> => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') return corsPreflightResponse(req);

  try {
    const { dealId, listingId, buyerName, buyerEmail, buyerCompany, dealValue, dealTitle: _dealTitle, dealOwnerName, dealOwnerEmail }: OwnerIntroRequest = await req.json();

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // Dedup check
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data: recentNotif } = await supabase.from('owner_intro_notifications').select('id').eq('deal_id', dealId).gte('created_at', fiveMinutesAgo).maybeSingle();
    if (recentNotif) {
      return new Response(JSON.stringify({ success: true, message: 'Notification already sent recently', duplicate: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data: deal, error: dealError } = await supabase.from('deal_pipeline').select(`id, title, listing:listings!deals_listing_id_fkey (id, title, internal_company_name, primary_owner_id, primary_owner:profiles!listings_primary_owner_id_fkey (id, email, first_name, last_name)), deal_owner:profiles!deals_assigned_to_fkey (id, email, first_name, last_name)`).eq('id', dealId).single();

    if (dealError || !deal) {
      return new Response(JSON.stringify({ success: false, error: 'Deal not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const listing = Array.isArray(deal.listing) ? deal.listing[0] : deal.listing;
    if (!listing) {
      return new Response(JSON.stringify({ success: false, error: 'Deal not linked to listing' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (!listing.primary_owner_id || !listing.primary_owner) {
      return new Response(JSON.stringify({ success: false, error: 'No primary owner configured' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const primaryOwnerData = Array.isArray(listing.primary_owner) ? listing.primary_owner[0] : listing.primary_owner;
    const ownerName = `${primaryOwnerData.first_name} ${primaryOwnerData.last_name}`.trim();
    const companyName = listing.internal_company_name || listing.title;
    const dealValueText = dealValue ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(dealValue) : 'Not specified';

    const subject = `🤝 Owner Intro Requested: ${buyerName} → ${companyName}`;

    const htmlContent = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); padding: 32px 24px; border-radius: 8px; margin-bottom: 24px;">
          <div style="font-size: 11px; font-weight: 600; letter-spacing: 0.8px; color: #94a3b8; text-transform: uppercase;">SOURCECO PIPELINE</div>
          <h1 style="color: #ffffff; font-size: 24px; font-weight: 700; margin: 8px 0 0 0;">Owner Introduction Requested</h1>
          <p style="color: #cbd5e1; font-size: 14px; margin: 8px 0 0 0;">A qualified buyer is ready to speak with the owner</p>
        </div>
        <div style="background: #fffbeb; border-left: 4px solid #d7b65c; padding: 20px 24px; border-radius: 4px; margin-bottom: 24px;">
          <p style="margin: 0 0 12px 0; color: #78350f; font-weight: 600;">Hi ${ownerName},</p>
          <p style="margin: 0; color: #78350f; font-size: 14px; line-height: 1.6;">${dealOwnerName || 'Your deal owner'} has coordinated an introduction with <strong>${buyerName}</strong> from ${buyerCompany || 'a qualified firm'}. The buyer is ready to speak with the owner of <strong>${companyName}</strong>.</p>
        </div>
        <div style="background: #f8fafc; padding: 24px; border-radius: 8px; margin-bottom: 24px; border: 1px solid #e2e8f0;">
          <h2 style="margin: 0 0 16px 0; color: #0f172a; font-size: 16px; font-weight: 700;">Buyer Information</h2>
          <table style="width: 100%; margin-bottom: 12px;"><tr><td style="color: #64748b; font-size: 13px; width: 120px;">Name</td><td style="color: #0f172a; font-size: 14px; font-weight: 600;">${buyerName}</td></tr></table>
          <table style="width: 100%; margin-bottom: 12px;"><tr><td style="color: #64748b; font-size: 13px; width: 120px;">Email</td><td style="color: #0f172a; font-size: 14px; font-weight: 600;">${buyerEmail}</td></tr></table>
          ${buyerCompany ? `<table style="width: 100%; margin-bottom: 12px;"><tr><td style="color: #64748b; font-size: 13px; width: 120px;">Company</td><td style="color: #0f172a; font-size: 14px; font-weight: 600;">${buyerCompany}</td></tr></table>` : ''}
          <table style="width: 100%; margin-bottom: 12px;"><tr><td style="color: #64748b; font-size: 13px; width: 120px;">Deal Value</td><td style="color: #0f172a; font-size: 14px; font-weight: 600;">${dealValueText}</td></tr></table>
        </div>
        <div style="text-align: center; margin-bottom: 32px;">
          <a href="https://marketplace.sourcecodeals.com/admin/deals/pipeline?deal=${dealId}" style="background-color: #d7b65c; color: #ffffff; font-size: 14px; font-weight: 600; text-decoration: none; display: inline-block; padding: 14px 40px; border-radius: 6px;">View Deal in Pipeline</a>
        </div>
        <div style="text-align: center; padding: 24px 0; border-top: 1px solid #e2e8f0;">
          <p style="margin: 0; color: #94a3b8; font-size: 12px;">SourceCo Deals • M&A Advisory Platform</p>
        </div>
      </div>`;

    const result = await sendEmail({
      templateName: 'owner_intro_notification',
      to: primaryOwnerData.email,
      toName: ownerName,
      subject,
      htmlContent,
      senderName: 'SourceCo Notifications',
      isTransactional: true,
    });

    if (!result.success) throw new Error(`Failed to send email: ${result.error}`);

    await supabase.from('owner_intro_notifications').insert({
      deal_id: dealId, listing_id: listingId, primary_owner_id: listing.primary_owner_id,
      email_status: 'sent', metadata: { message_id: result.providerMessageId, buyer_name: buyerName, buyer_email: buyerEmail, email_subject: subject },
    });

    return new Response(JSON.stringify({ success: true, message: 'Owner intro notification sent', primary_owner_name: ownerName, message_id: result.providerMessageId, recipient: primaryOwnerData.email }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    console.error('Error in send-owner-intro-notification:', error);
    return new Response(JSON.stringify({ success: false, error: error instanceof Error ? error.message : String(error) }), {
      status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
};

serve(handler);
