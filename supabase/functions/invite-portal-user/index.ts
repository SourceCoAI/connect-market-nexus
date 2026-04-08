import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, corsPreflightResponse } from "../_shared/cors.ts";
import { requireAdmin } from "../_shared/auth.ts";
import { sendEmail } from "../_shared/email-sender.ts";
import { resolveTemplate } from "../_shared/email-templates.ts";

/**
 * invite-portal-user
 *
 * Invites a user to a client portal by:
 *   1. Creating (or finding) a Supabase auth user
 *   2. Creating a profile with approval_status='approved'
 *   3. Creating a contact record linked to the buyer
 *   4. Creating a portal_users row with profile_id set
 *   5. Generating a magic link so the user can log in
 *
 * Input: {
 *   portal_org_id: string,
 *   portal_slug: string,
 *   first_name: string,
 *   last_name?: string,
 *   email: string,
 *   role: 'primary_contact' | 'admin' | 'viewer',
 *   buyer_id?: string,
 *   contact_id?: string  // if reusing an existing contact
 * }
 *
 * Requires admin authentication.
 */

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VALID_ROLES = ["primary_contact", "admin", "viewer"];

interface InviteRequest {
  portal_org_id: string;
  portal_slug: string;
  first_name: string;
  last_name?: string;
  email: string;
  role: string;
  buyer_id?: string;
  contact_id?: string;
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
    const body: InviteRequest = await req.json();
    const {
      portal_org_id,
      portal_slug,
      first_name,
      last_name,
      email,
      role,
      buyer_id,
      contact_id,
    } = body;

