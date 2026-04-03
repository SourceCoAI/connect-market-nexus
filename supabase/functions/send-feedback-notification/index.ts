import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';
import { requireAuth, escapeHtml, escapeHtmlWithBreaks } from '../_shared/auth.ts';
import { sendEmail } from '../_shared/email-sender.ts';
import { wrapEmailHtml } from '../_shared/email-template-wrapper.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4';

interface FeedbackNotificationRequest {
  feedbackId: string; message: string; pageUrl?: string; userAgent?: string;
  category?: string; priority?: string; userId?: string; userEmail?: string; userName?: string;
}

const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');

const handler = async (req: Request): Promise<Response> => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') return corsPreflightResponse(req);

  try {
    const auth = await requireAuth(req);
    if (!auth.authenticated) {
      return new Response(JSON.stringify({ error: auth.error }), { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }

    const body: FeedbackNotificationRequest = await req.json();
    const { feedbackId, message, pageUrl, category, priority, userEmail, userName } = body;

    const { data: adminUsers, error: adminError } = await supabase.from('profiles').select('email, first_name, last_name').eq('is_admin', true);
    if (adminError) throw adminError;
    if (!adminUsers || adminUsers.length === 0) {
      return new Response(JSON.stringify({ success: true, message: 'No admin users to notify' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const safeUserName = escapeHtml(userName || '');
    const safeUserEmail = escapeHtml(userEmail || '');
    const safePageUrl = escapeHtml(pageUrl || '');
    const safeCategoryLabel = escapeHtml(category?.charAt(0).toUpperCase() + category?.slice(1) || 'General');
    const safePriority = escapeHtml((priority || 'normal').toUpperCase());

    const emailSubject = priority === 'urgent'
      ? `URGENT Feedback: ${safeCategoryLabel}`
      : `New Feedback: ${safeCategoryLabel}`;

    const emailHtml = wrapEmailHtml({
      bodyHtml: `
        <p style="font-size: 18px; font-weight: 600; margin: 0 0 20px;">New Feedback Received</p>
        <p style="margin: 0 0 16px;">A user has submitted feedback that requires your attention.</p>
        <div style="background: #F7F6F3; padding: 20px; border-radius: 6px; margin: 0 0 20px;">
          <div style="margin-bottom: 12px;"><strong>Category:</strong> ${safeCategoryLabel}</div>
          <div style="margin-bottom: 12px;"><strong>Priority:</strong> ${safePriority}</div>
          ${safeUserName ? `<div style="margin-bottom: 12px;"><strong>From:</strong> ${safeUserName}</div>` : ''}
          ${safeUserEmail ? `<div style="margin-bottom: 12px;"><strong>Email:</strong> ${safeUserEmail}</div>` : ''}
          ${safePageUrl ? `<div style="margin-bottom: 12px;"><strong>Page:</strong> ${safePageUrl}</div>` : ''}
          <div style="margin-top: 16px;"><strong>Message:</strong>
            <div style="background: #ffffff; padding: 12px; border-radius: 6px; margin-top: 8px;">${escapeHtmlWithBreaks(message)}</div>
          </div>
        </div>
        <div style="text-align: center; margin: 28px 0;">
          <a href="https://marketplace.sourcecodeals.com/admin" style="background: #000000; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 14px; display: inline-block;">View in Admin Dashboard</a>
        </div>`,
      preheader: `New ${safeCategoryLabel} feedback received`,
      recipientEmail: adminUsers[0]?.email,
    });

    for (const admin of adminUsers) {
      const result = await sendEmail({
        templateName: 'feedback_notification',
        to: admin.email,
        toName: `${admin.first_name} ${admin.last_name}`.trim(),
        subject: emailSubject,
        htmlContent: emailHtml,
        senderName: 'SourceCo',
        replyTo: 'adam.haile@sourcecodeals.com',
        isTransactional: true,
      });

      if (result.success) console.log(`Feedback email sent to ${admin.email}`);
      else console.error(`Error sending to ${admin.email}:`, result.error);
    }

    return new Response(JSON.stringify({ success: true, message: `Feedback notification processed for ${adminUsers.length} admin(s)` }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200,
    });
  } catch (error: unknown) {
    console.error('Error in send-feedback-notification function:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500,
    });
  }
};

serve(handler);
