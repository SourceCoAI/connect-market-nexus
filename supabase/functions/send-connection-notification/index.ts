import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';
import { requireAuth, escapeHtml, escapeHtmlWithBreaks } from '../_shared/auth.ts';
import { sendEmail } from '../_shared/email-sender.ts';
import { wrapEmailHtml } from '../_shared/email-template-wrapper.ts';

interface ConnectionNotificationRequest {
  type: 'user_confirmation' | 'admin_notification' | 'approval_notification';
  recipientEmail?: string;
  recipientName?: string;
  requesterName: string;
  requesterEmail: string;
  listingTitle: string;
  listingId: string;
  message?: string;
  requestId?: string;
}

function buildUserConfirmationHtml(
  listingTitle: string,
  listingUrl: string,
  loginUrl: string,
  message?: string,
): string {
  return wrapEmailHtml({
    bodyHtml: `
    <h1 style="font-size: 20px; font-weight: 700; margin: 0 0 24px 0;">Introduction request received.</h1>
    <p>We've received your introduction request for <strong>${escapeHtml(listingTitle)}</strong>. Our team reviews every request and selects buyers based on fit — you'll hear from us within 24 hours.</p>
    ${message ? `
    <div style="background: #FCF9F0; border-left: 4px solid #DEC76B; padding: 16px; border-radius: 0 8px 8px 0; margin: 0 0 24px 0;">
      <p style="margin: 0 0 4px 0; font-size: 12px; color: #9A9A9A; font-weight: 600;">YOUR MESSAGE</p>
      <p style="margin: 0; font-size: 14px; font-style: italic;">"${escapeHtmlWithBreaks(message)}"</p>
    </div>` : ''}
    <p style="font-weight: 600;">What happens if you're selected</p>
    <ul style="padding-left: 20px;">
      <li>We make a direct introduction to the business owner</li>
      <li>You'll receive access to deal details and supporting materials</li>
      <li>Our team supports through the process</li>
    </ul>
    <p>In the meantime, keep browsing — new deals are added to the pipeline regularly.</p>
    <div style="text-align: center; margin: 32px 0;">
      <a href="${listingUrl}" style="display: inline-block; background: #1a1a2e; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px; margin-right: 12px;">View Listing</a>
      <a href="${loginUrl}" style="display: inline-block; background: #ffffff; color: #1a1a2e; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px; border: 1px solid #E5DDD0;">Dashboard</a>
    </div>`,
    preheader: "Our team reviews every request. You'll hear from us within 24 hours.",
  });
}

function buildAdminNotificationHtml(
  requesterName: string,
  requesterEmail: string,
  listingTitle: string,
  _listingUrl: string,
  adminUrl: string,
  message?: string,
): string {
  return wrapEmailHtml({
    bodyHtml: `
    <h1 style="font-size: 20px; font-weight: 700; margin: 0 0 24px 0;">New Connection Request: ${escapeHtml(listingTitle)}</h1>
    <p><strong>${escapeHtml(requesterName)}</strong> (${escapeHtml(requesterEmail)}) has submitted a connection request for <strong>${escapeHtml(listingTitle)}</strong>.</p>
    ${message ? `
    <div style="background: #FCF9F0; border-left: 4px solid #DEC76B; padding: 16px; border-radius: 0 8px 8px 0; margin: 0 0 24px 0;">
      <p style="margin: 0 0 4px 0; font-size: 12px; color: #9A9A9A; font-weight: 600;">BUYER MESSAGE</p>
      <p style="margin: 0; font-size: 14px; font-style: italic;">"${escapeHtmlWithBreaks(message)}"</p>
    </div>` : ''}
    <p>Log in to the admin dashboard to review and respond.</p>
    <div style="text-align: center; margin: 32px 0;">
      <a href="${adminUrl}" style="display: inline-block; background: #1a1a2e; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px;">View in Dashboard</a>
    </div>`,
    preheader: `${requesterName} submitted a connection request for ${listingTitle}.`,
  });
}

