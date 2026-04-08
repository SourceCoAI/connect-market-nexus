import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req: Request) => {
  // Only accept POST
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const payload = await req.json();
    console.log("Webflow webhook received:", JSON.stringify(payload).slice(0, 500));

    // --- Validate this looks like a Webflow V2 form submission ---
    if (!payload || (!payload.triggerType && !payload.payload && !payload.formFields)) {
      console.warn("Invalid payload structure - not a Webflow form submission");
      return new Response(JSON.stringify({ ok: true, skipped: true, reason: "invalid_payload" }), { status: 200 });
    }

    // --- Parse Webflow V2 form submission payload ---
    const formPayload = payload.payload || payload;
    const formFields = formPayload.formFields || formPayload.data || {};
    const pageUrl: string = formPayload.pageUrl || formPayload.pageName || "";

    // --- Filter: only process deal memo forms ---
    if (!pageUrl.includes("/off-market-deal-memos/")) {
      console.log("Skipping non-deal-memo form submission. pageUrl:", pageUrl);
      return new Response(JSON.stringify({ ok: true, skipped: true, reason: "not_deal_memo_form" }), { status: 200 });
    }
    console.log("Processing deal memo form from:", pageUrl);

    // Extract form fields - Webflow V2 formFields is an array of { displayName, value, ... }
    let name = "";
    let email = "";
    let phone = "";
    let company = "";
    let role = "";
    let message = "";

    if (Array.isArray(formFields)) {
      // V2 format: array of field objects
      for (const field of formFields) {
        const label = (field.displayName || field.name || "").toLowerCase().trim();
        const value = (field.value || "").trim();
        if (label.includes("name") && !label.includes("company") && !label.includes("firm")) {
          name = name || value;
        } else if (label.includes("email")) {
          email = email || value;
        } else if (label.includes("phone") || label.includes("tel")) {
          phone = phone || value;
        } else if (label.includes("company") || label.includes("firm") || label.includes("organization")) {
          company = company || value;
        } else if (label.includes("role") || label.includes("title") || label.includes("position")) {
          role = role || value;
        } else if (label.includes("message") || label.includes("interest") || label.includes("comment") || label.includes("note")) {
          message = message || value;
        }
      }
    } else if (typeof formFields === "object") {
      // V1 or flat format
      name = formFields.name || formFields.Name || "";
      email = formFields.email || formFields.Email || "";
      phone = formFields.phone || formFields.Phone || "";
      company = formFields.company || formFields.Company || formFields.firm || "";
      role = formFields.role || formFields.Role || formFields.title || "";
      message = formFields.message || formFields.Message || formFields.interest_message || "";
    }

    if (!email) {
      console.error("No email found in form submission");
      return new Response(JSON.stringify({ error: "Email is required" }), { status: 400 });
    }

    // --- Extract slug from page URL ---
    let slug = "";
    try {
      if (pageUrl.startsWith("http")) {
        const parsedUrl = new URL(pageUrl);
        const pathParts = parsedUrl.pathname.split("/").filter(Boolean);
        slug = pathParts[pathParts.length - 1] || "";
      } else {
        // Might be just a path or page name
        const pathParts = pageUrl.split("/").filter(Boolean);
        slug = pathParts[pathParts.length - 1] || pageUrl;
      }
    } catch {
      slug = pageUrl;
    }
    console.log("Extracted slug:", slug, "from pageUrl:", pageUrl);

    // --- Match deal by webflow_slug ---
    let listingId: string | null = null;
    let listingTitle = "";
    if (slug) {
      const { data: listing } = await supabase
        .from("listings")
        .select("id, title")
        .eq("webflow_slug", slug)
        .maybeSingle();

      if (listing) {
        listingId = listing.id;
        listingTitle = listing.title;
        console.log("Matched listing:", listingId, listingTitle);
      } else {
        console.warn("No listing matched for slug:", slug);
      }
    }

    // --- Screen lead email against profiles ---
    let userId: string | null = null;
    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("email", email.toLowerCase())
      .maybeSingle();

    if (profile) {
      userId = profile.id;
      console.log("Matched existing user:", userId);
    }

    // --- Deduplicate: check for existing request with same email + listing ---
    if (listingId) {
      const dedupeQuery = supabase
        .from("connection_requests")
        .select("id, source_metadata")
        .eq("listing_id", listingId)
        .eq("lead_email", email.toLowerCase());

      const { data: existing } = await dedupeQuery.maybeSingle();

      if (existing) {
        // Update existing record with new submission data
        const prevMetadata = (existing.source_metadata as Record<string, unknown>) || {};
        const submissions = Array.isArray(prevMetadata.submissions)
          ? prevMetadata.submissions
          : prevMetadata.submitted_at
            ? [{ submitted_at: prevMetadata.submitted_at, payload: prevMetadata }]
            : [];
        submissions.push({ submitted_at: new Date().toISOString(), page_url: pageUrl });

        await supabase
          .from("connection_requests")
          .update({
            source_metadata: {
              ...prevMetadata,
              submissions,
              last_submitted_at: new Date().toISOString(),
              raw_payload: payload,
            },
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id);

        console.log("Deduplicated - updated existing request:", existing.id);
        return new Response(JSON.stringify({ ok: true, deduplicated: true, request_id: existing.id }), { status: 200 });
      }
    }

    // --- Insert new connection request ---
    const sourceMetadata = {
      page_url: pageUrl,
      slug,
      form_name: formPayload.formName || "",
      submitted_at: new Date().toISOString(),
      raw_payload: payload,
    };

    const insertData: Record<string, unknown> = {
      source: "webflow",
      status: "pending",
      source_metadata: sourceMetadata,
      lead_name: name || null,
      lead_email: email.toLowerCase(),
      lead_phone: phone || null,
      lead_company: company || null,
      lead_role: role || null,
      user_message: message || null,
    };

    if (listingId) insertData.listing_id = listingId;
    if (userId) insertData.user_id = userId;

    const { data: newRequest, error: insertError } = await supabase
      .from("connection_requests")
      .insert(insertData)
      .select("id")
      .single();

    if (insertError) {
      console.error("Insert error:", insertError);
      return new Response(JSON.stringify({ error: "Failed to create connection request" }), { status: 500 });
    }

    console.log("Created connection request:", newRequest.id);

    // --- Trigger admin notification ---
    try {
      const notifBody = {
        type: "admin_notification",
        requestId: newRequest.id,
        listingTitle: listingTitle || "Unknown Deal",
        userName: name || email,
        source: "webflow_deal_memo",
      };

      await fetch(`${SUPABASE_URL}/functions/v1/send-connection-notification`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: Deno.env.get("SUPABASE_ANON_KEY") || "",
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify(notifBody),
      });
      console.log("Admin notification sent");
    } catch (notifErr) {
      console.error("Failed to send admin notification (non-blocking):", notifErr);
    }

    return new Response(JSON.stringify({ ok: true, request_id: newRequest.id }), { status: 200 });
  } catch (err) {
    console.error("Webhook processing error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500 });
  }
});
