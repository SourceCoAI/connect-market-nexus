import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, corsPreflightResponse } from "../_shared/cors.ts";
import { requireAdmin } from "../_shared/auth.ts";

/**
 * send-portal-notification
 *
 * Called after a deal is pushed to a portal. Sends email notification
 * to all active portal users in the organisation.
 *
 * Input: {
 *   portal_org_id: string,
 *   push_id: string,
 *   deal_headline: string,
 *   priority: string,
 *   push_note?: string
 * }
 *
 * Requires admin authentication.
 */

interface NotificationRequest {
  portal_org_id: string;
  push_id: string;
  deal_headline: string;
  priority: string;
  push_note?: string;
}

const handler = async (req: Request): Promise<Response> => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return corsPreflightResponse(req);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

  const auth = await requireAdmin(req, supabaseAdmin);
  if (!auth.isAdmin) {
    return new Response(
      JSON.stringify({ error: auth.error }),
      {
        status: auth.authenticated ? 403 : 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  try {
    const body: NotificationRequest = await req.json();
    const { portal_org_id, push_id, deal_headline, priority, push_note } = body;

    // Validate inputs
    if (!portal_org_id || !push_id || !deal_headline || !priority) {
      return new Response(
        JSON.stringify({ error: "portal_org_id, push_id, deal_headline, and priority are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Step 1: Fetch all active portal users for the org ──
    const { data: activeUsers, error: usersError } = await supabaseAdmin
      .from("portal_users")
      .select("id, email, name")
      .eq("portal_org_id", portal_org_id)
      .eq("is_active", true)
      .not("email", "is", null);

    if (usersError) {
      console.error("[send-portal-notification] Failed to fetch portal users:", usersError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch portal users" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!activeUsers || activeUsers.length === 0) {
      console.log(`[send-portal-notification] No active users for org ${portal_org_id}`);
      return new Response(
        JSON.stringify({ notified_count: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Step 2: Fetch the portal_organizations record ──
    const { data: org, error: orgError } = await supabaseAdmin
      .from("portal_organizations")
      .select("name, portal_slug, notification_frequency")
      .eq("id", portal_org_id)
      .single();

    if (orgError || !org) {
      console.error("[send-portal-notification] Failed to fetch org:", orgError);
      return new Response(
        JSON.stringify({ error: "Portal organization not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Step 3 & 4: Build and insert notifications based on frequency ──
    const priorityLabel = priority === "urgent" ? "URGENT: " : priority === "high" ? "HIGH: " : "";
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
    const notificationBody = bodyLines.join("\n");

    const isInstant = org.notification_frequency === "instant";

    const notifications = activeUsers.map((user) => ({
      portal_user_id: user.id,
      portal_org_id,
      push_id,
      type: "new_deal" as const,
      channel: "email" as const,
      subject,
      body: notificationBody,
      sent_at: isInstant ? new Date().toISOString() : null,
    }));

    const { error: insertError } = await supabaseAdmin
      .from("portal_notifications")
      .insert(notifications);

    if (insertError) {
      console.error("[send-portal-notification] Failed to insert notifications:", insertError);
      return new Response(
        JSON.stringify({ error: "Failed to create notifications" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const modeLabel = isInstant ? "instant" : org.notification_frequency;
    console.log(
      `[send-portal-notification] Created ${notifications.length} notification(s) ` +
      `for org ${portal_org_id} (mode: ${modeLabel})`
    );

    return new Response(
      JSON.stringify({ notified_count: notifications.length }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("[send-portal-notification] Error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

serve(handler);
