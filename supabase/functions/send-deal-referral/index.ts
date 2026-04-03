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

    const emailHtml = `
      <!DOCTYPE html>
      <html>
        <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
        <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f8f9fa;">
          <div style="max-width: 600px; margin: 40px auto; background-color: white; border: 1px solid #e2e8f0; border-radius: 8px;">
            <div style="padding: 40px 32px;">
              <h1 style="margin: 0 0 8px 0; font-size: 24px; font-weight: 600; color: #0f172a;">${referrerName} thought you'd be interested</h1>
              <p style="margin: 0 0 32px 0; font-size: 14px; color: #64748b;">They shared a business listing with you</p>
              ${personalMessage ? `
                <div style="margin-bottom: 32px; padding: 16px; background-color: #f8fafc; border-left: 2px solid #cbd5e1; border-radius: 4px;">
                  <p style="margin: 0; font-size: 14px; color: #475569; font-style: italic;">"${personalMessage}"</p>
                </div>
              ` : ''}
              <div style="border: 1px solid #e2e8f0; border-radius: 8px; padding: 24px; margin-bottom: 32px;">
                <h2 style="margin: 0 0 16px 0; font-size: 18px; font-weight: 600; color: #0f172a;">${listing.title}</h2>
                <div style="margin-bottom: 16px;">
                  <div style="display: inline-block; padding: 4px 12px; background-color: #f1f5f9; border-radius: 4px; font-size: 12px; color: #475569; margin-right: 8px;">${listing.category}</div>
                  <div style="display: inline-block; padding: 4px 12px; background-color: #f1f5f9; border-radius: 4px; font-size: 12px; color: #475569;">${listing.location}</div>
                </div>
                <div style="display: flex; justify-content: space-between; padding-top: 16px; border-top: 1px solid #e2e8f0;">
                  <div>
                    <p style="margin: 0 0 4px 0; font-size: 12px; color: #64748b;">Revenue</p>
                    <p style="margin: 0; font-size: 16px; font-weight: 600; color: #0f172a;">${formatCurrency(Number(listing.revenue))}</p>
                  </div>
                  <div style="text-align: right;">
                    <p style="margin: 0 0 4px 0; font-size: 12px; color: #64748b;">EBITDA</p>
                    <p style="margin: 0; font-size: 16px; font-weight: 600; color: #0f172a;">${formatCurrency(Number(listing.ebitda))}</p>
                  </div>
                </div>
              </div>
              <div style="text-align: center;">
                <a href="${Deno.env.get('SITE_URL') || 'https://marketplace.sourcecodeals.com'}/listing/${listingId}" style="display: inline-block; padding: 12px 32px; background-color: #0f172a; color: white; text-decoration: none; border-radius: 6px; font-size: 14px; font-weight: 500;">View full listing</a>
              </div>
              <p style="margin: 32px 0 0 0; font-size: 12px; color: #94a3b8; text-align: center;">This listing was shared with you via our marketplace platform</p>
            </div>
          </div>
        </body>
      </html>
    `;

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

    // Update referral record
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
