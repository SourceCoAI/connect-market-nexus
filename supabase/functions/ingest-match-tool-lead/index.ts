import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function enrichLead(supabase: any, leadId: string, website: string) {
  try {
    // Check if already enriched
    const { data: existing } = await supabase
      .from('match_tool_leads')
      .select('enrichment_data')
      .eq('id', leadId)
      .single();

    if (existing?.enrichment_data) return;

    // Scrape via Firecrawl
    const FIRECRAWL_API_KEY = Deno.env.get('FIRECRAWL_API_KEY');
    if (!FIRECRAWL_API_KEY) {
      console.warn('[enrich] FIRECRAWL_API_KEY not configured, skipping');
      return;
    }

    let formattedUrl = website.trim();
    if (!formattedUrl.startsWith('http://') && !formattedUrl.startsWith('https://')) {
      formattedUrl = `https://${formattedUrl}`;
    }

    console.log(`[enrich] Scraping: ${formattedUrl}`);

    const scrapeResponse = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${FIRECRAWL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: formattedUrl,
        formats: ['markdown'],
        onlyMainContent: true,
        waitFor: 2000,
        timeout: 20000,
      }),
    });

    let markdown = '';
    if (scrapeResponse.ok) {
      const scrapeResult = await scrapeResponse.json();
      markdown = scrapeResult.data?.markdown || scrapeResult.markdown || '';
    } else {
      console.warn(`[enrich] Firecrawl failed: ${scrapeResponse.status}`);
    }

    // Extract with Gemini
    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
    if (!GEMINI_API_KEY) {
      console.warn('[enrich] GEMINI_API_KEY not configured, skipping');
      return;
    }

    const truncatedMarkdown = markdown.slice(0, 8000);

    const prompt = `Analyze this company website content and extract a structured profile. Be concise and factual. If information is not available, use null.

Website: ${formattedUrl}
Content:
${truncatedMarkdown || '(No content available - infer from URL only)'}

Return a JSON object with exactly these fields:
{
  "company_name": "string - official company name",
  "one_liner": "string - one sentence describing what they do and where",
  "services": ["array of specific services they offer"],
  "industry": "string - industry vertical (e.g. 'Home Services — HVAC', 'IT Services — MSP')",
  "geography": "string - primary location/service area",
  "employee_estimate": "string - estimated size range (e.g. '10-25', '50-100')",
  "year_founded": "string or null",
  "revenue_estimate": "string or null - estimated revenue range if inferable",
  "notable_signals": ["array of notable business signals - e.g. 'Licensed contractor', 'Multiple locations', 'Strong online reviews']"
}`;

    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0, responseMimeType: 'application/json' },
        }),
      }
    );

    if (!geminiResponse.ok) {
      console.error(`[enrich] Gemini error: ${geminiResponse.status}`);
      return;
    }

    const geminiResult = await geminiResponse.json();
    const rawText = geminiResult.candidates?.[0]?.content?.parts?.[0]?.text || '{}';

    let enrichmentData;
    try {
      enrichmentData = JSON.parse(rawText);
    } catch {
      console.error('[enrich] Failed to parse Gemini response');
      enrichmentData = { company_name: null, one_liner: 'Could not analyze website' };
    }

    enrichmentData.enriched_at = new Date().toISOString();

    await supabase
      .from('match_tool_leads')
      .update({ enrichment_data: enrichmentData })
      .eq('id', leadId);

    console.log(`[enrich] Successfully enriched lead ${leadId}`);
  } catch (err) {
    console.error('[enrich] Background enrichment error:', err);
  }
}

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

    // Fire-and-forget enrichment — get the lead ID and enrich in background
    const leadId = data;
    if (leadId && website) {
      // Don't await — let it run in the background
      enrichLead(supabase, leadId, website).catch((e) =>
        console.error('[ingest] enrichment fire-and-forget error:', e)
      );
    }

    return json({ success: true, id: data });
  } catch (err) {
    console.error("ingest-match-tool-lead error:", err);
    // Always return 200 so the calling tool never shows an error to the user
    return json({ error: "Internal error", success: false });
  }
});
