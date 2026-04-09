import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';
import { requireAuth } from '../_shared/auth.ts';

/**
 * send-portal-notification
 *
 * Called when a portal user needs to be notified about a deal push.
 * Queues a portal_notifications row with sent_at = NULL — the
 * portal-notification-processor cron job picks it up and delivers
 * the email within ~1 minute (instant) or at the configured digest time.
 *
 * For other notification types (messages, reminders), use the database
 * trigger or the portal-auto-reminder function.
 *
 * Auth: any authenticated user. push_id is validated against portal_org_id.
 */

interface NotificationRequest {
  portal_org_id: string;
  push_id: string;
  deal_headline: string;
  priority?: string;
  push_note?: string;
}

const handler = async (req: Request): Promise<Response> => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(req);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

  const auth = await requireAuth(req);
  if (!auth.authenticated) {
    return new Response(JSON.stringify({ error: auth.error }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const body: NotificationRequest = await req.json();
    const { portal_org_id, push_id, deal_headline, priority = 'standard', push_note } = body;

    if (!portal_org_id || !push_id || !deal_headline) {
      return new Response(
        JSON.stringify({ error: 'portal_org_id, push_id, and deal_headline are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Validate push exists and belongs to portal_org
    const { data: pushRecord, error: pushError } = await supabaseAdmin
      .from('portal_deal_pushes')
      .select('id')
      .eq('id', push_id)
      .eq('portal_org_id', portal_org_id)
      .maybeSingle();

    if (pushError || !pushRecord) {
      console.warn(
        `[send-portal-notification] Invalid push_id ${push_id} for org ${portal_org_id}`,
      );
      return new Response(JSON.stringify({ error: 'Invalid push_id or portal_org_id' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch active portal users
    const { data: activeUsers, error: usersError } = await supabaseAdmin
      .from('portal_users')
      .select('id, email, name')
      .eq('portal_org_id', portal_org_id)
      .eq('is_active', true)
      .not('email', 'is', null);

    if (usersError) {
      console.error('[send-portal-notification] Failed to fetch portal users:', usersError);
      return new Response(JSON.stringify({ error: 'Failed to fetch portal users' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!activeUsers || activeUsers.length === 0) {
      return new Response(JSON.stringify({ notified_count: 0 }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch org for name
    const { data: org, error: orgError } = await supabaseAdmin
      .from('portal_organizations')
      .select('name, notification_frequency')
      .eq('id', portal_org_id)
      .single();

    if (orgError || !org) {
      return new Response(JSON.stringify({ error: 'Portal organization not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Build notification subject + body (plain text — processor will wrap in HTML)
    const priorityLabel = priority === 'urgent' ? 'URGENT: ' : priority === 'high' ? 'HIGH: ' : '';
    const subject = `${priorityLabel}New Deal: ${deal_headline}`;
    const bodyLines = [
      `A new deal has been shared with ${org.name}.`,
      ``,
      `Deal: ${deal_headline}`,
      `Priority: ${priority}`,
    ];
    if (push_note) {
      bodyLines.push(``, `Note from your advisor: ${push_note}`);
    }
    bodyLines.push(``, `View it now in your portal.`);
    const notificationBody = bodyLines.join('\n');

    // Queue notifications — sent_at = null, processor handles delivery
    const notifications = activeUsers.map((user) => ({
      portal_user_id: user.id,
      portal_org_id,
      push_id,
      type: 'new_deal' as const,
      channel: 'email' as const,
      subject,
      body: notificationBody,
      sent_at: null,
    }));

    const { error: insertError } = await supabaseAdmin
      .from('portal_notifications')
      .insert(notifications);

    if (insertError) {
      console.error('[send-portal-notification] Failed to insert notifications:', insertError);
      return new Response(JSON.stringify({ error: 'Failed to create notifications' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(
      `[send-portal-notification] Queued ${notifications.length} notification(s) ` +
        `for org ${portal_org_id} (frequency: ${org.notification_frequency})`,
    );

    return new Response(JSON.stringify({ notified_count: notifications.length }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    console.error('[send-portal-notification] Error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
};

serve(handler);
