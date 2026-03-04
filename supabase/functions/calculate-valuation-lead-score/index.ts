import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { getCorsHeaders, corsPreflightResponse } from "../_shared/cors.ts";

// ─── Scoring constants ───

// FINANCIAL (0-40): EBITDA tier-based
const EBITDA_TIERS: [number, number][] = [
  [5_000_000, 40],
  [3_000_000, 37],
  [2_000_000, 33],
  [1_000_000, 28],
  [500_000, 15],
  [300_000, 5],
];

// Revenue fallback tiers (when EBITDA is null)
const REVENUE_TIERS: [number, number][] = [
  [20_000_000, 30],
  [10_000_000, 22],
  [5_000_000, 15],
  [2_000_000, 8],
  [1_000_000, 3],
];

// EXIT_TIMING scoring
const EXIT_TIMING_SCORES: Record<string, number> = {
  now: 15,
  "1-2years": 10,
  exploring: 5,
};

// QUALITY_LABEL scoring (industry calculators)
const QUALITY_LABEL_SCORES: Record<string, number> = {
  "Very Strong": 20,
  Strong: 18,
  Solid: 15,
  Average: 10,
  "Needs Work": 5,
};

// Tier-1 industries: PE-friendly verticals with recurring revenue characteristics
const TIER_1_INDUSTRIES = new Set([
  "hvac",
  "plumbing",
  "electrical",
  "auto shop",
  "auto repair",
  "collision",
  "landscaping",
  "pest control",
  "home services",
  "dental",
  "veterinary",
  "insurance",
  "managed services",
  "property management",
  "healthcare",
  "staffing",
]);

// Industries institutional investors typically can't or won't invest in
const EXCLUDED_INDUSTRIES = new Set([
  "oil and gas",
  "oil & gas",
  "cryptocurrency",
  "crypto",
  "cannabis",
  "marijuana",
  "gambling",
  "firearms",
  "weapons",
]);

interface ScoreRequest {
  mode: "all" | "unscored";
  leadId?: string;
}

/** Safely convert a PostgREST value (may be string for NUMERIC columns) to number or null */
function toNum(val: unknown): number | null {
  if (val == null) return null;
  const n = Number(val);
  return isNaN(n) ? null : n;
}

function scoreFinancial(lead: Record<string, unknown>): { score: number; note: string } {
  const ebitda = toNum(lead.ebitda);
  const revenue = toNum(lead.revenue);
  const valuationMid = toNum(lead.valuation_mid);

  let score = 0;
  let note = "";

  // EBITDA === 0 is meaningful data (break-even), not missing data — use revenue fallback
  if (ebitda != null && ebitda > 0) {
    for (const [threshold, points] of EBITDA_TIERS) {
      if (ebitda >= threshold) {
        score = points;
        note = `EBITDA $${(ebitda / 1_000_000).toFixed(1)}M`;
        break;
      }
    }
    if (score === 0 && ebitda > 0) {
      note = `EBITDA $${Math.round(ebitda / 1000)}K (below threshold)`;
    }
  } else if (ebitda === 0) {
    // Break-even EBITDA — fall through to revenue
    note = "EBITDA $0 (break-even)";
    if (revenue != null && revenue > 0) {
      for (const [threshold, points] of REVENUE_TIERS) {
        if (revenue >= threshold) {
          score = points;
          note = `EBITDA $0 + revenue fallback $${(revenue / 1_000_000).toFixed(1)}M`;
          break;
        }
      }
    }
  } else if (revenue != null && revenue > 0) {
    for (const [threshold, points] of REVENUE_TIERS) {
      if (revenue >= threshold) {
        score = points;
        note = `revenue fallback $${(revenue / 1_000_000).toFixed(1)}M`;
        break;
      }
    }
    if (score === 0 && revenue > 0) {
      note = `revenue $${Math.round(revenue / 1000)}K (below threshold)`;
    }
  } else {
    note = "no financial data";
  }

  // Valuation floor: if valuation_mid > $5M and financial < 20, set to 20
  // Guard: only apply if there's real financial data (prevents junk leads gaming via valuation alone)
  const hasFinancialData = (ebitda != null && ebitda > 0) || (revenue != null && revenue > 0);
  if (valuationMid != null && valuationMid > 5_000_000 && score < 20 && hasFinancialData) {
    score = 20;
    note += ` + valuation floor ($${(valuationMid / 1_000_000).toFixed(1)}M)`;
  }

  return { score, note: `Financial: ${score} (${note})` };
}

