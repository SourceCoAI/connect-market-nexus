import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

import { getCorsHeaders, corsPreflightResponse } from "../_shared/cors.ts";
import { sendEmail } from "../_shared/email-sender.ts";

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

interface PasswordResetRequest {
  email?: string;
  action: 'request' | 'reset';
  token?: string;
  newPassword?: string;
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function generateAndStoreToken(userId: string) {
  // Invalidate existing tokens
  await supabase
    .from('password_reset_tokens')
    .update({ used: true })
    .eq('user_id', userId)
    .eq('used', false);

  // Generate secure token
  const rand = new Uint8Array(32);
  crypto.getRandomValues(rand);
  const token = bytesToHex(rand);
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour

  const { error } = await supabase
    .from('password_reset_tokens')
    .insert({ user_id: userId, token, expires_at: expiresAt });

  if (error) throw error;
  return token;
}

const handler = async (req: Request): Promise<Response> => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(req);
  }

  try {
    const { email, action, token, newPassword }: PasswordResetRequest = await req.json();

    if (action === 'request') {
      console.log(`Password reset requested for email: ${email}`);

      if (!email) {
        return new Response(
          JSON.stringify({ error: 'Email is required' }),
          { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
        );
      }

      // Look up user by email in profiles (service role bypasses RLS)
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', email)
        .maybeSingle();

      if (profileError) {
        console.error('Profile lookup failed:', profileError);
        // Do not leak details
        return new Response(
          JSON.stringify({ success: true, message: 'If the email exists, a reset link will be sent.' }),
          { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
        );
      }

      // If no user, still respond 200
      if (!profile?.id) {
        return new Response(
          JSON.stringify({ success: true, message: 'If the email exists, a reset link will be sent.' }),
          { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
        );
      }

      // Generate and store token directly
      let resetToken = '';
      try {
        resetToken = await generateAndStoreToken(profile.id);
      } catch (e) {
        console.error('Error creating reset token:', e);
        // Still do not leak existence
        return new Response(
          JSON.stringify({ success: true, message: 'If the email exists, a reset link will be sent.' }),
          { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
        );
      }

      // Security: Hardcode origin to prevent reflected URL attacks via Origin header
      const ALLOWED_ORIGINS = [
        'https://marketplace.sourcecodeals.com',
        'https://sourcecodeals.com',
      ];
      const requestOrigin = req.headers.get('origin') || '';
      const origin = ALLOWED_ORIGINS.includes(requestOrigin)
        ? requestOrigin
        : 'https://marketplace.sourcecodeals.com';
      const resetUrl = `${origin}/reset-password?token=${resetToken}`;

      // Try to send email via edge function (best-effort)
      let emailSent = false;
      try {
        const { error: emailError } = await supabase.functions.invoke('send-password-reset-email', {
          body: { email, resetToken, resetUrl }
        });
        emailSent = !emailError;
        if (emailError) console.warn('Password reset email failed:', emailError);
      } catch (err) {
        console.warn('Password reset email threw:', err);
      }

      return new Response(
        JSON.stringify({ success: true, message: 'If the email exists, a reset link will be sent.', emailSent }),
        { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    if (action === 'reset') {
      if (!token || !newPassword) {
        return new Response(
          JSON.stringify({ error: 'Token and new password are required' }),
          { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
        );
      }

      if (newPassword.length < 8) {
        return new Response(
          JSON.stringify({ error: 'Password must be at least 8 characters' }),
          { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
        );
      }

      console.log('Validating reset token...');

      // Validate token directly
      const { data: tokenRow } = await supabase
        .from('password_reset_tokens')
        .select('user_id')
        .eq('token', token)
        .eq('used', false)
        .gt('expires_at', new Date().toISOString())
        .maybeSingle();

      if (!tokenRow?.user_id) {
        return new Response(
          JSON.stringify({ error: 'Invalid or expired reset token' }),
          { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
        );
      }

      // Update password using Admin API
      const { error: resetError } = await supabase.auth.admin.updateUserById(tokenRow.user_id, {
        password: newPassword,
      });

      if (resetError) {
        console.error('Password reset failed:', resetError);
        return new Response(
          JSON.stringify({ error: 'Failed to reset password' }),
          { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
        );
      }

      // Mark token as used
      await supabase
        .from('password_reset_tokens')
        .update({ used: true })
        .eq('token', token);

      return new Response(
        JSON.stringify({ success: true, message: 'Password reset successfully' }),
        { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Invalid action' }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    );
  } catch (error: unknown) {
    console.error('Error in password-reset function:', error);
    return new Response(
      JSON.stringify({ error: error?.message || 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    );
  }
};

serve(handler);