    // Validate inputs
    if (!portal_org_id || !email || !first_name) {
      return new Response(
        JSON.stringify({ error: "portal_org_id, email, and first_name are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!EMAIL_REGEX.test(email)) {
      return new Response(
        JSON.stringify({ error: "Invalid email format" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!VALID_ROLES.includes(role)) {
      return new Response(
        JSON.stringify({ error: "Role must be 'primary_contact', 'admin', or 'viewer'" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const normalizedEmail = email.toLowerCase().trim();
    const fullName = [first_name, last_name].filter(Boolean).join(" ");

    // ── Step 1: Find or create Supabase auth user ──
    // First check if a profile exists with this email (more efficient than listUsers)
    const { data: existingProfile } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("email", normalizedEmail)
      .maybeSingle();

    let userId: string;
    let isNewUser = false;

    if (existingProfile) {
      userId = existingProfile.id;
      console.log(`[invite-portal-user] User already exists (${userId})`);
    } else {
      const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email: normalizedEmail,
        email_confirm: true,
        user_metadata: {
          first_name: first_name || "",
          last_name: last_name || "",
          invited_as_portal_user: true,
        },
      });

      if (createError) {
        console.error("[invite-portal-user] Failed to create auth user:", createError);
        return new Response(
          JSON.stringify({ error: "Failed to create user account" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      userId = newUser.user.id;
      isNewUser = true;
      console.log(`[invite-portal-user] Created auth user (${userId})`);
    }

    // ── Step 2: Ensure profile exists with approved status ──
    const { data: profileCheck } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("id", userId)
      .maybeSingle();

    if (profileCheck) {
      await supabaseAdmin
        .from("profiles")
        .update({
          approval_status: "approved",
          email_verified: true,
          updated_at: new Date().toISOString(),
        })
        .eq("id", userId);
    } else {
      await supabaseAdmin.from("profiles").insert({
        id: userId,
        email: normalizedEmail,
        first_name: first_name || "",
        last_name: last_name || "",
        approval_status: "approved",
        email_verified: true,
      });
    }

    // ── Step 3: Create or reuse contact record ──
    let finalContactId = contact_id || null;

    if (!finalContactId) {
      // Try to create a new contact; if email already exists, find it
      const { data: newContact, error: contactError } = await supabaseAdmin
        .from("contacts")
        .insert({
          first_name: first_name,
          last_name: last_name || "",
          email: normalizedEmail,
          contact_type: "buyer",
          source: "portal",
          remarketing_buyer_id: buyer_id || null,
        })
        .select("id")
        .single();

      if (newContact) {
        finalContactId = newContact.id;
      } else if (contactError) {
        // Try to find existing contact by email
        const { data: existingContact } = await supabaseAdmin
          .from("contacts")
          .select("id")
          .eq("email", normalizedEmail)
          .eq("contact_type", "buyer")
          .maybeSingle();

        if (existingContact) {
          finalContactId = existingContact.id;
        }
        console.log("[invite-portal-user] Contact lookup fallback:", finalContactId ? "found" : "none");
      }
    }

    // ── Step 4: Check for existing portal_user (handles re-invites) ──
    const { data: existingPortalUser } = await supabaseAdmin
      .from("portal_users")
      .select("id")
      .eq("portal_org_id", portal_org_id)
      .eq("email", normalizedEmail)
      .maybeSingle();

    let portalUserId: string;

    if (existingPortalUser) {
      // Update existing record with profile_id
      await supabaseAdmin
        .from("portal_users")
        .update({
          profile_id: userId,
          contact_id: finalContactId,
          is_active: true,
          role,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingPortalUser.id);
      portalUserId = existingPortalUser.id;
      console.log(`[invite-portal-user] Updated existing portal_user (${portalUserId})`);
    } else {
      const { data: newPortalUser, error: portalUserError } = await supabaseAdmin
        .from("portal_users")
        .insert({
          portal_org_id,
          profile_id: userId,
          contact_id: finalContactId,
          role,
          email: normalizedEmail,
          name: fullName,
          invite_sent_at: new Date().toISOString(),
        })
        .select("id")
        .single();

      if (portalUserError) {
        console.error("[invite-portal-user] Failed to create portal_user:", portalUserError);
        return new Response(
          JSON.stringify({ error: "Failed to create portal user" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      portalUserId = newPortalUser.id;
    }

    // ── Step 5: Generate magic link for portal access ──
    const siteUrl = Deno.env.get("SITE_URL") || "https://marketplace.sourcecodeals.com";
    const redirectTo = `${siteUrl}/portal/${portal_slug}`;

    const { data: magicLinkData, error: magicLinkError } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email: normalizedEmail,
      options: { redirectTo },
    });

    if (magicLinkError) {
      console.error("[invite-portal-user] Magic link error:", magicLinkError);
      // Non-fatal - user was still created, they can use password reset
    }

    // ── Step 5b: Send the portal invite email ──
    const magicLinkUrl = magicLinkData?.properties?.action_link || `${siteUrl}/auth`;

    // Look up portal org name for the email
    const { data: portalOrg } = await supabaseAdmin
      .from("portal_organizations")
      .select("name")
      .eq("id", portal_org_id)
      .maybeSingle();

    const portalName = portalOrg?.name || "Client";

    const resolved = resolveTemplate("portal_invite", {
      recipientName: fullName || first_name,
      portalName,
      loginUrl: magicLinkUrl,
    });

    if (!resolved.error) {
      const emailResult = await sendEmail({
        templateName: "portal_invite",
        to: normalizedEmail,
        toName: fullName,
        subject: resolved.subject,
        htmlContent: resolved.htmlContent,
        isTransactional: true,
        metadata: { portalOrgId: portal_org_id, portalSlug: portal_slug },
      });

      if (emailResult.success) {
        console.log(`[invite-portal-user] Invite email sent to ${normalizedEmail}`);
      } else {
        console.error("[invite-portal-user] Failed to send invite email:", emailResult.error);
      }
    } else {
      console.error("[invite-portal-user] Template error:", resolved.error);
    }

    // ── Step 6: Log activity ──
    await supabaseAdmin.from("portal_activity_log").insert({
      portal_org_id,
      actor_id: auth.userId,
      actor_type: "admin",
      action: "user_invited",
      metadata: {
        user_name: fullName,
        user_email: normalizedEmail,
        role,
        is_new_user: isNewUser,
      },
    });

    console.log(`[invite-portal-user] Successfully invited ${normalizedEmail} to portal ${portal_org_id}`);

    return new Response(
      JSON.stringify({
        portal_user_id: portalUserId,
        profile_id: userId,
        contact_id: finalContactId,
        email: normalizedEmail,
        is_new_user: isNewUser,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("[invite-portal-user] Error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

serve(handler);