function scoreMotivation(lead: Record<string, unknown>): { score: number; note: string } {
  const exitTiming = lead.exit_timing as string | null;
  const openToIntros = lead.open_to_intros as boolean | null;
  const ctaClicked = lead.cta_clicked as boolean | null;
  const calculatorType = lead.calculator_type as string;

  // Industry calculators: use quality_label as motivation proxy since they lack exit_timing/open_to_intros
  // Scores are scaled to be comparable with general calculator motivation (0-30 range)
  // to avoid penalizing SourceCo's target verticals
  if (calculatorType !== "general" && !exitTiming && openToIntros == null) {
    const qualityLabel = lead.quality_label as string | null;
    const qualityMotivation: Record<string, number> = {
      "Very Strong": 25,
      "Strong": 20,
      "Solid": 15,
      "Average": 8,
      "Needs Work": 3,
    };
    if (qualityLabel && qualityMotivation[qualityLabel] != null) {
      const qs = qualityMotivation[qualityLabel];
      return { score: qs, note: `Motivation: ${qs} (industry quality: ${qualityLabel})` };
    }
    // Industry calculator with no quality data — give baseline credit for using a specialized tool
    return { score: 5, note: "Motivation: 5 (industry calc, baseline)" };
  }

  let score = 0;
  const parts: string[] = [];

  if (exitTiming && EXIT_TIMING_SCORES[exitTiming]) {
    score += EXIT_TIMING_SCORES[exitTiming];
    parts.push(`exit ${exitTiming}`);
  }

  if (openToIntros === true) {
    score += 10;
    parts.push("intros");
  }

  if (ctaClicked === true) {
    score += 5;
    parts.push("CTA");
  }

  // Cap at 30
  score = Math.min(30, score);

  return { score, note: `Motivation: ${score} (${parts.join(" + ") || "none"})` };
}

function scoreQuality(lead: Record<string, unknown>): { score: number; note: string } {
  const calculatorType = lead.calculator_type as string;
  const readinessScore = toNum(lead.readiness_score);
  const qualityLabel = lead.quality_label as string | null;

  if (calculatorType === "general") {
    // General calculator: readiness_score is 1-100 (composite of sub-scores)
    // Scale to 0-20
    if (readinessScore != null) {
      const score = Math.min(20, Math.round((readinessScore / 100) * 20));
      return { score, note: `Quality: ${score} (readiness ${readinessScore}/100)` };
    }
    return { score: 0, note: "Quality: 0 (no readiness data)" };
  }

  // Industry calculators: quality_label
  if (qualityLabel && QUALITY_LABEL_SCORES[qualityLabel] != null) {
    const score = QUALITY_LABEL_SCORES[qualityLabel];
    return { score, note: `Quality: ${score} (${qualityLabel})` };
  }

  return { score: 0, note: "Quality: 0 (no quality data)" };
}

function scoreMarket(lead: Record<string, unknown>): { score: number; note: string } {
  const industry = ((lead.industry as string) || "").toLowerCase();
  const locationsCount = toNum(lead.locations_count);
  const growthTrend = lead.growth_trend as string | null;
  const revenueModel = lead.revenue_model as string | null;

  let score = 0;
  const parts: string[] = [];

  // Excluded industries (institutional investors can't invest) — score 0
  if (EXCLUDED_INDUSTRIES.has(industry)) {
    return { score: 0, note: "Market: 0 (excluded industry: " + industry + ")" };
  }

  // Tier 1 industry (PE-friendly, recurring revenue verticals) = 3
  if (TIER_1_INDUSTRIES.has(industry)) {
    score += 3;
    parts.push("tier-1 industry");
  }

  // 3+ locations = 3
  if (locationsCount != null && locationsCount >= 3) {
    score += 3;
    parts.push(`${locationsCount} locations`);
  }

  // Growing = 2 (data values are percentage ranges like "25-50", "50-100", "100-plus")
  const GROWTH_TRENDS = new Set(["growing", "rapid_growth", "25-50", "50-100", "100-plus"]);
  if (growthTrend && GROWTH_TRENDS.has(growthTrend)) {
    score += 2;
    parts.push("growing");
  }

  // Recurring revenue = 3 (PE-prioritized, higher weight than before)
  if (revenueModel === "recurring" || revenueModel === "subscription") {
    score += 3;
    parts.push("recurring revenue");
  }

  // Cap at 10
  score = Math.min(10, score);

  return { score, note: `Market: ${score}${parts.length ? ` (${parts.join(" + ")})` : ""}` };
}

