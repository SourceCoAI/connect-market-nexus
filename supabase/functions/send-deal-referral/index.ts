import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4';

import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';
import { sendEmail } from '../_shared/email-sender.ts';
import { wrapEmailHtml } from '../_shared/email-template-wrapper.ts';

interface ReferralRequest {
  listingId: string;
  recipientEmail: string;
  recipientName?: string;
  personalMessage?: string;
  ccSelf?: boolean;
}

serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(req);
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authError || !user) {
      throw new Error('Unauthorized');
    }

    const { listingId, recipientEmail, recipientName, personalMessage }: ReferralRequest = await req.json();

    const { data: listing, error: listingError } = await supabase
      .from('listings')
      .select('title, category, location, revenue, ebitda')
      .eq('id', listingId)
      .single();

    if (listingError) throw listingError;

    const { data: profile } = await supabase
      .from('profiles')
      .select('first_name, last_name, email')
      .eq('id', user.id)
      .single();

    const referrerName = profile
      ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || profile.email
      : 'A colleague';

    const formatCurrency = (amount: number) => {
      return new Intl.NumberFormat('en-US', {
        style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0,
      }).format(amount);
    };

    const emailHtml = wrapEmailHtml({
      bodyHtml: `
        <p>${referrerName} shared a business listing with you on SourceCo.</p>
        ${personalMessage ? `
          <div style="margin: 24px 0; padding: 20px; background-color: #F7F6F3;">
            <p style="margin: 0; font-size: 14px; color: #1A1A1A; font-style: italic;">"${personalMessage}"</p>
          </div>
        ` : ''}
        <div style="background: #F7F6F3; padding: 24px; margin: 24px 0;">
          <p style="margin: 0 0 4px; font-size: 16px; font-weight: 600; color: #1A1A1A;">${listing.title}</p>
          <p style="margin: 0 0 20px; font-size: 13px; color: #6B6B6B;">${listing.category} · ${listing.location}</p>
          <p style="margin: 0 0 4px; font-size: 13px; color: #6B6B6B;">Revenue: ${formatCurrency(Number(listing.revenue))}</p>
          <p style="margin: 0; font-size: 13px; color: #6B6B6B;">EBITDA: ${formatCurrency(Number(listing.ebitda))}</p>
        </div>
        <div style="text-align: center; margin: 28px 0;">
          <a href="${Deno.env.get('SITE_URL') || 'https://marketplace.sourcecodeals.com'}/listing/${listingId}" style="display: inline-block; padding: 14px 32px; background-color: #000000; color: #ffffff; text-decoration: none; border-radius: 6px; font-size: 14px; font-weight: 600;">View Full Listing</a>
        </div>`,
      preheader: `${referrerName} shared a business opportunity with you`,
      recipientEmail: recipientEmail,
    });

    const result = await sendEmail({
      templateName: 'deal_referral',
      to: recipientEmail,
      toName: recipientName || recipientEmail,
      subject: `${referrerName} shared a business opportunity with you`,
      htmlContent: emailHtml,
      senderName: 'SourceCo Marketplace',
      isTransactional: true,
      metadata: { listingId, referrerUserId: user.id },
    });

    if (!result.success) {
      throw new Error(`Failed to send email: ${result.error}`);
    }

    await supabase
      .from('deal_referrals')
      .update({ sent_at: new Date().toISOString(), delivery_status: 'sent' })
      .eq('listing_id', listingId)
      .eq('recipient_email', recipientEmail)
      .eq('referrer_user_id', user.id);

    return new Response(
      JSON.stringify({ success: true, message: 'Referral sent successfully', messageId: result.providerMessageId }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 },
    );
  } catch (error: unknown) {
    console.error('Error sending referral:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 },
    );
  }
});
