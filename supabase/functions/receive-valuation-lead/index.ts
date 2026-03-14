import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';

/** Safely read a nested .value from calculator_inputs objects. */
function inputVal(inputs: Record<string, unknown>, key: string): unknown {
  const obj = inputs?.[key];
  if (obj == null) return null;
  if (typeof obj === 'object' && 'value' in (obj as Record<string, unknown>)) {
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
      .replace(/^[a-z]{3,6}:\/\//i, '')
      .replace(/^www\./i, '')
      .split('/')[0]
      .split('?')[0]
      .split('.')[0];
    if (domain && domain.length > 1) {
      return domain.charAt(0).toUpperCase() + domain.slice(1);
    }
  } catch {
    /* ignore */
  }
  return null;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(req);
  }

  const corsHeaders = getCorsHeaders(req);

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await req.json();
    console.log('[receive-valuation-lead] Full body:', JSON.stringify(body));

    const { full_name, email, website, calculator_inputs, valuation_result } = body;

    // Validate required fields
    const missing: string[] = [];
    if (!full_name) missing.push('full_name');
    if (!email) missing.push('email');
    if (!calculator_inputs) missing.push('calculator_inputs');
    if (!valuation_result) missing.push('valuation_result');

    if (missing.length > 0) {
      return new Response(
        JSON.stringify({ error: `Missing required fields: ${missing.join(', ')}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const leadSource = body.lead_source ?? 'auto_shop_calculator';
    console.log(
      'Payload debug:',
      JSON.stringify({
        full_name,
        email,
        lead_source: leadSource,
        ci_keys: calculator_inputs ? Object.keys(calculator_inputs) : null,
      }),
    );

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // ─── 1. Insert into incoming_leads (preserve both submissions as audit trail) ──
    const incomingRow = {
      external_lead_id: body.external_lead_id ?? null,
      full_name,
      email,
      website: website ?? '',
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

    // incoming_leads is an audit-trail table for raw webhook payloads.
    // The primary operational leads table is inbound_leads.
    // TODO: Consider renaming to valuation_lead_audit_log for clarity.
    // Use ignoreDuplicates so both initial_unlock and full_report raw payloads are preserved
    const { error: incomingError } = await supabaseAdmin
      .from('incoming_leads')
      .upsert(incomingRow, { onConflict: 'email', ignoreDuplicates: false });

    if (incomingError) {
      console.error('incoming_leads upsert error:', incomingError);
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

    const revenue = toNum(inputVal(ci, 'revenue_ltm'));
    const ebitda = toNum(inputVal(ci, 'ebitda_ltm'));
    const serviceType = toStr(inputVal(ci, 'service_type'));
    const locationsCount = toInt(inputVal(ci, 'locations_count'));
    const ownerDependency = toStr(inputVal(ci, 'owner_dependency'));
    const growthTrend = toStr(inputVal(ci, 'trend_24m'));

    const businessValue = vr?.businessValue as Record<string, number> | null;
    const qualityLabel = vr?.qualityLabel as Record<string, string> | null;
    const buyerLane = vr?.buyerLane as Record<string, string> | null;
    const propertyValue = vr?.propertyValue ?? null;

    const city = body.city as string | null;
    const region = body.region as string | null;
    const locationStr = [city, region].filter(Boolean).join(', ') || null;

    // All auto calculator submissions → single "auto_shop" type.
    // Raw service_type is preserved in raw_calculator_inputs for later classification.
    const calculatorType = 'auto_shop';

    const now = new Date().toISOString();

    // ─── Atomic upsert via RPC — no race condition possible ──
    try {
      const { data: mergedId, error: rpcError } = await supabaseAdmin.rpc('merge_valuation_lead', {
        p_calculator_type: calculatorType,
        p_full_name: full_name,
        p_email: email,
        p_website: website ?? null,
        p_business_name: businessNameFromDomain(website) ?? null,
        p_industry: serviceType ?? null,
        p_region: region ?? null,
        p_location: locationStr,
        p_revenue: revenue,
        p_ebitda: ebitda,
        p_valuation_low: toNum(businessValue?.low),
        p_valuation_mid: toNum(businessValue?.mid),
        p_valuation_high: toNum(businessValue?.high),
        p_quality_tier: (vr?.tier as string) ?? null,
        p_quality_label: qualityLabel?.label ?? null,
        p_buyer_lane: buyerLane?.title ?? null,
        p_growth_trend: growthTrend,
        p_owner_dependency: ownerDependency,
        p_locations_count: locationsCount,
        p_lead_source: leadSource,
        p_source_submission_id: body.external_lead_id ?? null,
        p_raw_calculator_inputs: calculator_inputs,
        p_raw_valuation_results: valuation_result,
        p_calculator_specific_data: propertyValue ? { propertyValue } : null,
      });

      if (rpcError) {
        throw new Error(`merge_valuation_lead RPC failed: ${rpcError.message}`);
      }

      console.log(
        `Lead merged atomically: ${email} → valuation_leads id=${mergedId} (type=${calculatorType}, source=${leadSource})`,
      );

      // Fire-and-forget: auto-find LinkedIn and phone for the new lead
      if (mergedId) {
        triggerContactFinding(supabaseAdmin, {
          valuation_lead_id: mergedId,
          full_name,
          email,
          website: website ?? undefined,
          business_name: businessNameFromDomain(website) ?? undefined,
        });
      }
    } catch (structuredErr) {
      // ─── FALLBACK: minimal safe insert so the lead is NEVER lost ──
      console.error('Structured merge failed, attempting minimal fallback:', structuredErr);

      try {
        const { data: fallbackRows, error: fallbackErr } = await supabaseAdmin
          .from('valuation_leads')
          .upsert(
            {
              email,
              full_name,
              calculator_type: calculatorType || 'unknown',
              lead_source: leadSource,
              raw_calculator_inputs: calculator_inputs,
              raw_valuation_results: valuation_result,
              updated_at: now,
            },
            { onConflict: 'email,calculator_type' },
          )
          .select('id')
          .single();

        if (fallbackErr) {
          console.error('Minimal fallback also failed:', fallbackErr);
        } else {
          console.log(
            `Lead saved via FALLBACK: ${email} → valuation_leads (minimal, type=${calculatorType})`,
          );

          // Trigger contact finding for fallback-saved leads too
          if (fallbackRows?.id) {
            triggerContactFinding(supabaseAdmin, {
              valuation_lead_id: fallbackRows.id,
              full_name,
              email,
              website: website ?? undefined,
              business_name: businessNameFromDomain(website) ?? undefined,
            });
          }
        }
      } catch (fallbackCatchErr) {
        console.error('Fallback catch error:', fallbackCatchErr);
      }
    }
    // Always return 200 — incoming_leads is the source of truth backup
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('receive-valuation-lead error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

/**
 * Fire-and-forget: invoke find-valuation-lead-contacts to auto-discover
 * the lead's LinkedIn URL and phone number.
 * Errors are logged but never block the webhook response.
 */
function triggerContactFinding(
  supabaseAdmin: ReturnType<typeof createClient>,
  payload: {
    valuation_lead_id: string;
    full_name: string;
    email: string;
    website?: string;
    business_name?: string;
  },
): void {
  supabaseAdmin.functions
    .invoke('find-valuation-lead-contacts', {
      body: payload,
      headers: {
        'x-internal-secret': Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      },
    })
    .then((res) => {
      if (res.error) {
        console.error(
          `[receive-valuation-lead] Contact finding failed for ${payload.email}:`,
          res.error,
        );
      } else {
        console.log(
          `[receive-valuation-lead] Contact finding completed for ${payload.email}:`,
          JSON.stringify(res.data),
        );
      }
    })
    .catch((err: unknown) => {
      console.error(
        `[receive-valuation-lead] Contact finding invocation error for ${payload.email}:`,
        err,
      );
    });
}
