import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';
import { requireAuth, escapeHtml, escapeHtmlWithBreaks } from '../_shared/auth.ts';
import { logEmailDelivery } from '../_shared/email-logger.ts';
import { sendViaBervo } from '../_shared/brevo-sender.ts';

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
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
<body style="margin: 0; padding: 0; background-color: #ffffff; font-family: 'Montserrat', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <div style="max-width: 600px; margin: 0 auto; padding: 40px 24px;">
    <div style="margin-bottom: 32px;">
      <div style="font-size: 11px; font-weight: 600; letter-spacing: 1.2px; color: #9A9A9A; text-transform: uppercase; margin-bottom: 8px;">SOURCECO</div>
    </div>

    <h1 style="color: #0E101A; font-size: 20px; font-weight: 700; margin: 0 0 24px 0; line-height: 1.4;">
      Introduction request received.
    </h1>

    <div style="color: #3A3A3A; font-size: 15px; line-height: 1.7;">
      <p style="margin: 0 0 16px 0;">
        We've received your introduction request for <strong>${escapeHtml(listingTitle)}</strong>. Our team reviews every request and selects buyers based on fit — you'll hear from us within 24 hours.
      </p>

      ${
        message
          ? `
      <div style="background: #FCF9F0; border-left: 4px solid #DEC76B; padding: 16px; border-radius: 0 8px 8px 0; margin: 0 0 24px 0;">
        <p style="margin: 0 0 4px 0; font-size: 12px; color: #9A9A9A; font-weight: 600;">YOUR MESSAGE</p>
        <p style="margin: 0; color: #3A3A3A; font-size: 14px; font-style: italic;">"${escapeHtmlWithBreaks(message)}"</p>
      </div>
      `
          : ''
      }

      <p style="margin: 0 0 8px 0; font-weight: 600;">What happens if you're selected</p>
      <ul style="margin: 0 0 24px 0; padding-left: 20px; color: #3A3A3A;">
        <li>We make a direct introduction to the business owner</li>
        <li>You'll receive access to deal details and supporting materials</li>
        <li>Our team supports through the process</li>
      </ul>
      <p style="margin: 0 0 24px 0;">In the meantime, keep browsing — new deals are added to the pipeline regularly.</p>
    </div>

    <div style="text-align: center; margin: 32px 0;">
      <a href="${listingUrl}" style="display: inline-block; background: #0E101A; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px; margin-right: 12px;">View Listing</a>
      <a href="${loginUrl}" style="display: inline-block; background: #ffffff; color: #0E101A; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px; border: 1px solid #E5DDD0;">Dashboard</a>
    </div>

    <div style="margin-top: 48px; padding-top: 24px; border-top: 1px solid #E5DDD0;">
      <p style="color: #9A9A9A; font-size: 12px; margin: 0;">
        This is an automated notification from SourceCo. If you have questions, email us at adam.haile@sourcecodeals.com
      </p>
    </div>
  </div>
</body>
</html>`;
}

function buildAdminNotificationHtml(
  requesterName: string,
  requesterEmail: string,
  listingTitle: string,
  listingUrl: string,
  adminUrl: string,
  message?: string,
): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
<body style="margin: 0; padding: 0; background-color: #ffffff; font-family: 'Montserrat', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <div style="max-width: 600px; margin: 0 auto; padding: 40px 24px;">
    <div style="margin-bottom: 32px;">
      <div style="font-size: 11px; font-weight: 600; letter-spacing: 1.2px; color: #9A9A9A; text-transform: uppercase; margin-bottom: 8px;">SOURCECO</div>
    </div>

    <h1 style="color: #0E101A; font-size: 20px; font-weight: 700; margin: 0 0 24px 0; line-height: 1.4;">
      New Connection Request: ${escapeHtml(listingTitle)}
    </h1>

    <div style="color: #3A3A3A; font-size: 15px; line-height: 1.7;">
      <p style="margin: 0 0 16px 0;">
        <strong>${escapeHtml(requesterName)}</strong> (${escapeHtml(requesterEmail)}) has submitted a connection request for <strong>${escapeHtml(listingTitle)}</strong>.
      </p>

      ${
        message
          ? `
      <div style="background: #FCF9F0; border-left: 4px solid #DEC76B; padding: 16px; border-radius: 0 8px 8px 0; margin: 0 0 24px 0;">
        <p style="margin: 0 0 4px 0; font-size: 12px; color: #9A9A9A; font-weight: 600;">BUYER MESSAGE</p>
        <p style="margin: 0; color: #3A3A3A; font-size: 14px; font-style: italic;">"${escapeHtmlWithBreaks(message)}"</p>
      </div>
      `
          : ''
      }

      <p style="margin: 0 0 24px 0;">Log in to the admin dashboard to review and respond.</p>
    </div>

    <div style="text-align: center; margin: 32px 0;">
      <a href="${adminUrl}" style="display: inline-block; background: #0E101A; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px;">
        View in Dashboard
      </a>
    </div>

    <div style="margin-top: 48px; padding-top: 24px; border-top: 1px solid #E5DDD0;">
      <p style="color: #9A9A9A; font-size: 12px; margin: 0;">
        This is an automated notification from SourceCo. You received this because a buyer submitted a connection request.
      </p>
    </div>
  </div>
</body>
</html>`;
}

