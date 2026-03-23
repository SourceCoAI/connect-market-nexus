import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';
import { requireAdmin, escapeHtml, escapeHtmlWithBreaks } from '../_shared/auth.ts';
import { logEmailDelivery } from '../_shared/email-logger.ts';

interface UserNotificationRequest {
  email: string;
  subject: string;
  message: string;
  type?: 'info' | 'success' | 'warning' | 'error' | 'connection_approved';
  actionUrl?: string;
  actionText?: string;
  fromEmail?: string;
}

const handler = async (req: Request): Promise<Response> => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(req);
  }

  try {
    // AUTH: Admin-only — sends arbitrary emails to arbitrary addresses
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const auth = await requireAdmin(req, supabase);
    if (!auth.isAdmin) {
      return new Response(JSON.stringify({ error: auth.error }), {
        status: auth.authenticated ? 403 : 401,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    const {
      email,
      subject,
      message,
      type = 'info',
      actionUrl,
      actionText,
      fromEmail,
    }: UserNotificationRequest = await req.json();

    const correlationId = crypto.randomUUID();
    console.log('Sending user notification:', { email, subject, type });

    // For connection_approved emails, use plain text format
    const isPlainText = type === 'connection_approved';
    let htmlContent = '';
    const textContent = message;

    if (isPlainText) {
      // Simple HTML wrapper for plain text message
      htmlContent = `
        <div style="font-family: Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #333;">
          <pre style="font-family: Arial, sans-serif; white-space: pre-wrap; margin: 0;">${escapeHtml(message)}</pre>
        </div>
      `;
    } else {
      // Original styled email format for other types
      const typeColors: Record<string, string> = {
        info: '#3b82f6',
        success: '#059669',
        warning: '#d97706',
        error: '#dc2626',
      };

      const typeEmojis: Record<string, string> = {
        info: 'ℹ️',
        success: '✅',
        warning: '⚠️',
        error: '❌',
      };

      htmlContent = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #1e293b 0%, #334155 100%); color: white; padding: 30px; border-radius: 12px; margin-bottom: 20px;">
            <h1 style="margin: 0; font-size: 24px; font-weight: 600;">
              ${typeEmojis[type] || ''} ${escapeHtml(subject)}
            </h1>
            <p style="margin: 10px 0 0 0; opacity: 0.9;">SourceCo Marketplace Notification</p>
          </div>

          <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
            <div style="background: white; padding: 20px; border-radius: 6px; border-left: 4px solid ${typeColors[type] || '#3b82f6'};">
              ${escapeHtmlWithBreaks(message)}
            </div>
          </div>

          ${
            actionUrl && actionText
              ? `
          <div style="text-align: center; margin: 30px 0;">
            <a href="${escapeHtml(actionUrl)}"
               style="background: ${typeColors[type] || '#3b82f6'}; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 500;">
              ${escapeHtml(actionText)}
            </a>
          </div>
          `
              : ''
          }

          <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e2e8f0; color: #64748b; font-size: 14px;">
            <p>This notification was sent from SourceCo Marketplace.</p>
            <p>If you have any questions, contact us at <a href="mailto:${Deno.env.get('ADMIN_EMAIL') || 'adam.haile@sourcecodeals.com'}" style="color: #059669;">${Deno.env.get('ADMIN_EMAIL') || 'adam.haile@sourcecodeals.com'}</a></p>
          </div>
        </div>
      `;
    }

    const brevoApiKey = Deno.env.get('BREVO_API_KEY');
    if (!brevoApiKey) {
      throw new Error('BREVO_API_KEY not configured');
    }

    const emailResponse = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': brevoApiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        sender: {
          name: 'SourceCo Marketplace',
          email: fromEmail || Deno.env.get('ADMIN_EMAIL') || 'adam.haile@sourcecodeals.com',
        },
        to: [
          {
            email: email,
            name: email.split('@')[0], // Use email prefix as name fallback
          },
        ],
        subject: subject,
        htmlContent: htmlContent,
        textContent: textContent,
        replyTo: {
          email: fromEmail || Deno.env.get('ADMIN_EMAIL') || 'adam.haile@sourcecodeals.com',
          name: fromEmail?.includes('bill.martin')
            ? 'Bill Martin - SourceCo'
            : fromEmail?.includes('tomos.mughan')
              ? 'Tomos Mughan - SourceCo'
              : 'Adam Haile - SourceCo',
        },
        // Disable click tracking to prevent broken links
        params: {
          trackClicks: false,
          trackOpens: true,
        },
      }),
    });

    if (!emailResponse.ok) {
      const errorText = await emailResponse.text();
      console.error('Error sending email via Brevo:', errorText);
      throw new Error(`Brevo API error: ${errorText}`);
    }

    console.log('User notification sent successfully');

    await logEmailDelivery(supabase, {
      email,
      emailType: 'user_notification',
      status: 'sent',
      correlationId,
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: 'User notification sent successfully',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    );
  } catch (error: unknown) {
    console.error('Error in send-user-notification function:', error);

    try {
      const sbClient = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      );
      await logEmailDelivery(sbClient, {
        email: 'unknown',
        emailType: 'user_notification',
        status: 'failed',
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    } catch (_) {
      /* logging best-effort */
    }

    return new Response(
      JSON.stringify({
        error:
          error instanceof Error
            ? error.message
            : String(error) || 'Failed to send user notification',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      },
    );
  }
};

serve(handler);
