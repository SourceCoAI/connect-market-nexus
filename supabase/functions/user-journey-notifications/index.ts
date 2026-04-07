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
  <p>Your application is in. Our team will review it and you will hear from us by email the moment you are approved, typically within a few hours.</p>
  <p>While you wait, verify your email address using the link we sent you. If you have already verified, sit tight. A team member is reviewing your profile now.</p>
  <p style="font-weight: 600; margin: 24px 0 8px 0;">What happens when you are approved</p>
  <p>To receive deal materials and request introductions, you will need to sign a Fee Agreement. You can request one from your profile or any listing page. It takes about 60 seconds.</p>
  <p>The Fee Agreement is success-only. Nothing is owed unless a deal closes.</p>
  <p>Questions? Reply to this email.</p>
  <p style="color: #6B6B6B; margin-top: 32px;">The SourceCo Team</p>`,
    preheader: 'Your application is in. We will email you the moment you are approved.',
  });
}

function buildApprovalHtml(userName: string): string {
  return wrapEmailHtml({
    bodyHtml: `
    <p>Hi ${escapeHtml(userName)},</p>
    <p>Your SourceCo account has been approved. You can now browse deals and request connections.</p>
    <p>Log in now to browse deals, submit connection requests, and start exploring opportunities.</p>
    <div style="text-align: center; margin: 32px 0;">
      <a href="${LOGIN_URL}" style="display: inline-block; background: #000000; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 15px;">Browse Deals</a>
    </div>`,
    preheader: 'Your SourceCo account has been approved. Browse deals now.',
  });
}

function buildRejectionHtml(userName: string, reason: string): string {
  return wrapEmailHtml({
    bodyHtml: `
    <p>Hi ${escapeHtml(userName)},</p>
    <p>After reviewing your application, we were unable to approve your account at this time.</p>
    <div style="background: #F7F6F3; padding: 16px; border-radius: 6px; margin: 20px 0;">
      <p style="margin: 0 0 4px 0; font-size: 12px; color: #9B9B9B; font-weight: 600; text-transform: uppercase;">Reason</p>
      <p style="margin: 0; font-size: 14px;">${escapeHtml(reason)}</p>
    </div>
    <p>If you believe this was in error or would like to discuss further, reach out to support@sourcecodeals.com.</p>`,
    preheader: 'An update on your SourceCo application.',
  });
}

function buildEmailVerifiedHtml(userName: string): string {
  return wrapEmailHtml({
    bodyHtml: `
  <p>Hi ${escapeHtml(userName)},</p>
  <p>Your email is confirmed. Your application is now with our team.</p>
  <p>We review applications same day during business hours. You will get an email the moment you are approved, typically within a few hours, never more than one business day.</p>
  <p style="font-weight: 600; margin: 24px 0 8px 0;">What happens next</p>
  <ol style="padding-left: 20px; line-height: 1.8;">
    <li>Our team reviews and approves your profile.</li>
    <li>To receive deal materials and request introductions, you sign a Fee Agreement. It is success-only and takes about 60 seconds.</li>
  </ol>
  <p>Nothing for you to do right now. We will email you the moment you are cleared.</p>
  <p style="color: #6B6B6B; margin-top: 32px;">The SourceCo Team</p>`,
    preheader: 'Our team reviews applications same day. We will email you the moment you are cleared.',
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
        subject = 'Email confirmed. You are in the queue.';
        htmlContent = buildEmailVerifiedHtml(user_name || 'there');
        textContent = `Hi ${user_name || 'there'}, your email is confirmed. Your application is now with our team. Log in: ${LOGIN_URL}`;
        break;

      case 'profile_approved':
        subject = 'Account approved. Welcome to SourceCo.';
        htmlContent = buildApprovalHtml(user_name || 'there');
        textContent = `Hi ${user_name || 'there'}, your account has been approved. Log in: ${LOGIN_URL}`;
        break;

      case 'profile_rejected': {
        const reason = (event.metadata?.rejection_reason as string) || 'Application did not meet our criteria';
        subject = 'SourceCo account update';
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

    // For user_created events, notify support inbox
    if (event_type === 'user_created') {
      try {
        const company = (event.metadata?.company as string) || '';
        const adminSubject = `New user registration: ${user_name} (${user_email})`;
        const adminHtml = wrapEmailHtml({
          bodyHtml: `
    <p>A new user has registered on the marketplace:</p>
    <div style="background: #F7F6F3; padding: 16px; border-radius: 6px; margin: 20px 0;">
      <p style="margin: 0 0 4px; font-size: 14px; color: #6B6B6B;">Name: ${escapeHtml(user_name)}</p>
      <p style="margin: 0 0 4px; font-size: 14px; color: #6B6B6B;">Email: ${escapeHtml(user_email)}</p>
      ${company ? `<p style="margin: 0; font-size: 14px; color: #6B6B6B;">Company: ${escapeHtml(company)}</p>` : ''}
    </div>
    <div style="text-align: center; margin: 32px 0;">
      <a href="https://marketplace.sourcecodeals.com/admin/users" style="display: inline-block; background: #000000; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 15px;">Review Users</a>
    </div>`,
          preheader: `New registration: ${user_name} (${user_email})`,
        });

        await sendEmail({
          templateName: 'journey_admin_new_user',
          to: 'support@sourcecodeals.com',
          toName: 'SourceCo Support',
          subject: adminSubject,
          htmlContent: adminHtml,
          senderName: 'SourceCo',
          isTransactional: true,
        });
        console.log(`[${correlationId}] Admin notification sent to support inbox for new user registration`);
      } catch (adminErr) {
        console.error(`[${correlationId}] Failed to notify support inbox of new user:`, adminErr);
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
