import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';
import { requireAdmin } from '../_shared/auth.ts';
import { callGeminiWithTool, DEFAULT_GEMINI_MODEL } from '../_shared/ai-providers.ts';

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(req);
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
    if (!GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY is not configured');
    }

    // Require admin authentication
    const auth = await requireAdmin(req, supabase);
    if (!auth.isAdmin) {
      return new Response(JSON.stringify({ error: auth.error || 'Admin access required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { listing_id } = await req.json();

    if (!listing_id) {
      return new Response(JSON.stringify({ error: 'listing_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch the listing with all enrichment data
    const { data: listing, error: fetchError } = await supabase
      .from('listings')
      .select(
        'id, title, internal_company_name, website, industry, category, categories, ' +
          'description, executive_summary, hero_description, end_market_description, ' +
          'address_state, address_city, geographic_states, ' +
          'revenue, ebitda, ebitda_margin, business_model, services, service_mix, ' +
          'full_time_employees, number_of_locations, founded_year, ' +
          'buyer_universe_label, buyer_universe_description, buyer_universe_generated_at',
      )
      .eq('id', listing_id)
      .single();

    if (fetchError || !listing) {
      return new Response(JSON.stringify({ error: 'Listing not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // If already generated, return cached values
    if (listing.buyer_universe_generated_at) {
      return new Response(
        JSON.stringify({
          buyer_universe_label: listing.buyer_universe_label,
          buyer_universe_description: listing.buyer_universe_description,
          generated_at: listing.buyer_universe_generated_at,
          cached: true,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Build context from enrichment data
    const companyName = listing.internal_company_name || listing.title;
    const contextParts: string[] = [];

    contextParts.push(`Company Name: ${companyName}`);
    if (listing.website) contextParts.push(`Website: ${listing.website}`);
    if (listing.industry) contextParts.push(`Industry: ${listing.industry}`);
    if (listing.category) contextParts.push(`Category: ${listing.category}`);
    if (listing.categories?.length)
      contextParts.push(`Categories: ${listing.categories.join(', ')}`);
    if (listing.description) contextParts.push(`Description: ${listing.description.slice(0, 500)}`);
    if (listing.executive_summary)
      contextParts.push(`Executive Summary: ${listing.executive_summary.slice(0, 500)}`);
    if (listing.hero_description)
      contextParts.push(`Hero Description: ${listing.hero_description}`);
    if (listing.end_market_description)
      contextParts.push(`End Market: ${listing.end_market_description}`);
    if (listing.address_state) contextParts.push(`State: ${listing.address_state}`);
    if (listing.address_city) contextParts.push(`City: ${listing.address_city}`);
    if (listing.geographic_states?.length)
      contextParts.push(`Geographic Coverage: ${listing.geographic_states.join(', ')}`);
    if (listing.revenue)
      contextParts.push(`Revenue: $${(listing.revenue / 1_000_000).toFixed(1)}M`);
    if (listing.ebitda) contextParts.push(`EBITDA: $${(listing.ebitda / 1_000_000).toFixed(1)}M`);
    if (listing.ebitda_margin) contextParts.push(`EBITDA Margin: ${listing.ebitda_margin}%`);
    if (listing.business_model) contextParts.push(`Business Model: ${listing.business_model}`);
    if (listing.services?.length) contextParts.push(`Services: ${listing.services.join(', ')}`);
    if (listing.service_mix) contextParts.push(`Service Mix: ${listing.service_mix}`);
    if (listing.full_time_employees) contextParts.push(`Employees: ${listing.full_time_employees}`);
    if (listing.number_of_locations) contextParts.push(`Locations: ${listing.number_of_locations}`);
    if (listing.founded_year) contextParts.push(`Founded: ${listing.founded_year}`);

    const companyContext = contextParts.join('\n');

    const systemPrompt = `You are an M&A deal sourcing expert who helps identify buyer universes for acquisition targets. You understand PE platform strategies, add-on acquisition theses, and strategic buyer motivations.

Given information about a company, you must produce two outputs:

1. **buyer_universe_label**: A short label (3-6 words max) identifying the SPECIFIC TYPE of business or service vertical, ending with "Add-On" or occasionally "Platform Target".
   The label must answer: "What exact type of company is this?" — NOT "Where do they operate?" or "How big are they?"

   STRICT RULES:
   - NEVER lead with geography (no "Regional", "Southeast", "Pacific NW", "National", "Midwest", etc.)
   - NEVER use vague filler words like "Services", "Solutions", or "Platform" as the PRIMARY descriptor — the specific trade or product type must come first
   - Focus on the specific trade, product, or service vertical
   - Keep it under 6 words total

   FORMAT: [Specific Service/Product Type] + Add-On  OR  [Specific Service/Product Type] + Platform Target

   GOOD examples:
   - "Window & Door Installation Add-On" (specific trade)
   - "Commercial Fleet Maintenance Add-On" (specific service)
   - "HVAC Services Add-On" (specific trade)
   - "Restoration Services Add-On" (specific vertical — fire/water damage)
   - "Equipment Rental & Supply Add-On" (specific product type)
   - "Commercial Landscaping Add-On" (specific trade)
   - "Last-Mile Logistics Add-On" (specific service model)

   BAD examples (NEVER produce these):
   - "Pacific NW Home Services Add-On" (leads with geography)
   - "Regional Fleet Services Add-On" (leads with geography, vague "Services")
   - "Southeast Mechanical Services Add-On" (leads with geography)
   - "Regional Equipment Rental Platform Add-On" (leads with geography)
   - "Trucking Company" (too generic, missing "Add-On")
   - "Commercial Landscaping Platform Add-On" (unnecessary "Platform")

2. **buyer_universe_description**: Exactly 2 sentences.
   - Sentence 1: What this company specifically does (precise trade/service, not a generic industry tag).
   - Sentence 2: Who would likely acquire them and why (what type of PE firm or strategic buyer, and what acquisition thesis fits).

Be specific about the trade or service vertical. Focus on specialization and deal thesis, not geography.`;

    const tool = {
      type: 'function',
      function: {
        name: 'set_buyer_universe',
        description: 'Set the buyer universe label and description for this deal',
        parameters: {
          type: 'object',
          properties: {
            buyer_universe_label: {
              type: 'string',
              description:
                'Short 3-6 word label identifying the specific service/product type ending with Add-On. Never lead with geography. Example: "Window & Door Installation Add-On"',
            },
            buyer_universe_description: {
              type: 'string',
              description:
                'Exactly 2 sentences: what the company does specifically, then who would acquire and why',
            },
          },
          required: ['buyer_universe_label', 'buyer_universe_description'],
        },
      },
    };

    const result = await callGeminiWithTool(
      systemPrompt,
      `Analyze this company and generate the buyer universe label and description:\n\n${companyContext}`,
      tool,
      GEMINI_API_KEY,
      DEFAULT_GEMINI_MODEL,
      20000,
      1024,
    );

    if (result.error) {
      if (result.error.code === 'rate_limited') {
        return new Response(
          JSON.stringify({ error: 'AI service busy. Please wait 30 seconds and try again.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
      throw new Error(result.error.message);
    }

    const label: string | null = result.data?.buyer_universe_label || null;
    const description: string | null = result.data?.buyer_universe_description || null;

    if (!label) {
      return new Response(JSON.stringify({ error: 'AI failed to generate buyer universe data' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Store results in the database
    const now = new Date().toISOString();
    const { error: updateError } = await supabase
      .from('listings')
      .update({
        buyer_universe_label: label,
        buyer_universe_description: description,
        buyer_universe_generated_at: now,
      } as never)
      .eq('id', listing_id);

    if (updateError) {
      console.error('Failed to store buyer universe data:', updateError);
      return new Response(JSON.stringify({ error: 'Failed to store results' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(
      JSON.stringify({
        buyer_universe_label: label,
        buyer_universe_description: description,
        generated_at: now,
        cached: false,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('Generate buyer universe error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
