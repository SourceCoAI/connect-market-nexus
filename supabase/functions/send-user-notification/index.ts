import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';
import { requireAdmin, escapeHtml, escapeHtmlWithBreaks } from '../_shared/auth.ts';
import { sendEmail } from '../_shared/email-sender.ts';

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
  if (req.method === 'OPTIONS') return corsPreflightResponse(req);

  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const auth = await requireAdmin(req, supabase);
    if (!auth.isAdmin) {
      return new Response(JSON.stringify({ error: auth.error }), {
        status: auth.authenticated ? 403 : 401,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    const { email, subject, message, type = 'info', actionUrl, actionText }: UserNotificationRequest = await req.json();
    console.log('Sending user notification:', { email, subject, type });

    const isPlainText = type === 'connection_approved';
    let htmlContent = '';
    const textContent = message;

    if (isPlainText) {
      htmlContent = `
        <div style="font-family: Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #333;">
          <pre style="font-family: Arial, sans-serif; white-space: pre-wrap; margin: 0;">${escapeHtml(message)}</pre>
        </div>`;
    } else {
      const typeColors: Record<string, string> = { info: '#3b82f6', success: '#059669', warning: '#d97706', error: '#dc2626' };
      const typeEmojis: Record<string, string> = { info: 'ℹ️', success: '✅', warning: '⚠️', error: '❌' };

      htmlContent = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #1e293b 0%, #334155 100%); color: white; padding: 30px; border-radius: 12px; margin-bottom: 20px;">
            <h1 style="margin: 0; font-size: 24px; font-weight: 600;">${typeEmojis[type] || ''} ${escapeHtml(subject)}</h1>
            <p style="margin: 10px 0 0 0; opacity: 0.9;">SourceCo Marketplace Notification</p>
          </div>
          <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
            <div style="background: white; padding: 20px; border-radius: 6px; border-left: 4px solid ${typeColors[type] || '#3b82f6'};">
              ${escapeHtmlWithBreaks(message)}
            </div>
          </div>
          ${actionUrl && actionText ? `
          <div style="text-align: center; margin: 30px 0;">
            <a href="${escapeHtml(actionUrl)}" style="background: ${typeColors[type] || '#3b82f6'}; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 500;">
              ${escapeHtml(actionText)}
            </a>
          </div>` : ''}
          <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e2e8f0; color: #64748b; font-size: 14px;">
            <p>This notification was sent from SourceCo Marketplace.</p>
            <p>If you have any questions, contact us at <a href="mailto:adam.haile@sourcecodeals.com" style="color: #059669;">adam.haile@sourcecodeals.com</a></p>
          </div>
        </div>`;
    }

    const result = await sendEmail({
      templateName: 'user_notification',
      to: email,
      toName: email.split('@')[0],
      subject,
      htmlContent,
      textContent,
      senderName: 'SourceCo Marketplace',
      isTransactional: true,
    });

    if (!result.success) throw new Error(result.error || 'Failed to send email');

    console.log('User notification sent successfully');

    return new Response(
      JSON.stringify({ success: true, message: 'User notification sent successfully' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 },
    );
  } catch (error: unknown) {
    console.error('Error in send-user-notification function:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) || 'Failed to send user notification' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 },
    );
  }
};

serve(handler);