const handler = async (req: Request): Promise<Response> => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') return corsPreflightResponse(req);

  try {
    const requestData: ConnectionNotificationRequest = await req.json();

    if (requestData.type !== 'admin_notification') {
      const auth = await requireAuth(req);
      if (!auth.authenticated) {
        return new Response(JSON.stringify({ error: auth.error }), {
          status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }
    }

    const { type, recipientEmail, recipientName, requesterName, requesterEmail, listingTitle, listingId, message, requestId } = requestData;
    console.log('Processing connection notification:', { type, requesterName, listingTitle, requestId });

    const loginUrl = 'https://marketplace.sourcecodeals.com/login';
    const listingUrl = `https://marketplace.sourcecodeals.com/listing/${listingId}`;
    const adminUrl = 'https://marketplace.sourcecodeals.com/admin/marketplace/connections';

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    if (type === 'user_confirmation') {
      if (!recipientEmail) throw new Error('recipientEmail is required for user_confirmation');

      const subject = `Introduction request received — ${escapeHtml(listingTitle)}`;
      const htmlContent = buildUserConfirmationHtml(listingTitle, listingUrl, loginUrl, message);

      const result = await sendEmail({
        templateName: 'connection_user_confirmation',
        to: recipientEmail,
        toName: recipientName || requesterName,
        subject,
        htmlContent,
        senderName: 'SourceCo',
        isTransactional: true,
      });

      if (!result.success) throw new Error(`Failed to send confirmation: ${result.error}`);
      console.log('User confirmation sent to:', recipientEmail);

    } else if (type === 'approval_notification') {
      if (!recipientEmail) throw new Error('recipientEmail is required for approval_notification');

      const buyerMessagesUrl = 'https://marketplace.sourcecodeals.com/my-deals';
      const subject = `You're in — introduction to ${escapeHtml(listingTitle)} approved.`;
      const htmlContent = wrapEmailHtml({
        bodyHtml: `
    <h1 style="font-size: 20px; font-weight: 700; margin: 0 0 24px 0;">Introduction Approved</h1>
    <p>Your introduction to <strong>${escapeHtml(listingTitle)}</strong> has been approved.</p>
    <p>We're making a direct introduction to the business owner. You'll receive a message from our team with next steps — typically within one business day.</p>
    <p style="font-weight: 600;">What to expect</p>
    <ul style="padding-left: 20px;">
      <li>Our team facilitates the initial introduction</li>
      <li>You'll receive access to deal details and supporting materials</li>
      <li>Reply to any email or message us in the platform — we support through the process</li>
    </ul>
    <p>This is an exclusive introduction — we work with a small number of buyers per deal. Move at your own pace, but don't sit on it.</p>
    <div style="text-align: center; margin: 32px 0;">
      <a href="${buyerMessagesUrl}" style="display: inline-block; background: #1a1a2e; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px;">View Messages</a>
    </div>`,
        preheader: "Your introduction is confirmed. Here's what happens next.",
        recipientEmail,
      });

      const result = await sendEmail({
        templateName: 'connection_approval_notification',
        to: recipientEmail,
        toName: recipientName || requesterName,
        subject,
        htmlContent,
        senderName: 'SourceCo',
        isTransactional: true,
      });

      if (!result.success) throw new Error(`Failed to send approval email: ${result.error}`);
      console.log('Connection approval email sent to:', recipientEmail);

    } else {
      // Admin notification
      const { data: adminRoles, error: rolesError } = await supabase
        .from('user_roles').select('user_id').eq('role', 'admin');

      if (rolesError || !adminRoles?.length) throw new Error('No admin users found');

      const adminIds = adminRoles.map((r) => r.user_id);
      const { data: adminProfiles, error: profilesError } = await supabase
        .from('profiles').select('id, first_name, last_name, email').in('id', adminIds);

      if (profilesError || !adminProfiles?.length) throw new Error('No admin profiles found');

      const subject = `New Connection Request: ${listingTitle} — ${requesterName}`;
      let sentCount = 0;

      for (const admin of adminProfiles) {
        if (!admin.email) continue;
        const adminName = `${admin.first_name || ''} ${admin.last_name || ''}`.trim() || 'Admin';
        const htmlContent = buildAdminNotificationHtml(requesterName, requesterEmail, listingTitle, listingUrl, adminUrl, message);

        const result = await sendEmail({
          templateName: 'connection_admin_notification',
          to: admin.email,
          toName: adminName,
          subject,
          htmlContent,
          senderName: 'SourceCo',
          isTransactional: true,
        });

        if (result.success) sentCount++;
        else console.error('Failed to notify admin:', admin.email, result.error);
      }

      console.log(`Admin notifications sent: ${sentCount}/${adminProfiles.length}`);
    }

    return new Response(
      JSON.stringify({ success: true, message: 'Connection notification sent' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 },
    );
  } catch (error: unknown) {
    console.error('Error in send-connection-notification:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Failed to send connection notification' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 },
    );
  }
};

serve(handler);
