import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, corsPreflightResponse } from "../_shared/cors.ts";
import { requireAdmin } from '../_shared/auth.ts';

const COMPANY_SCHEMA = {
  name: "extract_company",
  description: "Extract a structured company profile from website content.",
  parameters: {
    type: "object",
    properties: {
      company_name: { type: "string", description: "Official company name" },
      one_liner: { type: "string", description: "One sentence describing what they do and where" },
      services: { type: "array", items: { type: "string" }, description: "Specific services they offer" },
      industry: { type: "string", description: "Industry vertical (e.g. 'Home Services — HVAC')" },
      geography: { type: "string", description: "Primary location/service area" },
      employee_estimate: { type: "string", description: "Estimated size range (e.g. '10-25')" },
      year_founded: { type: "string", description: "Year founded or null" },
      revenue_estimate: { type: "string", description: "Estimated revenue range if inferable" },
      notable_signals: { type: "array", items: { type: "string" }, description: "Notable business signals" },
    },
    required: ["company_name", "one_liner", "services", "industry", "geography"],
    additionalProperties: false,
  },
};

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

    // Extract with OpenAI
    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    if (!OPENAI_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'OPENAI_API_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const truncatedMarkdown = markdown.slice(0, 8000);

    const prompt = `Analyze this company website content and extract a structured profile. Be concise and factual. If information is not available, use null.

Website: ${formattedUrl}
Content:
${truncatedMarkdown || '(No content available - infer from URL only)'}`;

    const aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'Extract structured company data from the provided website content. Be concise and factual.' },
          { role: 'user', content: prompt },
        ],
        tools: [{ type: 'function', function: COMPANY_SCHEMA }],
        tool_choice: { type: 'function', function: { name: 'extract_company' } },
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error(`[enrich-match-tool-lead] OpenAI error: ${aiResponse.status} - ${errText}`);
      
      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: 'AI rate limit exceeded, please try again later' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (aiResponse.status === 402) {
        return new Response(
          JSON.stringify({ error: 'AI credits exhausted, please add funds' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      return new Response(
        JSON.stringify({ error: 'AI extraction failed' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const aiResult = await aiResponse.json();
    
    let enrichmentData;
    try {
      const toolCall = aiResult.choices?.[0]?.message?.tool_calls?.[0];
      if (toolCall?.function?.arguments) {
        enrichmentData = typeof toolCall.function.arguments === 'string'
          ? JSON.parse(toolCall.function.arguments)
          : toolCall.function.arguments;
      } else {
        // Fallback: try parsing content directly
        const content = aiResult.choices?.[0]?.message?.content || '{}';
        enrichmentData = JSON.parse(content);
      }
    } catch {
      console.error('[enrich-match-tool-lead] Failed to parse AI response:', JSON.stringify(aiResult));
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
