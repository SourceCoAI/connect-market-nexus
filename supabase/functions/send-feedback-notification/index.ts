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
    const priorityEmoji = priority === 'urgent' ? '🚨' : priority === 'high' ? '⚠️' : '💬';

    const emailSubject = `${priorityEmoji} New Feedback: ${safeCategoryLabel} ${priority === 'urgent' ? '(URGENT)' : ''}`;

    const emailHtml = wrapEmailHtml({
      bodyHtml: `
        <h2 style="margin: 0 0 15px 0; color: #1e293b; font-size: 20px;">New Feedback Received</h2>
        <p style="color: #64748b;">A user has submitted feedback that requires your attention.</p>
        <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <div style="margin-bottom: 15px;"><strong>Category:</strong> <span style="background: #e2e8f0; padding: 4px 8px; border-radius: 4px;">${safeCategoryLabel}</span></div>
          <div style="margin-bottom: 15px;"><strong>Priority:</strong> <span style="background: ${priority === 'urgent' ? '#fef2f2' : '#f0f9ff'}; padding: 4px 8px; border-radius: 4px;">${safePriority}</span></div>
          ${safeUserName ? `<div style="margin-bottom: 15px;"><strong>From:</strong> ${safeUserName}</div>` : ''}
          ${safeUserEmail ? `<div style="margin-bottom: 15px;"><strong>Email:</strong> ${safeUserEmail}</div>` : ''}
          ${safePageUrl ? `<div style="margin-bottom: 15px;"><strong>Page:</strong> ${safePageUrl}</div>` : ''}
          <div style="margin-top: 20px;"><strong>Message:</strong>
            <div style="background: white; padding: 15px; border-radius: 6px; margin-top: 8px; border-left: 4px solid #3b82f6;">${escapeHtmlWithBreaks(message)}</div>
          </div>
        </div>
        <div style="text-align: center; margin-top: 30px;">
          <a href="https://marketplace.sourcecodeals.com/admin" style="background: #1a1a2e; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 500;">View in Admin Dashboard</a>
        </div>`,
      preheader: `${priorityEmoji} New ${safeCategoryLabel} feedback received`,
      recipientEmail: adminUsers[0]?.email,
    });

    for (const admin of adminUsers) {
      const result = await sendEmail({
        templateName: 'feedback_notification',
        to: admin.email,
        toName: `${admin.first_name} ${admin.last_name}`.trim(),
        subject: emailSubject,
        htmlContent: emailHtml,
        senderName: 'SourceCo Marketplace Feedback',
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
