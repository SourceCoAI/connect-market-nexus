import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4';

import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';
import { requireAdmin } from '../_shared/auth.ts';
import { sendEmail } from '../_shared/email-sender.ts';
import { wrapEmailHtml } from '../_shared/email-template-wrapper.ts';

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
      htmlContent = wrapEmailHtml({
        bodyHtml: `<pre style="font-family: inherit; white-space: pre-wrap; margin: 0;">${message.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>`,
        recipientEmail: email,
      });
    } else {
      htmlContent = wrapEmailHtml({
        bodyHtml: `
          <p style="font-size: 18px; font-weight: 600; margin: 0 0 20px;">${subject.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>
          <div style="background: #F7F6F3; padding: 16px; border-radius: 6px; margin: 0 0 20px;">
            ${message.replace(/\n/g, '<br>')}
          </div>
          ${actionUrl && actionText ? `
          <div style="text-align: center; margin: 28px 0;">
            <a href="${actionUrl.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}" style="background: #000000; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 14px; display: inline-block;">
              ${actionText.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}
            </a>
          </div>` : ''}
          <p style="margin-top: 24px; color: #6B6B6B; font-size: 14px;">
            If you have any questions, contact us at <a href="mailto:adam.haile@sourcecodeals.com" style="color: #1A1A1A; text-decoration: underline;">adam.haile@sourcecodeals.com</a>
          </p>
        `,
        recipientEmail: email,
      });
    }

    const result = await sendEmail({
      templateName: 'user_notification',
      to: email,
      toName: email.split('@')[0],
      subject,
      htmlContent,
      textContent,
      senderName: 'SourceCo',
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
