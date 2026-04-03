import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';
import { sendEmail } from '../_shared/email-sender.ts';
import { escapeHtml } from '../_shared/auth.ts';
import { wrapEmailHtml } from '../_shared/email-template-wrapper.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

interface UserJourneyEvent {
  event_type: 'user_created' | 'email_verified' | 'profile_approved' | 'profile_rejected' | 'reminder_due';
  user_id: string;
  user_email: string;
  user_name: string;
  metadata?: Record<string, unknown>;
}

const LOGIN_URL = 'https://marketplace.sourcecodeals.com/login';

function buildWelcomeHtml(userName: string): string {
  return wrapEmailHtml({
    bodyHtml: `
  <p>Hi ${escapeHtml(userName)},</p>
  <p>Your application is in. Our team will review it — typically within one business day — and you'll hear from us by email the moment you're cleared.</p>
  <p>While you wait, verify your email address using the link we just sent you.</p>
  <h3 style="font-size: 16px; margin: 24px 0 8px 0;">What you're applying for</h3>
  <p>SourceCo is a private marketplace for off-market, founder-led businesses. Every deal in the pipeline has been sourced and qualified by our team before it reaches buyers — you're not browsing a listing aggregator, you're accessing curated deal flow.</p>
  <p>Once approved, you'll sign a single NDA that unlocks your access to the platform, then a fee agreement before your first introduction. Both take about 60 seconds each.</p>
  <p>Questions before then? Reply to this email.</p>
  <p style="color: #6b7280; margin-top: 32px;">&mdash; The SourceCo Team</p>`,
    preheader: "Off-market deal flow, reviewed by our team. We'll be in touch shortly.",
  });
}

function buildApprovalHtml(userName: string): string {
  return wrapEmailHtml({
    bodyHtml: `
    <h1 style="font-size: 20px; font-weight: 700; margin: 0 0 24px 0;">Account Approved!</h1>
    <p>Great news, <strong>${escapeHtml(userName)}</strong>! Your SourceCo account has been approved. You now have full access to our business marketplace.</p>
    <p>Log in now to browse deals, submit connection requests, and start exploring opportunities.</p>
    <div style="text-align: center; margin: 32px 0;">
      <a href="${LOGIN_URL}" style="display: inline-block; background: #1a1a2e; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px;">Browse Deals</a>
    </div>`,
    preheader: 'Your SourceCo account has been approved. Browse deals now.',
  });
}

function buildRejectionHtml(userName: string, reason: string): string {
  return wrapEmailHtml({
    bodyHtml: `
    <h1 style="font-size: 20px; font-weight: 700; margin: 0 0 24px 0;">Account Update</h1>
    <p>Hi ${escapeHtml(userName)}, after reviewing your application, we were unable to approve your account at this time.</p>
    <div style="background: #FCF9F0; border-left: 4px solid #DEC76B; padding: 16px; border-radius: 0 8px 8px 0; margin: 0 0 24px 0;">
      <p style="margin: 0 0 4px 0; font-size: 12px; color: #9A9A9A; font-weight: 600;">REASON</p>
      <p style="margin: 0; font-size: 14px;">${escapeHtml(reason)}</p>
    </div>
    <p>If you believe this was in error or would like to discuss further, please reach out to adam.haile@sourcecodeals.com.</p>`,
    preheader: 'An update on your SourceCo application.',
  });
}

function buildEmailVerifiedHtml(userName: string): string {
  return wrapEmailHtml({
    bodyHtml: `
  <p>Hi ${escapeHtml(userName)},</p>
  <p>Your email is confirmed. Your application is now with our team.</p>
  <p>We review applications same day during business hours. You'll get an email the moment you're approved — typically within a few hours, never more than one business day.</p>
  <h3 style="font-size: 16px; margin: 24px 0 8px 0;">What happens when you're approved</h3>
  <ul style="padding-left: 20px;">
    <li>You'll sign a single NDA — covers your use of the platform, takes about 60 seconds</li>
    <li>Full access to browse every deal in the pipeline immediately after</li>
    <li>When you find a fit, request an introduction — we handle it from there</li>
  </ul>
  <p style="margin: 24px 0;"><a href="${LOGIN_URL}" style="display: inline-block; background-color: #1e293b; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 500;">Log In</a></p>
  <p style="color: #6b7280; margin-top: 32px;">&mdash; The SourceCo Team</p>`,
    preheader: "Our team reviews applications same day. We'll email you the moment you're cleared.",
  });
}

