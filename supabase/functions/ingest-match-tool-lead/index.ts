import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const payload = await req.json();
    const { website, revenue, profit, full_name, email, phone, timeline, raw_inputs } = payload;

    if (!website) {
      return new Response(
        JSON.stringify({ error: "website is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Determine submission stage
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

    // Use merge function for dedup
    const { data, error } = await supabase.rpc("merge_match_tool_lead", {
      p_website: website,
      p_email: email || null,
      p_full_name: full_name || null,
      p_phone: phone || null,
      p_revenue: revenue || null,
      p_profit: profit || null,
      p_timeline: timeline || null,
      p_submission_stage: submission_stage,
      p_raw_inputs: raw_inputs ? JSON.stringify(raw_inputs) : null,
    });

    if (error) {
      console.error("merge_match_tool_lead error:", error);
      // Fallback: direct insert
      const { error: insertError } = await supabase
        .from("match_tool_leads")
        .insert({
          website,
          email: email || null,
          full_name: full_name || null,
          phone: phone || null,
          revenue: revenue || null,
          profit: profit || null,
          timeline: timeline || null,
          submission_stage,
          raw_inputs: raw_inputs || null,
        });

      if (insertError) {
        console.error("Fallback insert error:", insertError);
      }
    }

    return new Response(
      JSON.stringify({ success: true, id: data }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("ingest-match-tool-lead error:", err);
    return new Response(
      JSON.stringify({ error: "Internal error", success: false }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
