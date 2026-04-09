import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';
import { sendEmail } from '../_shared/email-sender.ts';
import { wrapEmailHtml } from '../_shared/email-template-wrapper.ts';

/**
 * portal-notification-processor
 *
 * Cron-triggered (every minute). Picks up portal_notifications rows where
 * sent_at IS NULL and delivers them via email.
 *
 * Handles all notification types: new_deal, message, reminder, status_change.
 * Respects each org's notification_frequency:
 *   - instant: always send
 *   - daily_digest: only send when called with ?mode=daily_digest
 *   - weekly_digest: only send when called with ?mode=weekly_digest
 *
 * No auth required (cron-triggered, uses service role internally).
 */

const PORTAL_BASE_URL = Deno.env.get('PORTAL_BASE_URL') || 'https://marketplace.sourcecodeals.com';

const BATCH_SIZE = 100;

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

interface PortalNotificationRow {
  id: string;
  portal_user_id: string;
  portal_org_id: string;
  push_id: string | null;
  type: string;
  subject: string | null;
  body: string | null;
  portal_user: {
    id: string;
    email: string;
    name: string | null;
  } | null;
  portal_org: {
    id: string;
    name: string;
    portal_slug: string;
    notification_frequency: string;
  } | null;
}

function buildEmailHtml(
  type: string,
  args: {
    orgName: string;
    portalSlug: string;
    pushId: string | null;
    subject: string;
    body: string;
    recipientEmail: string;
    recipientName: string;
  },
): string {
  const ctaUrl = args.pushId
    ? `${PORTAL_BASE_URL}/portal/${args.portalSlug}/deals/${args.pushId}`
    : `${PORTAL_BASE_URL}/portal/${args.portalSlug}`;

  const ctaLabel =
    type === 'message'
      ? 'View Message'
      : type === 'reminder'
        ? 'Review the Deal'
        : type === 'new_deal'
          ? 'Review the Deal'
          : 'Open Portal';

  // Convert plain-text body to safe HTML paragraphs
  const bodyParagraphs = args.body
    .split('\n\n')
    .map(
      (p) =>
        `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#1A1A1A;">${escapeHtml(p).replace(/\n/g, '<br/>')}</p>`,
    )
    .join('');

  const heading =
    type === 'message'
      ? 'New Message'
      : type === 'reminder'
        ? 'Friendly Reminder'
        : type === 'new_deal'
          ? args.subject
          : 'Portal Update';

  const bodyHtml = `
    <h1 style="margin:0 0 16px;font-size:22px;font-weight:600;color:#1A1A1A;">${escapeHtml(heading)}</h1>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#1A1A1A;">Hi ${escapeHtml(args.recipientName)},</p>
    ${bodyParagraphs}
    <p style="margin:24px 0;text-align:center;">
      <a href="${ctaUrl}" style="display:inline-block;padding:14px 32px;background:#1A1A1A;color:#FFFFFF;text-decoration:none;border-radius:6px;font-size:15px;font-weight:600;">${ctaLabel}</a>
    </p>
  `;

  return wrapEmailHtml({
    bodyHtml,
    preheader: args.subject,
    recipientEmail: args.recipientEmail,
  });
}

const handler = async (req: Request): Promise<Response> => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(req);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

  // Determine processing mode from query params or body
  const url = new URL(req.url);
  let mode = url.searchParams.get('mode') || 'instant';
  try {
    const body = await req.json().catch(() => ({}));
    if (body && body.mode) mode = body.mode;
  } catch {
    // ignore
  }

  // Mode determines which orgs we process:
  //  - instant: only orgs with notification_frequency = 'instant'
  //  - daily_digest: only orgs with notification_frequency = 'daily_digest'
  //  - weekly_digest: only orgs with notification_frequency = 'weekly_digest'
  const validModes = ['instant', 'daily_digest', 'weekly_digest'];
  if (!validModes.includes(mode)) {
    return new Response(JSON.stringify({ error: `Invalid mode: ${mode}` }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    // Fetch unsent notifications joined with user + org
    const { data: notifications, error } = await supabaseAdmin
      .from('portal_notifications')
      .select(
        `id, portal_user_id, portal_org_id, push_id, type, subject, body,
         portal_user:portal_users!portal_notifications_portal_user_id_fkey(id, email, name),
         portal_org:portal_organizations!portal_notifications_portal_org_id_fkey(id, name, portal_slug, notification_frequency)`,
      )
      .eq('channel', 'email')
      .is('sent_at', null)
      .limit(BATCH_SIZE);

    if (error) {
      console.error('[portal-notification-processor] Failed to fetch:', error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!notifications || notifications.length === 0) {
      return new Response(JSON.stringify({ processed: 0, sent: 0, skipped: 0, failed: 0, mode }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Filter to notifications matching the mode
    const filtered = (notifications as unknown as PortalNotificationRow[]).filter((n) => {
      if (!n.portal_user || !n.portal_org) return false;
      const orgFrequency = n.portal_org.notification_frequency;
      // Messages and reminders ALWAYS go through instant mode regardless of org setting
      if (n.type === 'message' || n.type === 'reminder') {
        return mode === 'instant';
      }
      // Other notification types respect org frequency
      return orgFrequency === mode;
    });

    let sent = 0;
    let failed = 0;
    let skipped = notifications.length - filtered.length;

    for (const notif of filtered) {
      if (!notif.portal_user || !notif.portal_org) {
        skipped++;
        continue;
      }

      try {
        const html = buildEmailHtml(notif.type, {
          orgName: notif.portal_org.name,
          portalSlug: notif.portal_org.portal_slug,
          pushId: notif.push_id,
          subject: notif.subject || 'Portal update',
          body: notif.body || '',
          recipientEmail: notif.portal_user.email,
          recipientName: notif.portal_user.name || notif.portal_user.email,
        });

        const result = await sendEmail({
          templateName: `portal_${notif.type}`,
          to: notif.portal_user.email,
          toName: notif.portal_user.name || undefined,
          subject: notif.subject || 'Portal update',
          htmlContent: html,
          textContent: notif.body || undefined,
          isTransactional: true,
          metadata: {
            portal_notification_id: notif.id,
            portal_org_id: notif.portal_org_id,
            push_id: notif.push_id,
            notification_type: notif.type,
          },
        });

        if (result.success) {
          await supabaseAdmin
            .from('portal_notifications')
            .update({ sent_at: new Date().toISOString() })
            .eq('id', notif.id);
          sent++;
        } else {
          failed++;
          console.warn(
            `[portal-notification-processor] Email failed for notification ${notif.id}: ${result.error}`,
          );
        }
      } catch (err) {
        failed++;
        console.error(`[portal-notification-processor] Exception for ${notif.id}:`, err);
      }
    }

    console.log(
      `[portal-notification-processor] mode=${mode} processed=${notifications.length} ` +
        `sent=${sent} failed=${failed} skipped=${skipped}`,
    );

    return new Response(
      JSON.stringify({ processed: notifications.length, sent, failed, skipped, mode }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error: unknown) {
    console.error('[portal-notification-processor] Error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
};

serve(handler);
