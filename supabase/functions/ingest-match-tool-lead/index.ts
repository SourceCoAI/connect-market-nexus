import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const payload = await req.json();
    const {
      website,
      revenue,
      profit,
      full_name,
      email,
      phone,
      timeline,
      raw_inputs,
      source,
    } = payload;

    if (!website) {
      return json({ error: "website is required" }, 400);
    }

    // Determine submission stage from whatever data is present
    let submission_stage = "browse";
    if (full_name && email) {
      submission_stage = "full_form";
    } else if (revenue || profit) {
      submission_stage = "financials";
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Progressive upsert via merge RPC — deduplicates by website
    const { data, error } = await supabase.rpc("merge_match_tool_lead", {
      p_website: website,
      p_email: email || null,
      p_full_name: full_name || null,
      p_phone: phone || null,
      p_revenue: typeof revenue === "number" ? String(revenue) : revenue || null,
      p_profit: typeof profit === "number" ? String(profit) : profit || null,
      p_timeline: timeline || null,
      p_submission_stage: submission_stage,
      p_raw_inputs: raw_inputs ? JSON.stringify(raw_inputs) : JSON.stringify(payload),
      p_source: source || "deal-match-ai",
    });

    if (error) {
      console.error("merge_match_tool_lead RPC error:", error);

      // Fallback: direct insert (may fail on dupe but at least we tried)
      const { error: insertError } = await supabase
        .from("match_tool_leads")
        .insert({
          website: website.toLowerCase().trim(),
          email: email || null,
          full_name: full_name || null,
          phone: phone || null,
          revenue: typeof revenue === "number" ? String(revenue) : revenue || null,
          profit: typeof profit === "number" ? String(profit) : profit || null,
          timeline: timeline || null,
          submission_stage,
          raw_inputs: raw_inputs || payload,
          source: source || "deal-match-ai",
        });

      if (insertError) {
        console.error("Fallback insert error:", insertError);
      }
    }

    return json({ success: true, id: data });
  } catch (err) {
    console.error("ingest-match-tool-lead error:", err);
    // Always return 200 so the calling tool never shows an error to the user
    return json({ error: "Internal error", success: false });
  }
});
