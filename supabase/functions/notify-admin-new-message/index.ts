import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4';
import { sendEmail } from '../_shared/email-sender.ts';
import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';
import { requireAuth, escapeHtml, escapeHtmlWithBreaks } from '../_shared/auth.ts';
import { wrapEmailHtml } from '../_shared/email-template-wrapper.ts';

interface AdminNotificationRequest {
  connection_request_id: string;
  message_preview: string;
}

function buildAdminNotificationHtml(buyerName: string, dealTitle: string, messagePreview: string, messageCenterUrl: string, adminEmail?: string): string {
  return wrapEmailHtml({
    bodyHtml: `
    <p>${escapeHtml(buyerName)} sent a new message regarding ${escapeHtml(dealTitle)}.</p>
    <div style="background: #F7F6F3; padding: 20px; margin: 24px 0;">
      <p style="margin: 0; font-size: 14px; font-style: italic;">"${escapeHtmlWithBreaks(messagePreview)}"</p>
    </div>
    <p>Log in to the Message Center to view the full message and reply.</p>
    <div style="text-align: center; margin: 28px 0;">
      <a href="${messageCenterUrl}" style="display: inline-block; background: #000000; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 14px;">View in Message Center</a>
    </div>`,
    preheader: `New buyer message from ${escapeHtml(buyerName)} regarding ${escapeHtml(dealTitle)}`,
    recipientEmail: adminEmail,
  });
}

const handler = async (req: Request): Promise<Response> => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') return corsPreflightResponse(req);

  try {
    const auth = await requireAuth(req);
    if (!auth.authenticated) {
      return new Response(JSON.stringify({ error: auth.error }), { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }

    const { connection_request_id, message_preview }: AdminNotificationRequest = await req.json();
    if (!connection_request_id) {
      return new Response(JSON.stringify({ success: false, error: 'connection_request_id is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }

    const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');

    const { data: request, error: reqError } = await supabase
      .from('connection_requests')
      .select(`id, user_id, listing_id, user:profiles!connection_requests_user_id_profiles_fkey(first_name, last_name, email), listing:listings!connection_requests_listing_id_fkey(title)`)
      .eq('id', connection_request_id).single();

    if (reqError || !request) {
      return new Response(JSON.stringify({ success: false, error: 'Connection request not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }

    const buyer = request.user as { first_name?: string; last_name?: string; email?: string } | null;
    const listing = request.listing as { title?: string } | null;
    const buyerName = `${buyer?.first_name || ''} ${buyer?.last_name || ''}`.trim() || 'A buyer';
    const dealTitle = listing?.title || 'a deal';
    const preview = (message_preview || '').substring(0, 200);
    const messageCenterUrl = 'https://marketplace.sourcecodeals.com/admin/marketplace/message-center';

    const { data: adminRoles, error: rolesError } = await supabase.from('user_roles').select('user_id').eq('role', 'admin');
    if (rolesError || !adminRoles?.length) {
      return new Response(JSON.stringify({ success: false, error: 'No admin users found' }),
        { status: 404, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }

    const adminIds = adminRoles.map((r) => r.user_id);
    const { data: adminProfiles, error: profilesError } = await supabase.from('profiles').select('id, first_name, last_name, email').in('id', adminIds);

    if (profilesError || !adminProfiles?.length) {
      return new Response(JSON.stringify({ success: false, error: 'No admin profiles found' }),
        { status: 404, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }

    const subject = `New Buyer Message: ${dealTitle} from ${buyerName}`;
    let sentCount = 0;

    for (const admin of adminProfiles) {
      if (!admin.email) continue;
      const adminName = `${admin.first_name || ''} ${admin.last_name || ''}`.trim() || 'Admin';
      const htmlContent = buildAdminNotificationHtml(buyerName, dealTitle, preview, messageCenterUrl, admin.email);

      const result = await sendEmail({
        templateName: 'buyer_message_admin_notification',
        to: admin.email,
        toName: adminName,
        subject,
        htmlContent,
        senderName: 'SourceCo',
        isTransactional: true,
      });

      if (result.success) sentCount++;
      else console.error('[notify-admin-new-message] Failed for', admin.email, ':', result.error);
    }

    console.log(`[notify-admin-new-message] Sent ${sentCount}/${adminProfiles.length} admin notifications`);

    return new Response(
      JSON.stringify({ success: true, sent_count: sentCount }),
      { headers: { 'Content-Type': 'application/json', ...corsHeaders } },
    );
  } catch (error: unknown) {
    console.error('[notify-admin-new-message] Error:', error);
    return new Response(JSON.stringify({ success: false, error: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }
};

serve(handler);
