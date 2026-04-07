import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, corsPreflightResponse } from "../_shared/cors.ts";

/**
 * portal-auto-reminder
 *
 * Called by a cron job. Finds stale deals across all portal orgs that
 * have auto-reminders enabled, sends reminder notifications, and
 * logs the activity.
 *
 * Input: none (cron-triggered, no auth needed - uses service role)
 */

const handler = async (req: Request): Promise<Response> => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return corsPreflightResponse(req);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

  try {
    // ── Step 1: Fetch all eligible portal organisations ──
    const { data: orgs, error: orgsError } = await supabaseAdmin
      .from("portal_organizations")
      .select("id, name, portal_slug, auto_reminder_days, auto_reminder_max")
      .eq("auto_reminder_enabled", true)
      .eq("status", "active")
      .is("deleted_at", null);

    if (orgsError) {
      console.error("[portal-auto-reminder] Failed to fetch orgs:", orgsError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch portal organizations" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!orgs || orgs.length === 0) {
      console.log("[portal-auto-reminder] No orgs with auto-reminders enabled");
      return new Response(
        JSON.stringify({ orgs_checked: 0, reminders_sent: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let totalRemindersSent = 0;

    for (const org of orgs) {
      const reminderDays = org.auto_reminder_days || 7;
      const reminderMax = org.auto_reminder_max || 2;

      // ── Step 2: Fetch stale deal pushes for this org ──
      // created_at < NOW() - auto_reminder_days interval
      // reminder_count < auto_reminder_max
      // status IN ('pending_review', 'viewed')
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - reminderDays);

      const { data: stalePushes, error: pushesError } = await supabaseAdmin
        .from("portal_deal_pushes")
        .select("id, portal_org_id, listing_id, push_note, reminder_count, deal_snapshot")
        .eq("portal_org_id", org.id)
        .in("status", ["pending_review", "viewed"])
        .lt("created_at", cutoffDate.toISOString())
        .lt("reminder_count", reminderMax);

      if (pushesError) {
        console.error(`[portal-auto-reminder] Failed to fetch pushes for org ${org.id}:`, pushesError);
        continue;
      }

      if (!stalePushes || stalePushes.length === 0) {
        continue;
      }

      // Fetch active users for this org once
      const { data: activeUsers, error: usersError } = await supabaseAdmin
        .from("portal_users")
        .select("id, email, name")
        .eq("portal_org_id", org.id)
        .eq("is_active", true)
        .not("email", "is", null);

      if (usersError || !activeUsers || activeUsers.length === 0) {
        console.log(`[portal-auto-reminder] No active users for org ${org.id}, skipping`);
        continue;
      }

      // ── Step 3: Process each stale push ──
      for (const push of stalePushes) {
        const dealHeadline =
          (push.deal_snapshot as Record<string, unknown>)?.headline as string ||
          "a deal";

        // Update reminder_count and last_reminder_at
        const { error: updateError } = await supabaseAdmin
          .from("portal_deal_pushes")
          .update({
            reminder_count: push.reminder_count + 1,
            last_reminder_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", push.id);

        if (updateError) {
          console.error(`[portal-auto-reminder] Failed to update push ${push.id}:`, updateError);
          continue;
        }

        // Insert reminder notifications for each active user
        const subject = `Reminder: ${dealHeadline} awaiting your review`;
        const body = [
          `This is a friendly reminder that "${dealHeadline}" is awaiting your review.`,
          ``,
          `This deal was shared with ${org.name} and has not yet received a response.`,
          ``,
          `Please log in to your portal to review the deal.`,
        ].join("\n");

        const notifications = activeUsers.map((user) => ({
          portal_user_id: user.id,
          portal_org_id: org.id,
          push_id: push.id,
          type: "reminder" as const,
          channel: "email" as const,
          subject,
          body,
          sent_at: new Date().toISOString(),
        }));

        const { error: notifError } = await supabaseAdmin
          .from("portal_notifications")
          .insert(notifications);

        if (notifError) {
          console.error(`[portal-auto-reminder] Failed to insert notifications for push ${push.id}:`, notifError);
          continue;
        }

        // Log activity
        await supabaseAdmin.from("portal_activity_log").insert({
          portal_org_id: org.id,
          actor_id: "00000000-0000-0000-0000-000000000000",
          actor_type: "admin",
          action: "reminder_sent",
          push_id: push.id,
          metadata: {
            deal_headline: dealHeadline,
            reminder_number: push.reminder_count + 1,
            users_notified: activeUsers.length,
          },
        });

        totalRemindersSent += activeUsers.length;
      }

      console.log(
        `[portal-auto-reminder] Org ${org.id} (${org.name}): ` +
        `processed ${stalePushes.length} stale push(es)`
      );
    }

    console.log(
      `[portal-auto-reminder] Complete: ${orgs.length} org(s) checked, ` +
      `${totalRemindersSent} reminder(s) sent`
    );

    return new Response(
      JSON.stringify({ orgs_checked: orgs.length, reminders_sent: totalRemindersSent }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("[portal-auto-reminder] Error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

serve(handler);