const handler = async (req: Request): Promise<Response> => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') return corsPreflightResponse(req);

  try {
    const event: UserJourneyEvent = await req.json();
    const correlationId = crypto.randomUUID();

    console.log(`[${correlationId}] Processing user journey event:`, {
      event_type: event.event_type,
      user_id: event.user_id,
      user_email: event.user_email,
    });

    const { event_type, user_email, user_name } = event;

    let subject: string;
    let htmlContent: string;
    let textContent: string | undefined;

    switch (event_type) {
      case 'user_created':
        subject = 'Your application to SourceCo is in.';
        htmlContent = buildWelcomeHtml(user_name || 'there');
        textContent = `Hi ${user_name || 'there'}, your application is in. Verify your email to continue. Log in: ${LOGIN_URL}`;
        break;

      case 'email_verified':
        subject = 'Email confirmed — you\'re in the queue.';
        htmlContent = buildEmailVerifiedHtml(user_name || 'there');
        textContent = `Hi ${user_name || 'there'}, your email is confirmed. Your application is now with our team. Log in: ${LOGIN_URL}`;
        break;

      case 'profile_approved':
        subject = 'Account Approved — Welcome to SourceCo';
        htmlContent = buildApprovalHtml(user_name || 'there');
        textContent = `Great news, ${user_name || 'there'}! Your account has been approved. Log in: ${LOGIN_URL}`;
        break;

      case 'profile_rejected': {
        const reason = (event.metadata?.rejection_reason as string) || 'Application did not meet our criteria';
        subject = 'SourceCo Account Update';
        htmlContent = buildRejectionHtml(user_name || 'there', reason);
        textContent = `Hi ${user_name || 'there'}, we were unable to approve your account. Reason: ${reason}`;
        break;
      }

      case 'reminder_due':
        return new Response(JSON.stringify({ success: true, correlationId, message: 'Reminder skipped' }),
          { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } });

      default:
        return new Response(JSON.stringify({ success: true, correlationId, message: 'Unknown event type' }),
          { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }

    const result = await sendEmail({
      templateName: `journey_${event_type}`,
      to: user_email,
      toName: user_name || user_email,
      subject,
      htmlContent,
      textContent,
      senderName: 'SourceCo',
      isTransactional: true,
    });

    if (!result.success) {
      console.error(`[${correlationId}] Failed to send ${event_type} email:`, result.error);
    } else {
      console.log(`[${correlationId}] ${event_type} email sent to ${user_email}`);
    }

    // For user_created events, also notify all admins
    if (event_type === 'user_created') {
      try {
        const { data: adminRoles } = await supabase.from('user_roles').select('user_id').eq('role', 'admin');
        if (adminRoles?.length) {
          const adminIds = adminRoles.map((r: { user_id: string }) => r.user_id);
          const { data: adminProfiles } = await supabase.from('profiles').select('id, first_name, last_name, email').in('id', adminIds);

          const company = (event.metadata?.company as string) || '';
          const adminSubject = `New User Registration: ${user_name} (${user_email})`;
          const adminHtml = `
<!DOCTYPE html><html><head><meta charset="utf-8" /></head>
<body style="margin:0;padding:0;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="max-width:600px;margin:0 auto;padding:40px 24px;">
  <div style="font-size:11px;font-weight:600;letter-spacing:1.2px;color:#9A9A9A;text-transform:uppercase;margin-bottom:8px;">SOURCECO</div>
  <h1 style="color:#0E101A;font-size:20px;font-weight:700;margin:0 0 24px 0;">New User Registration</h1>
  <div style="color:#3A3A3A;font-size:15px;line-height:1.7;">
    <p style="margin:0 0 16px 0;">A new user has registered on the marketplace:</p>
    <div style="background:#FCF9F0;border-left:4px solid #DEC76B;padding:16px;border-radius:0 8px 8px 0;margin:0 0 24px 0;">
      <p style="margin:0;color:#3A3A3A;font-size:14px;"><strong>Name:</strong> ${escapeHtml(user_name)}<br/><strong>Email:</strong> ${escapeHtml(user_email)}${company ? `<br/><strong>Company:</strong> ${escapeHtml(company)}` : ''}</p>
    </div>
  </div>
  <div style="text-align:center;margin:32px 0;">
    <a href="https://marketplace.sourcecodeals.com/admin/users" style="display:inline-block;background:#0E101A;color:#ffffff;padding:14px 28px;text-decoration:none;border-radius:8px;font-weight:600;font-size:15px;">Review Users</a>
  </div>
</div></body></html>`;

          for (const admin of adminProfiles || []) {
            if (!admin.email) continue;
            const adminName = `${admin.first_name || ''} ${admin.last_name || ''}`.trim() || 'Admin';
            await sendEmail({
              templateName: 'journey_admin_new_user',
              to: admin.email,
              toName: adminName,
              subject: adminSubject,
              htmlContent: adminHtml,
              senderName: 'SourceCo',
              isTransactional: true,
            });
          }
          console.log(`[${correlationId}] Admin notifications sent for new user registration`);
        }
      } catch (adminErr) {
        console.error(`[${correlationId}] Failed to notify admins of new user:`, adminErr);
      }
    }

    return new Response(
      JSON.stringify({ success: true, correlationId, message: 'User journey event processed' }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    );
  } catch (error: unknown) {
    console.error('Error in user-journey-notifications:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) || 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    );
  }
};

serve(handler);