function scoreLead(lead: Record<string, unknown>): { score: number; notes: string } {
  const financial = scoreFinancial(lead);
  const motivation = scoreMotivation(lead);
  const quality = scoreQuality(lead);
  const market = scoreMarket(lead);

  const total = Math.min(100, financial.score + motivation.score + quality.score + market.score);

  const notes = `${financial.note} + ${motivation.note} + ${quality.note} + ${market.note} = ${total}`;

  return { score: total, notes };
}

// ─── Handler ───

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return corsPreflightResponse(req);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // ─── Auth: verify caller is admin ───
    const authHeader = req.headers.get("Authorization");
    if (authHeader) {
      const token = authHeader.replace("Bearer ", "");
      const { data: { user }, error: authError } = await createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY") || supabaseKey)
        .auth.getUser(token);

      if (authError || !user) {
        return new Response(
          JSON.stringify({ error: "Unauthorized" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Check admin status
      const { data: profile } = await supabase
        .from("profiles")
        .select("is_admin")
        .eq("id", user.id)
        .single();

      if (!profile?.is_admin) {
        return new Response(
          JSON.stringify({ error: "Forbidden: admin access required" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } else {
      // No auth header — only allow if called via service-role (internal invocation).
      // Check for the service role key in the apikey header as verification.
      const apiKey = req.headers.get("apikey");
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (!apiKey || apiKey !== serviceKey) {
        return new Response(
          JSON.stringify({ error: "Unauthorized: auth header or service-role key required" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const body: ScoreRequest = await req.json();
    const { mode, leadId } = body;

    // Build query
    const BATCH_LIMIT = 500;
    let query = supabase
      .from("valuation_leads")
      .select("*")
      .eq("excluded", false);

    if (leadId) {
      query = query.eq("id", leadId);
    } else if (mode === "unscored") {
      query = query.is("lead_score", null).limit(BATCH_LIMIT);
    } else {
      query = query.limit(BATCH_LIMIT);
    }

    const { data: leads, error: fetchError } = await query;

    if (fetchError) {
      console.error("[calculate-valuation-lead-score] Fetch error:", fetchError);
      return new Response(
        JSON.stringify({ error: fetchError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!leads || leads.length === 0) {
      return new Response(
        JSON.stringify({ success: true, scored: 0, message: "No leads to score" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[calculate-valuation-lead-score] Scoring ${leads.length} leads (mode: ${mode || "single"})`);

    let scored = 0;
    const errors: string[] = [];

    for (const lead of leads) {
      try {
        const { score, notes } = scoreLead(lead);

        const { error: updateError } = await supabase
          .from("valuation_leads")
          .update({
            lead_score: score,
            scoring_notes: notes,
          })
          .eq("id", lead.id);

        if (updateError) {
          errors.push(`${lead.id}: ${updateError.message}`);
        } else {
          scored++;
        }
      } catch (err) {
        errors.push(`${lead.id}: ${err instanceof Error ? err.message : "Unknown error"}`);
      }
    }

    console.log(`[calculate-valuation-lead-score] Scored ${scored}/${leads.length}. Errors: ${errors.length}`);

    return new Response(
      JSON.stringify({
        success: true,
        scored,
        total: leads.length,
        hasMore: leads.length === BATCH_LIMIT,
        errors: errors.length > 0 ? errors.slice(0, 10) : undefined,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[calculate-valuation-lead-score] Error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
