import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();

    const { full_name, email, website, calculator_inputs, valuation_result } = body;

    // Validate required fields
    const missing: string[] = [];
    if (!full_name) missing.push("full_name");
    if (!email) missing.push("email");
    if (!calculator_inputs) missing.push("calculator_inputs");
    if (!valuation_result) missing.push("valuation_result");

    if (missing.length > 0) {
      return new Response(
        JSON.stringify({ error: `Missing required fields: ${missing.join(", ")}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const row = {
      external_lead_id: body.external_lead_id ?? null,
      full_name,
      email,
      website: website ?? "",
      lead_source: body.lead_source ?? null,
      calculator_inputs,
      valuation_result,
      ip_address: body.ip_address ?? null,
      city: body.city ?? null,
      region: body.region ?? null,
      country: body.country ?? null,
      country_code: body.country_code ?? null,
      received_at: new Date().toISOString(),
    };

    const { error } = await supabaseAdmin
      .from("incoming_leads")
      .upsert(row, { onConflict: "email" });

    if (error) {
      console.error("Upsert error:", error);
      return new Response(
        JSON.stringify({ error: "Failed to store lead", detail: error.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("receive-valuation-lead error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
