import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4';

import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';
import { requireAuth, escapeHtml, escapeHtmlWithBreaks } from '../_shared/auth.ts';
import { logEmailDelivery } from '../_shared/email-logger.ts';

interface FeedbackNotificationRequest {
  feedbackId: string;
  message: string;
  pageUrl?: string;
  userAgent?: string;
  category?: string;
  priority?: string;
  userId?: string;
  userEmail?: string;
  userName?: string;
}

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
);

const handler = async (req: Request): Promise<Response> => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(req);
  }

  try {
    // AUTH: Requires authenticated user (users submit feedback)
    const auth = await requireAuth(req);
    if (!auth.authenticated) {
      return new Response(JSON.stringify({ error: auth.error }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    const body: FeedbackNotificationRequest = await req.json();
    const {
      feedbackId,
      message,
      pageUrl,
      userAgent: _userAgent,
      category,
      priority,
      userId: _userId,
      userEmail,
      userName,
    } = body;

    console.log('Processing feedback notification:', { feedbackId, category, priority });

    // Get admin users
    const { data: adminUsers, error: adminError } = await supabase
      .from('profiles')
      .select('email, first_name, last_name')
      .eq('is_admin', true);

    if (adminError) {
      console.error('Error fetching admin users:', adminError);
      throw adminError;
    }

    if (!adminUsers || adminUsers.length === 0) {
      console.log('No admin users found to notify');
      return new Response(JSON.stringify({ success: true, message: 'No admin users to notify' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Prepare email content — escape all user-supplied values
    const safeUserName = escapeHtml(userName || '');
    const safeUserEmail = escapeHtml(userEmail || '');
    const safePageUrl = escapeHtml(pageUrl || '');
    const safeCategoryLabel = escapeHtml(
      category?.charAt(0).toUpperCase() + category?.slice(1) || 'General',
    );
    const safePriority = escapeHtml((priority || 'normal').toUpperCase());

    const priorityEmoji = priority === 'urgent' ? '🚨' : priority === 'high' ? '⚠️' : '💬';

    const emailSubject = `${priorityEmoji} New Feedback: ${safeCategoryLabel} ${priority === 'urgent' ? '(URGENT)' : ''}`;

    const emailHtml = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #1e293b 0%, #334155 100%); color: white; padding: 30px; border-radius: 12px; margin-bottom: 20px;">
          <h1 style="margin: 0; font-size: 24px; font-weight: 600;">New Feedback Received</h1>
          <p style="margin: 10px 0 0 0; opacity: 0.9;">A user has submitted feedback that requires your attention.</p>
        </div>

        <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
          <h2 style="margin: 0 0 15px 0; color: #1e293b; font-size: 18px;">Feedback Details</h2>

          <div style="margin-bottom: 15px;">
            <strong style="color: #475569;">Category:</strong>
            <span style="background: #e2e8f0; padding: 4px 8px; border-radius: 4px; font-size: 14px;">${safeCategoryLabel}</span>
          </div>

          <div style="margin-bottom: 15px;">
            <strong style="color: #475569;">Priority:</strong>
            <span style="background: ${priority === 'urgent' ? '#fef2f2' : priority === 'high' ? '#fef3c7' : '#f0f9ff'};
                         color: ${priority === 'urgent' ? '#dc2626' : priority === 'high' ? '#d97706' : '#0369a1'};
                         padding: 4px 8px; border-radius: 4px; font-size: 14px;">${safePriority}</span>
          </div>

          ${safeUserName ? `<div style="margin-bottom: 15px;"><strong style="color: #475569;">From:</strong> ${safeUserName}</div>` : ''}
          ${safeUserEmail ? `<div style="margin-bottom: 15px;"><strong style="color: #475569;">Email:</strong> ${safeUserEmail}</div>` : ''}
          ${safePageUrl ? `<div style="margin-bottom: 15px;"><strong style="color: #475569;">Page:</strong> ${safePageUrl}</div>` : ''}

          <div style="margin-top: 20px;">
            <strong style="color: #475569;">Message:</strong>
            <div style="background: white; padding: 15px; border-radius: 6px; margin-top: 8px; border-left: 4px solid #3b82f6;">
              ${escapeHtmlWithBreaks(message)}
            </div>
          </div>
        </div>

        <div style="text-align: center; margin-top: 30px;">
          <a href="https://marketplace.sourcecodeals.com/admin"
             style="background: #1e293b; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 500;">
            View in Admin Dashboard
          </a>
        </div>

        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e2e8f0; color: #64748b; font-size: 14px;">
          <p>This notification was sent automatically when feedback was submitted. Reply to this email to respond directly to the user.</p>
        </div>
      </div>
    `;

    // Send email using Brevo API
    try {
      const brevoApiKey = Deno.env.get('BREVO_API_KEY');
      if (!brevoApiKey) {
        console.warn('BREVO_API_KEY not configured, using fallback email delivery');
        // Log feedback for admin review instead of failing
        console.log('Feedback submission logged for admin review:', {
          feedbackId,
          category,
          priority,
          message: message.substring(0, 100) + '...',
          pageUrl,
          userEmail,
          userName,
          adminCount: adminUsers.length,
        });

        return new Response(
          JSON.stringify({
            success: true,
            message: `Feedback logged for admin review (${adminUsers.length} admin(s))`,
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
          },
        );
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
            name: 'SourceCo Marketplace Feedback',
            email: Deno.env.get('ADMIN_EMAIL') || 'adam.haile@sourcecodeals.com',
          },
          to: adminUsers.map((admin) => ({
            email: admin.email,
            name: `${admin.first_name} ${admin.last_name}`.trim(),
          })),
          subject: emailSubject,
          htmlContent: emailHtml,
          replyTo: {
            email: Deno.env.get('ADMIN_EMAIL') || 'adam.haile@sourcecodeals.com',
            name: 'SourceCo Support',
          },
          // Disable click tracking to prevent broken links
          params: {
            trackClicks: false,
            trackOpens: true,
          },
        }),
      });

      const correlationId = crypto.randomUUID();

      if (!emailResponse.ok) {
        const errorText = await emailResponse.text();
        console.error('Error sending email via Brevo:', errorText);
        // Log feedback for admin review instead of failing
        console.log('Feedback submission logged for admin review:', {
          feedbackId,
          category,
          priority,
          message: message.substring(0, 100) + '...',
          pageUrl,
          userEmail,
          userName,
          adminCount: adminUsers.length,
        });
        for (const admin of adminUsers) {
          await logEmailDelivery(supabase, {
            email: admin.email,
            emailType: 'feedback_notification',
            status: 'failed',
            correlationId,
            errorMessage: errorText,
          });
        }
      } else {
        console.log('Email sent successfully to admin');
        for (const admin of adminUsers) {
          await logEmailDelivery(supabase, {
            email: admin.email,
            emailType: 'feedback_notification',
            status: 'sent',
            correlationId,
          });
        }
      }
    } catch (error) {
      console.error('Email delivery error:', error);
      // Continue processing even if email fails
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Feedback notification processed for ${adminUsers.length} admin(s)`,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    );
  } catch (error: unknown) {
    console.error('Error in send-feedback-notification function:', error);
    return new Response(
      JSON.stringify({
        error: error.message || 'Failed to send feedback notification',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      },
    );
  }
};

serve(handler);
