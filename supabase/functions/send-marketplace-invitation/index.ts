import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4';

import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';
import { requireAdmin, escapeHtml } from '../_shared/auth.ts';
import { sendEmail } from '../_shared/email-sender.ts';
import { wrapEmailHtml } from '../_shared/email-template-wrapper.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

interface InvitationRequest {
  to: string;
  name: string;
  customMessage?: string;
}

const handler = async (req: Request): Promise<Response> => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(req);
  }

  try {
    const auth = await requireAdmin(req, supabase);
    if (!auth.isAdmin) {
      return new Response(JSON.stringify({ error: auth.error }), {
        status: auth.authenticated ? 403 : 401,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    const { to, name, customMessage }: InvitationRequest = await req.json();

    if (!to || !name) {
      return new Response(JSON.stringify({ error: 'Missing required fields: to, name' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    const signupUrl = `${Deno.env.get('SITE_URL') || 'https://marketplace.sourcecodeals.com'}/welcome`;
    const safeName = escapeHtml(name);
    const safeCustomMsg = customMessage ? escapeHtml(customMessage) : '';

    const htmlBody = wrapEmailHtml({
      bodyHtml: `
        <p>Hi ${safeName},</p>
        <p>You have been invited to join SourceCo, a private marketplace connecting qualified acquisition buyers with off-market deal flow.</p>
        ${safeCustomMsg ? `
          <div style="background: #F7F6F3; border-radius: 6px; padding: 16px; margin: 20px 0;">
            <p style="font-size: 13px; color: #6B6B6B; margin: 0 0 4px 0; font-weight: 600;">Personal note:</p>
            <p style="font-size: 14px; margin: 0; line-height: 1.6;">${safeCustomMsg}</p>
          </div>
        ` : ''}
        <p style="font-weight: 600;">What you get access to:</p>
        <ul style="line-height: 1.8; padding-left: 20px;">
          <li>Exclusive off-market deal opportunities</li>
          <li>Direct introductions to business owners</li>
          <li>Secure data room access for diligence</li>
          <li>AI-powered deal matching based on your criteria</li>
        </ul>
        <div style="text-align: center; margin: 28px 0;">
          <a href="${signupUrl}" style="display: inline-block; background: #000000; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 6px; font-size: 14px; font-weight: 600;">Create Your Profile</a>
        </div>
        <p style="font-size: 13px; color: #6B6B6B; text-align: center;">Questions? Reply to this email or contact deals@sourcecodeals.com</p>`,
      preheader: 'You have been invited to join SourceCo',
      recipientEmail: to,
    });

    const result = await sendEmail({
      templateName: 'marketplace_invitation',
      to,
      toName: safeName,
      subject: `${safeName}, you're invited to SourceCo Marketplace`,
      htmlContent: htmlBody,
      senderName: 'SourceCo Marketplace',
      isTransactional: true,
    });

    if (!result.success) {
      throw new Error(result.error || 'Failed to send invitation');
    }

    console.log(`Marketplace invitation sent to ${to}`, result.providerMessageId);

    return new Response(JSON.stringify({ success: true, emailId: result.providerMessageId }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  } catch (error: unknown) {
    console.error('Error sending marketplace invitation:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Failed to send invitation' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    );
  }
};

serve(handler);
