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

    const subject = `Owner Intro Requested: ${buyerName} to ${companyName}`;

    const htmlContent = wrapEmailHtml({
      bodyHtml: `
        <p style="margin: 0 0 16px;">Hi ${ownerName},</p>
        <p style="margin: 0 0 16px;">${dealOwnerName || 'Your deal owner'} has coordinated an introduction with ${buyerName} from ${buyerCompany || 'a qualified firm'}. The buyer is ready to speak with the owner of ${companyName}.</p>
        <div style="background: #F7F6F3; padding: 24px; margin: 24px 0;">
          <p style="margin: 0 0 4px; font-size: 14px; color: #6B6B6B;">Name: ${buyerName}</p>
          <p style="margin: 0 0 4px; font-size: 14px; color: #6B6B6B;">Email: ${buyerEmail}</p>
          ${buyerCompany ? `<p style="margin: 0 0 4px; font-size: 14px; color: #6B6B6B;">Company: ${buyerCompany}</p>` : ''}
          <p style="margin: 0; font-size: 14px; color: #6B6B6B;">Deal Value: ${dealValueText}</p>
        </div>
        <div style="text-align: center; margin: 28px 0;">
          <a href="https://marketplace.sourcecodeals.com/admin/deals/pipeline?deal=${dealId}" style="background-color: #000000; color: #ffffff; font-size: 14px; font-weight: 600; text-decoration: none; display: inline-block; padding: 14px 28px; border-radius: 6px;">View Deal in Pipeline</a>
        </div>`,
      preheader: `Owner intro requested: ${buyerName} to ${companyName}`,
      recipientEmail: primaryOwnerData.email,
    });

    const result = await sendEmail({
      templateName: 'owner_intro_notification',
      to: primaryOwnerData.email,
      toName: ownerName,
      subject,
      htmlContent,
      senderName: 'SourceCo',
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
