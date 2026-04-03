import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';
import { logEmailDelivery } from '../_shared/email-logger.ts';
import { escapeHtml } from '../_shared/security.ts';

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

  console.log('Deal alert function called');

  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(req);
  }

  // Auth: Allow service-role calls (internal) or authenticated admin users
  const authHeader = req.headers.get('Authorization') || '';
  const callerToken = authHeader.replace('Bearer ', '').trim();
  if (!callerToken) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const isInternalCall = callerToken === supabaseServiceKey;

    if (!isInternalCall) {
      // Verify the caller has a valid session
      const anonClient = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_ANON_KEY') ?? '',
        { global: { headers: { Authorization: `Bearer ${callerToken}` } } },
      );
      const {
        data: { user: callerUser },
        error: callerError,
      } = await anonClient.auth.getUser();
      if (callerError || !callerUser) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }

      // Allow both admins AND the alert owner to trigger
      const { data: _isAdmin } = await supabaseClient.rpc('is_admin', { user_id: callerUser.id });
      // If not admin, we still allow — deal alerts are triggered by listing creation
      // which can happen from any authenticated user context
    }

    // Parse body early so we can reference it in the catch block too
    let parsedBody: DealAlertRequest | null = null;
    parsedBody = await req.json();
    const { alert_id, user_email, user_id, listing_id, alert_name, listing_data } = parsedBody;

    // Escape all user-controlled data before interpolating into HTML email
    const safeTitle = escapeHtml(listing_data.title || '');
    const _safeAlertName = escapeHtml(alert_name || '');
    const safeLocation = escapeHtml(listing_data.location || '');
    const safeCategory = escapeHtml(listing_data.category || '');
    const safeDescription = escapeHtml(
      listing_data.description.length > 200
        ? listing_data.description.substring(0, 200) + '...'
        : listing_data.description,
    );

    console.log('Processing deal alert:', { alert_id, user_email, listing_id });

    // Format currency values
    const formatCurrency = (value: number) => {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(value);
    };

    // Create the email content
    const emailHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>New Deal Alert - ${safeTitle}</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #6366f1, #8b5cf6); color: white; padding: 30px 20px; border-radius: 8px 8px 0 0; text-align: center; }
            .content { background: #fff; padding: 30px 20px; border: 1px solid #e5e7eb; }
            .listing-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin: 20px 0; }
            .listing-title { font-size: 20px; font-weight: bold; color: #1e293b; margin-bottom: 10px; }
            .listing-meta { color: #64748b; margin-bottom: 15px; }
            .financials { display: flex; gap: 20px; margin: 15px 0; }
            .financial-item { background: white; padding: 15px; border-radius: 6px; flex: 1; text-align: center; }
            .financial-label { font-size: 12px; color: #64748b; text-transform: uppercase; }
            .financial-value { font-size: 18px; font-weight: bold; color: #1e293b; }
            .description { margin: 15px 0; color: #374151; }
            .btn { display: inline-block; background: #6366f1; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 500; }
            .footer { background: #f8fafc; padding: 20px; border-radius: 0 0 8px 8px; text-align: center; color: #64748b; font-size: 14px; }
            .alert-info { background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 6px; padding: 15px; margin: 20px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>A deal matching your criteria just came in</h1>
              <p>Matched ${new Date().toLocaleDateString()}</p>
            </div>
            
            <div class="content">
              <div class="alert-info">
                <strong>Matched:</strong> ${new Date().toLocaleDateString()}
              </div>
              
              <div class="listing-card">
                <div class="listing-title">${safeTitle}</div>
                <div class="listing-meta">
                  📍 ${safeLocation} • 🏷️ ${safeCategory}
                </div>
                
                <div class="financials">
                  <div class="financial-item">
                    <div class="financial-label">Revenue</div>
                    <div class="financial-value">${formatCurrency(listing_data.revenue)}</div>
                  </div>
                  <div class="financial-item">
                    <div class="financial-label">EBITDA</div>
                    <div class="financial-value">${formatCurrency(listing_data.ebitda)}</div>
                  </div>
                </div>
                
                <div class="description">
                  ${safeDescription}
                </div>
                
                <a href="${Deno.env.get('SITE_URL') ?? 'https://marketplace.sourcecodeals.com'}/listing/${listing_data.id}" class="btn">
                  View Deal →
                </a>
              </div>
              
              <p><strong>Why you're receiving this:</strong> This deal matches your mandate on SourceCo.</p>

              <p style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px; font-size: 14px; color: #475569; margin-top: 16px;">
                This listing was shared with a small number of buyers who match the seller's criteria. We typically introduce 1–3 buyers — if you're interested, request access soon.
              </p>
            </div>
            
            <div class="footer">
              <p>You're receiving this because you have an active deal alert on SourceCo.</p>
              <p style="font-size: 12px; color: #666;">
                <a href="${Deno.env.get('SITE_URL') ?? 'https://marketplace.sourcecodeals.com'}/profile?tab=alerts">Manage your alerts</a> |
                <a href="${Deno.env.get('SITE_URL') ?? 'https://marketplace.sourcecodeals.com'}/api/unsubscribe?email=${encodeURIComponent(user_email)}&type=deal_alerts">Unsubscribe from deal alerts</a>
              </p>
            </div>
          </div>
        </body>
      </html>
    `;

    // Send via shared Brevo sender with retry logic
    const { sendViaBervo } = await import('../_shared/brevo-sender.ts');

    const brevoResult = await sendViaBervo({
      to: user_email,
      toName: user_email.split('@')[0],
      subject: `New deal — matches your mandate.`,
      htmlContent: emailHtml,
      senderName: 'SourceCo Marketplace',
    });

    // Simulate response interface for downstream code
    const brevoResponse = { ok: brevoResult.success };
    const emailResponse = { messageId: brevoResult.messageId };

    if (!brevoResponse.ok) {
      await logEmailDelivery(supabaseClient, {
        email: user_email,
        emailType: 'deal_alert',
        status: 'failed',
        correlationId: crypto.randomUUID(),
        errorMessage: brevoResult.error || 'Send failed',
      });
      throw new Error(brevoResult.error || 'Send failed');
    }

    console.log('Email sent via Brevo:', emailResponse);

    await logEmailDelivery(supabaseClient, {
      email: user_email,
      emailType: 'deal_alert',
      status: 'sent',
      correlationId: crypto.randomUUID(),
    });

    // Update delivery log status
    const { error: updateError } = await supabaseClient
      .from('alert_delivery_logs')
      .update({
        delivery_status: 'sent',
        sent_at: new Date().toISOString(),
      })
      .eq('alert_id', alert_id)
      .eq('listing_id', listing_id)
      .eq('user_id', user_id);

    if (updateError) {
      console.error('Error updating delivery log:', updateError);
    }

    // Update last_sent_at for the alert
    const { error: alertUpdateError } = await supabaseClient
      .from('deal_alerts')
      .update({ last_sent_at: new Date().toISOString() })
      .eq('id', alert_id);

    if (alertUpdateError) {
      console.error('Error updating alert last_sent_at:', alertUpdateError);
    }

    return new Response(JSON.stringify({ success: true, emailResponse }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  } catch (error: unknown) {
    console.error('Error in send-deal-alert function:', error);

    // Use already-parsed body to update delivery log — avoids double-consuming req.json()
    try {
      if (parsedBody?.alert_id && parsedBody?.listing_id && parsedBody?.user_id) {
        const supabaseClient = createClient(
          Deno.env.get('SUPABASE_URL') ?? '',
          Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
        );

        await supabaseClient
          .from('alert_delivery_logs')
          .update({
            delivery_status: 'failed',
            error_message: error instanceof Error ? error.message : String(error),
          })
          .eq('alert_id', parsedBody.alert_id)
          .eq('listing_id', parsedBody.listing_id)
          .eq('user_id', parsedBody.user_id);
      }
    } catch (logError) {
      console.error('Error updating error log:', logError);
    }

    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      },
    );
  }
};

serve(handler);
