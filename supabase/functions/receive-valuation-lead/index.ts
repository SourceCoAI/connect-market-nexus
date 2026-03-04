import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/** Safely read a nested .value from calculator_inputs objects */
function inputVal(inputs: Record<string, unknown>, key: string): unknown {
  const obj = inputs?.[key];
  if (obj && typeof obj === "object" && "value" in (obj as Record<string, unknown>)) {
    return (obj as Record<string, unknown>).value;
  }
  return null;
}

/** Extract a business name from a website domain */
function businessNameFromDomain(website: string | null): string | null {
  if (!website) return null;
  try {
    const domain = website
      .trim()
      .toLowerCase()
      .replace(/^[a-z]{3,6}:\/\//i, "")
      .replace(/^www\./i, "")
      .split("/")[0]
      .split("?")[0]
      .split(".")[0];
    if (domain && domain.length > 1) {
      return domain.charAt(0).toUpperCase() + domain.slice(1);
    }
  } catch { /* ignore */ }
  return null;
}

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

    // ─── 1. Upsert into incoming_leads (raw audit trail) ─────────────
    const incomingRow = {
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

    const { error: incomingError } = await supabaseAdmin
      .from("incoming_leads")
      .upsert(incomingRow, { onConflict: "email" });

    if (incomingError) {
      console.error("incoming_leads upsert error:", incomingError);
      return new Response(
        JSON.stringify({ error: "Failed to store lead", detail: incomingError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ─── 2. Extract structured fields & upsert into valuation_leads ──
    const ci = calculator_inputs as Record<string, unknown>;
    const vr = valuation_result as Record<string, unknown>;

    // From calculator_inputs (nested { value, label, ... } objects)
    const revenue = inputVal(ci, "revenue_ltm") as number | null;
    const ebitda = inputVal(ci, "ebitda_ltm") as number | null;
    const serviceType = inputVal(ci, "service_type") as string | null;
    const locationsCount = inputVal(ci, "locations_count") as number | null;
    const ownerDependency = inputVal(ci, "owner_dependency") as string | null;
    const growthTrend = inputVal(ci, "trend_24m") as string | null;

    // From valuation_result (flat nested objects)
    const businessValue = vr?.businessValue as Record<string, number> | null;
    const qualityLabel = vr?.qualityLabel as Record<string, string> | null;
    const buyerLane = vr?.buyerLane as Record<string, string> | null;
    const propertyValue = vr?.propertyValue ?? null;

    // Build location string
    const city = body.city as string | null;
    const region = body.region as string | null;
    const locationStr = [city, region].filter(Boolean).join(", ") || null;

    // Determine calculator type from service_type input
    const calculatorType = serviceType === "collision" ? "collision"
      : serviceType === "mechanical" ? "mechanical"
      : serviceType ?? "auto_shop";

    const valuationRow = {
      calculator_type: calculatorType,
      full_name,
      email,
      website: website ?? null,
      business_name: businessNameFromDomain(website) ?? null,
      industry: serviceType ?? null,
      region: region ?? null,
      location: locationStr,
      revenue,
      ebitda,
      valuation_low: businessValue?.low ?? null,
      valuation_mid: businessValue?.mid ?? null,
      valuation_high: businessValue?.high ?? null,
      quality_tier: (vr?.tier as string) ?? null,
      quality_label: qualityLabel?.label ?? null,
      buyer_lane: buyerLane?.lane ?? null,
      growth_trend: growthTrend,
      owner_dependency: ownerDependency,
      locations_count: locationsCount,
      lead_source: body.lead_source ?? "auto_shop_calculator",
      source_submission_id: body.external_lead_id ?? null,
      raw_calculator_inputs: calculator_inputs,
      raw_valuation_results: valuation_result,
      calculator_specific_data: propertyValue ? { propertyValue } : {},
      updated_at: new Date().toISOString(),
    };

    // Check if lead already exists by email + calculator_type
    const { data: existing } = await supabaseAdmin
      .from("valuation_leads")
      .select("id")
      .eq("email", email)
      .eq("calculator_type", valuationRow.calculator_type)
      .eq("excluded", false)
      .maybeSingle();

    let vlError: { message: string } | null = null;
    if (existing) {
      // Update existing lead
      const { error } = await supabaseAdmin
        .from("valuation_leads")
        .update(valuationRow)
        .eq("id", existing.id);
      vlError = error;
    } else {
      // Insert new lead
      const { error } = await supabaseAdmin
        .from("valuation_leads")
        .insert(valuationRow);
      vlError = error;
    }

    if (vlError) {
      console.error("valuation_leads sync error:", vlError);
      return new Response(
        JSON.stringify({ error: "Lead saved to staging but failed to sync to valuation_leads", detail: vlError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.log(`Lead ingested: ${email} → incoming_leads + valuation_leads (${calculatorType})`);

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
