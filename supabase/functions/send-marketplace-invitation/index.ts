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

    const signupUrl = `${Deno.env.get('SITE_URL') || 'https://app.sourcecodeals.com'}/welcome`;
    const safeName = escapeHtml(name);
    const safeCustomMsg = customMessage ? escapeHtml(customMessage) : '';

    const htmlBody = wrapEmailHtml({
      bodyHtml: `
        <p style="font-size: 15px;">Hi ${safeName},</p>
        <p style="font-size: 14px; line-height: 1.6;">
          You've been invited to join the <strong>SourceCo Marketplace</strong> — a curated platform connecting qualified acquisition buyers with exclusive deal flow.
        </p>
        ${safeCustomMsg ? `
          <div style="background: #f3f4f6; border-radius: 8px; padding: 16px; margin: 16px 0;">
            <p style="font-size: 13px; color: #6b7280; margin: 0 0 4px 0; font-weight: 500;">Personal note:</p>
            <p style="font-size: 14px; margin: 0; line-height: 1.5;">${safeCustomMsg}</p>
          </div>
        ` : ''}
        <p style="font-size: 14px; line-height: 1.6;"><strong>What you get access to:</strong></p>
        <ul style="font-size: 14px; line-height: 1.8; padding-left: 20px;">
          <li>Exclusive off-market deal opportunities</li>
          <li>Direct introductions to business owners</li>
          <li>Secure data room access for diligence</li>
          <li>AI-powered deal matching based on your criteria</li>
        </ul>
        <div style="text-align: center; margin: 28px 0;">
          <a href="${signupUrl}" style="display: inline-block; background: #1a1a2e; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 6px; font-size: 14px; font-weight: 500;">Create Your Profile</a>
        </div>
        <p style="font-size: 12px; color: #9ca3af; text-align: center;">Questions? Reply to this email or contact us at deals@sourcecodeals.com</p>`,
      preheader: `You're invited to join SourceCo Marketplace`,
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