const handler = async (req: Request): Promise<Response> => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(req);
  }

  try {
    const requestData: ConnectionNotificationRequest = await req.json();

    // Phase 88: Allow unauthenticated calls for admin_notification type (landing page).
    // Other notification types (user_confirmation, approval_notification) still require auth.
    if (requestData.type !== 'admin_notification') {
      const auth = await requireAuth(req);
      if (!auth.authenticated) {
        return new Response(JSON.stringify({ error: auth.error }), {
          status: 401,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }
    }
    const {
      type,
      recipientEmail,
      recipientName,
      requesterName,
      requesterEmail,
      listingTitle,
      listingId,
      message,
      requestId,
    } = requestData;

    console.log('Processing connection notification:', {
      type,
      requesterName,
      listingTitle,
      requestId,
    });

    const loginUrl = `https://marketplace.sourcecodeals.com/login`;
    const listingUrl = `https://marketplace.sourcecodeals.com/listing/${listingId}`;
    const adminUrl = `https://marketplace.sourcecodeals.com/admin/marketplace/connections`;

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    if (type === 'user_confirmation') {
      // Send confirmation to the buyer
      if (!recipientEmail) {
        throw new Error('recipientEmail is required for user_confirmation');
      }

      const subject = `Introduction request received — ${escapeHtml(listingTitle)}`;
      const htmlContent = buildUserConfirmationHtml(listingTitle, listingUrl, loginUrl, message);
      const correlationId = `connection-confirm-${requestId || crypto.randomUUID()}`;

      const result = await sendViaBervo({
        to: recipientEmail,
        toName: recipientName || requesterName,
        subject,
        htmlContent,
        senderName: 'SourceCo',
      });

      await logEmailDelivery(supabase, {
        email: recipientEmail,
        emailType: 'connection_user_confirmation',
        status: result.success ? 'sent' : 'failed',
        correlationId,
        errorMessage: result.success ? undefined : result.error,
      });

      if (!result.success) throw new Error(`Failed to send confirmation: ${result.error}`);

      console.log('User confirmation sent to:', recipientEmail);
    } else if (type === 'approval_notification') {
      // Send approval email to the buyer when connection request is approved
      if (!recipientEmail) {
        throw new Error('recipientEmail is required for approval_notification');
      }

      const correlationId = `connection-approval-${requestId || crypto.randomUUID()}`;

      // Idempotency check
      const { data: existingLog } = await supabase
        .from('email_delivery_logs')
        .select('id')
        .eq('correlation_id', correlationId)
        .eq('status', 'sent')
        .maybeSingle();

      if (existingLog) {
        console.log('Approval email already sent for:', correlationId);
        return new Response(
          JSON.stringify({ success: true, message: 'Already sent', duplicate: true }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 },
        );
      }

      // Phase 90: CTA links to /my-deals (deal command center) instead of /messages
      const buyerMessagesUrl = `https://marketplace.sourcecodeals.com/my-deals`;
      const subject = `You're in — introduction to ${escapeHtml(listingTitle)} approved.`;
      const htmlContent = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
<body style="margin: 0; padding: 0; background-color: #ffffff; font-family: 'Montserrat', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <div style="max-width: 600px; margin: 0 auto; padding: 40px 24px;">
    <div style="margin-bottom: 32px;">
      <div style="font-size: 11px; font-weight: 600; letter-spacing: 1.2px; color: #9A9A9A; text-transform: uppercase;">SOURCECO</div>
    </div>

    <h1 style="color: #0E101A; font-size: 20px; font-weight: 700; margin: 0 0 24px 0; line-height: 1.4;">
      Introduction Approved
    </h1>

    <div style="color: #3A3A3A; font-size: 15px; line-height: 1.7;">
      <p style="margin: 0 0 16px 0;">
        Your introduction to <strong>${escapeHtml(listingTitle)}</strong> has been approved.
      </p>
      <p style="margin: 0 0 16px 0;">
        We're making a direct introduction to the business owner. You'll receive a message from our team with next steps — typically within one business day.
      </p>
      <p style="margin: 0 0 8px 0; font-weight: 600;">What to expect</p>
      <ul style="margin: 0 0 24px 0; padding-left: 20px; color: #3A3A3A;">
        <li>Our team facilitates the initial introduction</li>
        <li>You'll receive access to deal details and supporting materials</li>
        <li>Reply to any email or message us in the platform — we support through the process</li>
      </ul>
      <p style="margin: 0 0 24px 0;">This is an exclusive introduction — we work with a small number of buyers per deal. Move at your own pace, but don't sit on it.</p>
    </div>

    <div style="text-align: center; margin: 32px 0;">
      <a href="${buyerMessagesUrl}" style="display: inline-block; background: #0E101A; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px;">View Messages</a>
    </div>

    <div style="margin-top: 48px; padding-top: 24px; border-top: 1px solid #E5DDD0;">
      <p style="color: #9A9A9A; font-size: 12px; margin: 0;">
        This is an automated notification from SourceCo. If you have questions, email us at adam.haile@sourcecodeals.com
      </p>
    </div>
  </div>
</body>
</html>`;

      const result = await sendViaBervo({
        to: recipientEmail,
        toName: recipientName || requesterName,
        subject,
        htmlContent,
        senderName: 'SourceCo',
        replyToEmail: Deno.env.get('SENDER_EMAIL') || 'adam.haile@sourcecodeals.com',
        replyToName: Deno.env.get('SENDER_NAME') || 'Adam Haile',
      });

      await logEmailDelivery(supabase, {
        email: recipientEmail,
        emailType: 'connection_approval_notification',
        status: result.success ? 'sent' : 'failed',
        correlationId,
        errorMessage: result.success ? undefined : result.error,
      });

      if (!result.success) throw new Error(`Failed to send approval email: ${result.error}`);

      console.log('Connection approval email sent to:', recipientEmail);
    } else {
      // Admin notification: look up all admins from user_roles
      const { data: adminRoles, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'admin');

      if (rolesError || !adminRoles?.length) {
        console.error('Failed to find admins:', rolesError);
        throw new Error('No admin users found');
      }

      const adminIds = adminRoles.map((r) => r.user_id);
      const { data: adminProfiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, email')
        .in('id', adminIds);

      if (profilesError || !adminProfiles?.length) {
        console.error('Failed to fetch admin profiles:', profilesError);
        throw new Error('No admin profiles found');
      }

      const subject = `New Connection Request: ${listingTitle} — ${requesterName}`;
      let sentCount = 0;

      for (const admin of adminProfiles) {
        if (!admin.email) continue;

        const correlationId = `connection-admin-${requestId || crypto.randomUUID()}-${admin.id}`;
        const adminName = `${admin.first_name || ''} ${admin.last_name || ''}`.trim() || 'Admin';
        const htmlContent = buildAdminNotificationHtml(
          requesterName,
          requesterEmail,
          listingTitle,
          listingUrl,
          adminUrl,
          message,
        );

        const result = await sendViaBervo({
          to: admin.email,
          toName: adminName,
          subject,
          htmlContent,
          senderName: 'SourceCo',
        });

        await logEmailDelivery(supabase, {
          email: admin.email,
          emailType: 'connection_admin_notification',
          status: result.success ? 'sent' : 'failed',
          correlationId,
          errorMessage: result.success ? undefined : result.error,
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
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Failed to send connection notification',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 },
    );
  }
};

serve(handler);
