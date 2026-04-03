import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';
import { logEmailDelivery } from '../_shared/email-logger.ts';
import { sendViaBervo } from '../_shared/brevo-sender.ts';

interface PasswordResetEmailRequest {
  email: string;
  resetToken: string;
  resetUrl?: string;
}

// ── In-memory rate limiter: 1 request per email per 60 seconds ──
const rateLimitMap = new Map<string, number>();
const RATE_LIMIT_WINDOW_MS = 60_000;

function isRateLimited(email: string): boolean {
  const now = Date.now();
  const key = email.toLowerCase().trim();
  const lastRequest = rateLimitMap.get(key);
  if (lastRequest && now - lastRequest < RATE_LIMIT_WINDOW_MS) {
    return true;
  }
  rateLimitMap.set(key, now);
  if (rateLimitMap.size > 500) {
    for (const [k, v] of rateLimitMap) {
      if (now - v > RATE_LIMIT_WINDOW_MS) rateLimitMap.delete(k);
    }
  }
  return false;
}

const handler = async (req: Request): Promise<Response> => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(req);
  }

  try {
    const { email }: PasswordResetEmailRequest = await req.json();

    const siteUrl = Deno.env.get('SITE_URL') || 'https://app.sourcecodeals.com';
    const resetUrl = `${siteUrl}/reset-password`;

    if (isRateLimited(email)) {
      console.warn(`Rate limited password reset request for: ${email}`);
      return new Response(
        JSON.stringify({ error: 'Please wait before requesting another password reset.' }),
        { status: 429, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    console.log(`Sending password reset email to: ${email}`);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const correlationId = crypto.randomUUID();

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Reset Your Password</h2>
        <p>You requested a password reset for your account.</p>
        <p>Click the button below to reset your password:</p>
        <a href="${resetUrl}" style="background-color: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block; margin: 16px 0;">
          Reset Password
        </a>
        <p>This link will expire in 1 hour.</p>
        <p>If you didn't request this password reset, please ignore this email.</p>
        <p style="color: #666; font-size: 12px;">If the button doesn't work, copy and paste this link: ${resetUrl}</p>
      </div>
    `;

    const textContent = `Reset your password using this link: ${resetUrl}\nThis link will expire in 1 hour. If you didn't request this, please ignore this email.`;

    const result = await sendViaBervo({
      to: email,
      toName: email,
      subject: 'Reset Your Password',
      htmlContent,
      textContent,
      senderName: 'SourceCo Marketplace',
      replyToEmail: Deno.env.get('ADMIN_EMAIL') || 'adam.haile@sourcecodeals.com',
      replyToName: 'SourceCo',
      isTransactional: true,
    });

    if (result.success) {
      console.log('Password reset email sent successfully via Brevo');
      await logEmailDelivery(supabase, {
        email,
        emailType: 'password_reset',
        status: 'sent',
        correlationId,
      });
      return new Response(JSON.stringify({ success: true, provider: 'brevo' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    console.error('Failed to send password reset email:', result.error);
    await logEmailDelivery(supabase, {
      email,
      emailType: 'password_reset',
      status: 'failed',
      correlationId,
      errorMessage: result.error,
    });

    return new Response(
      JSON.stringify({
        error: 'Email service temporarily unavailable. Please try again later.',
      }),
      {
        status: 503,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      },
    );
  } catch (error: unknown) {
    console.error('Error in send-password-reset-email function:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
};

serve(handler);
