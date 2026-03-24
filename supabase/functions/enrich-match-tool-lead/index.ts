import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, corsPreflightResponse } from "../_shared/cors.ts";
import { requireAdmin } from '../_shared/auth.ts';

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(req);
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const auth = await requireAdmin(req, supabaseAdmin);
    if (!auth.authenticated || !auth.isAdmin) {
      return new Response(JSON.stringify({ error: auth.error || 'Unauthorized' }), {
        status: auth.authenticated ? 403 : 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { lead_id, website } = await req.json();
    if (!lead_id || !website) {
      return new Response(
        JSON.stringify({ error: 'lead_id and website are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check cache first
    const { data: existing } = await supabaseAdmin
      .from('match_tool_leads')
      .select('enrichment_data')
      .eq('id', lead_id)
      .single();

    if (existing?.enrichment_data) {
      return new Response(
        JSON.stringify({ success: true, data: existing.enrichment_data, cached: true }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Scrape via Firecrawl
    const FIRECRAWL_API_KEY = Deno.env.get('FIRECRAWL_API_KEY');
    if (!FIRECRAWL_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'FIRECRAWL_API_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let formattedUrl = website.trim();
    if (!formattedUrl.startsWith('http://') && !formattedUrl.startsWith('https://')) {
      formattedUrl = `https://${formattedUrl}`;
    }

    console.log(`[enrich-match-tool-lead] Scraping: ${formattedUrl}`);

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
      console.warn(`[enrich-match-tool-lead] Firecrawl failed: ${scrapeResponse.status}`);
    }

    // Extract with Gemini
    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
    if (!GEMINI_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'GEMINI_API_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
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
      const errText = await geminiResponse.text();
      console.error(`[enrich-match-tool-lead] Gemini error: ${geminiResponse.status} - ${errText}`);
      return new Response(
        JSON.stringify({ error: 'AI extraction failed' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const geminiResult = await geminiResponse.json();
    const rawText = geminiResult.candidates?.[0]?.content?.parts?.[0]?.text || '{}';

    let enrichmentData;
    try {
      enrichmentData = JSON.parse(rawText);
    } catch {
      console.error('[enrich-match-tool-lead] Failed to parse Gemini response:', rawText);
      enrichmentData = { company_name: null, one_liner: 'Could not analyze website' };
    }

    enrichmentData.enriched_at = new Date().toISOString();

    // Cache to DB
    await supabaseAdmin
      .from('match_tool_leads')
      .update({ enrichment_data: enrichmentData })
      .eq('id', lead_id);

    return new Response(
      JSON.stringify({ success: true, data: enrichmentData, cached: false }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('[enrich-match-tool-lead] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
