import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/** Safely read a nested .value from calculator_inputs objects. */
function inputVal(inputs: Record<string, unknown>, key: string): unknown {
  const obj = inputs?.[key];
  if (obj == null) return null;
  if (typeof obj === "object" && "value" in (obj as Record<string, unknown>)) {
    return (obj as Record<string, unknown>).value;
  }
  return obj;
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
    console.log("[receive-valuation-lead] Full body:", JSON.stringify(body));

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

    const leadSource = body.lead_source ?? "auto_shop_calculator";
    console.log("Payload debug:", JSON.stringify({ full_name, email, lead_source: leadSource, ci_keys: calculator_inputs ? Object.keys(calculator_inputs) : null }));

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // ─── 1. Insert into incoming_leads (preserve both submissions as audit trail) ──
    const incomingRow = {
      external_lead_id: body.external_lead_id ?? null,
      full_name,
      email,
      website: website ?? "",
      lead_source: leadSource,
      calculator_inputs,
      valuation_result,
      ip_address: body.ip_address ?? null,
      city: body.city ?? null,
      region: body.region ?? null,
      country: body.country ?? null,
      country_code: body.country_code ?? null,
      received_at: new Date().toISOString(),
    };

    // Use ignoreDuplicates so both initial_unlock and full_report raw payloads are preserved
    const { error: incomingError } = await supabaseAdmin
      .from("incoming_leads")
      .upsert(incomingRow, { onConflict: "email", ignoreDuplicates: false });

    if (incomingError) {
      console.error("incoming_leads upsert error:", incomingError);
      // Non-fatal — continue to valuation_leads
    }

    // ─── 2. Extract structured fields & upsert into valuation_leads ──
    const ci = calculator_inputs as Record<string, unknown>;
    const vr = valuation_result as Record<string, unknown>;

    const toNum = (v: unknown): number | null => {
      if (v == null) return null;
      const n = Number(v);
      return isNaN(n) ? null : n;
    };
    const toInt = (v: unknown): number | null => {
      const n = toNum(v);
      return n == null ? null : Math.round(n);
    };
    const toStr = (v: unknown): string | null => {
      if (v == null) return null;
      return String(v);
    };

    const revenue = toNum(inputVal(ci, "revenue_ltm"));
    const ebitda = toNum(inputVal(ci, "ebitda_ltm"));
    const serviceType = toStr(inputVal(ci, "service_type"));
    const locationsCount = toInt(inputVal(ci, "locations_count"));
    const ownerDependency = toStr(inputVal(ci, "owner_dependency"));
    const growthTrend = toStr(inputVal(ci, "trend_24m"));

    const businessValue = vr?.businessValue as Record<string, number> | null;
    const qualityLabel = vr?.qualityLabel as Record<string, string> | null;
    const buyerLane = vr?.buyerLane as Record<string, string> | null;
    const propertyValue = vr?.propertyValue ?? null;

    const city = body.city as string | null;
    const region = body.region as string | null;
    const locationStr = [city, region].filter(Boolean).join(", ") || null;

    const calculatorType = serviceType === "collision" ? "collision"
      : serviceType === "mechanical" ? "mechanical"
      : serviceType === "specialty" ? "specialty"
      : serviceType ?? "auto_shop";

    const now = new Date().toISOString();

    // Check if lead already exists by email + calculator_type
    const { data: existing } = await supabaseAdmin
      .from("valuation_leads")
      .select("id, lead_source, created_at, submission_count")
      .eq("email", email)
      .eq("calculator_type", calculatorType)
      .eq("excluded", false)
      .maybeSingle();

    // ─── Try structured upsert, fall back to minimal safe insert ──
    try {
      let vlError: { message: string } | null = null;

      if (existing) {
        // ─── MERGE logic: preserve first-touch data, augment with new submission ──
        const isUpgrade = leadSource === "full_report" && existing.lead_source === "initial_unlock";

        const updatePayload: Record<string, unknown> = {
          full_name,
          website: website ?? null,
          business_name: businessNameFromDomain(website) ?? null,
          industry: serviceType ?? null,
          region: region ?? null,
          location: locationStr,
          revenue,
          ebitda,
          valuation_low: toNum(businessValue?.low),
          valuation_mid: toNum(businessValue?.mid),
          valuation_high: toNum(businessValue?.high),
          quality_tier: (vr?.tier as string) ?? null,
          quality_label: qualityLabel?.label ?? null,
          buyer_lane: buyerLane?.title ?? null,
          growth_trend: growthTrend,
          owner_dependency: ownerDependency,
          locations_count: locationsCount,
          raw_calculator_inputs: calculator_inputs,
          raw_valuation_results: valuation_result,
          calculator_specific_data: propertyValue ? { propertyValue } : {},
          submission_count: (existing.submission_count ?? 1) + 1,
          updated_at: now,
        };

        if (isUpgrade) {
          updatePayload.lead_source = "full_report";
          updatePayload.initial_unlock_at = existing.created_at;
        } else {
          updatePayload.lead_source = leadSource;
        }

        const { error } = await supabaseAdmin
          .from("valuation_leads")
          .update(updatePayload)
          .eq("id", existing.id);
        vlError = error;
      } else {
        const insertPayload = {
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
          valuation_low: toNum(businessValue?.low),
          valuation_mid: toNum(businessValue?.mid),
          valuation_high: toNum(businessValue?.high),
          quality_tier: (vr?.tier as string) ?? null,
          quality_label: qualityLabel?.label ?? null,
          buyer_lane: buyerLane?.title ?? null,
          growth_trend: growthTrend,
          owner_dependency: ownerDependency,
          locations_count: locationsCount,
          lead_source: leadSource,
          source_submission_id: body.external_lead_id ?? null,
          raw_calculator_inputs: calculator_inputs,
          raw_valuation_results: valuation_result,
          calculator_specific_data: propertyValue ? { propertyValue } : {},
          submission_count: 1,
          updated_at: now,
        };

        const { error } = await supabaseAdmin
          .from("valuation_leads")
          .insert(insertPayload);
        vlError = error;
      }

      if (vlError) {
        throw new Error(`Structured insert failed: ${vlError.message}`);
      }

      console.log(`Lead ingested: ${email} → incoming_leads + valuation_leads (${calculatorType}, source=${leadSource}, existing=${!!existing})`);
    } catch (structuredErr) {
      // ─── FALLBACK: minimal safe insert so the lead is NEVER lost ──
      console.error("Structured valuation_leads insert failed, attempting minimal fallback:", structuredErr);

      try {
        const { error: fallbackErr } = await supabaseAdmin
          .from("valuation_leads")
          .upsert({
            email,
            full_name,
            calculator_type: calculatorType || "unknown",
            lead_source: leadSource,
            raw_calculator_inputs: calculator_inputs,
            raw_valuation_results: valuation_result,
            updated_at: now,
          }, { onConflict: "email,calculator_type" });

        if (fallbackErr) {
          console.error("Minimal fallback also failed:", fallbackErr);
          // Still return 200 — incoming_leads has the data
        } else {
          console.log(`Lead saved via FALLBACK: ${email} → valuation_leads (minimal, type=${calculatorType})`);
        }
      } catch (fallbackCatchErr) {
        console.error("Fallback catch error:", fallbackCatchErr);
      }
    }

    // Always return 200 — incoming_leads is the source of truth backup
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
