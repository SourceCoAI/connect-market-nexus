import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';
import { sendEmail } from '../_shared/email-sender.ts';
import { escapeHtml } from '../_shared/security.ts';
import { wrapEmailHtml } from '../_shared/email-template-wrapper.ts';

interface DealAlertRequest {
  alert_id: string;
  user_email: string;
  user_id: string;
  listing_id: string;
  alert_name: string;
  listing_data: {
    id: string;
    title: string;
    category: string;
    location: string;
    revenue: number;
    ebitda: number;
    description: string;
    image_url?: string;
  };
}

const handler = async (req: Request): Promise<Response> => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(req);
  }

  const authHeader = req.headers.get('Authorization') || '';
  const callerToken = authHeader.replace('Bearer ', '').trim();
  if (!callerToken) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  let parsedBody: DealAlertRequest | null = null;

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const isInternalCall = callerToken === supabaseServiceKey;

    if (!isInternalCall) {
      const anonClient = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_ANON_KEY') ?? '',
        { global: { headers: { Authorization: `Bearer ${callerToken}` } } },
      );
      const { data: { user: callerUser }, error: callerError } = await anonClient.auth.getUser();
      if (callerError || !callerUser) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }
    }

    parsedBody = await req.json();
    const { alert_id, user_email, user_id, listing_id, listing_data } = parsedBody!;

    const safeTitle = escapeHtml(listing_data.title || '');
    const safeLocation = escapeHtml(listing_data.location || '');
    const safeCategory = escapeHtml(listing_data.category || '');
    const safeDescription = escapeHtml(
      listing_data.description.length > 200 ? listing_data.description.substring(0, 200) + '...' : listing_data.description,
    );

    const formatCurrency = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value);

    const siteUrl = Deno.env.get('SITE_URL') ?? 'https://marketplace.sourcecodeals.com';

    const emailHtml = wrapEmailHtml({
      bodyHtml: `
        <h2 style="margin: 0 0 16px 0; color: #1e293b;">A deal matching your criteria just came in</h2>
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin: 20px 0;">
          <div style="font-size: 20px; font-weight: bold; color: #1e293b; margin-bottom: 10px;">${safeTitle}</div>
          <div style="color: #64748b; margin-bottom: 15px;">📍 ${safeLocation} • 🏷️ ${safeCategory}</div>
          <div style="margin: 15px 0;">
            <span style="display: inline-block; text-align: center; background: white; padding: 15px; border-radius: 6px; margin-right: 10px;">
              <div style="font-size: 12px; color: #64748b; text-transform: uppercase;">Revenue</div>
              <div style="font-size: 18px; font-weight: bold; color: #1e293b;">${formatCurrency(listing_data.revenue)}</div>
            </span>
            <span style="display: inline-block; text-align: center; background: white; padding: 15px; border-radius: 6px;">
              <div style="font-size: 12px; color: #64748b; text-transform: uppercase;">EBITDA</div>
              <div style="font-size: 18px; font-weight: bold; color: #1e293b;">${formatCurrency(listing_data.ebitda)}</div>
            </span>
          </div>
          <div style="margin: 15px 0; color: #374151;">${safeDescription}</div>
          <a href="${siteUrl}/listing/${listing_data.id}" style="display: inline-block; background: #1a1a2e; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 500;">View Deal →</a>
        </div>
        <p><strong>Why you're receiving this:</strong> This deal matches your mandate on SourceCo.</p>
        <p style="font-size: 12px; color: #64748b;"><a href="${siteUrl}/profile?tab=alerts" style="color: #64748b;">Manage your alerts</a></p>`,
      preheader: `New deal matching your mandate: ${safeTitle}`,
      recipientEmail: user_email,
    });

    const result = await sendEmail({
      templateName: 'deal_alert',
      to: user_email,
      toName: user_email.split('@')[0],
      subject: `New deal — matches your mandate.`,
      htmlContent: emailHtml,
      senderName: 'SourceCo Marketplace',
      isTransactional: false, // deal alerts are not strictly transactional
      metadata: { alertId: alert_id, listingId: listing_id },
    });

    if (!result.success) {
      throw new Error(result.error || 'Send failed');
    }

    console.log('Email sent:', result.providerMessageId);

    // Update delivery log status
    await supabaseClient.from('alert_delivery_logs').update({ delivery_status: 'sent', sent_at: new Date().toISOString() })
      .eq('alert_id', alert_id).eq('listing_id', listing_id).eq('user_id', user_id);

    await supabaseClient.from('deal_alerts').update({ last_sent_at: new Date().toISOString() }).eq('id', alert_id);

    return new Response(JSON.stringify({ success: true, emailResponse: { messageId: result.providerMessageId } }), {
      status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  } catch (error: unknown) {
    console.error('Error in send-deal-alert function:', error);

    try {
      if (parsedBody?.alert_id && parsedBody?.listing_id && parsedBody?.user_id) {
        const supabaseClient = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
        await supabaseClient.from('alert_delivery_logs').update({
          delivery_status: 'failed', error_message: error instanceof Error ? error.message : String(error),
        }).eq('alert_id', parsedBody.alert_id).eq('listing_id', parsedBody.listing_id).eq('user_id', parsedBody.user_id);
      }
    } catch (logError) {
      console.error('Error updating error log:', logError);
    }

    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    );
  }
};

serve(handler);
