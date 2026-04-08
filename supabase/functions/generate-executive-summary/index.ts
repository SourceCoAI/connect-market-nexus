import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';
import { requireAdmin } from '../_shared/auth.ts';
import { errorResponse } from '../_shared/error-response.ts';
import {
  GEMINI_API_URL,
  getGeminiHeaders,
  DEFAULT_GEMINI_MODEL,
  fetchWithAutoRetry,
} from '../_shared/ai-providers.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsPreflightResponse(req);
  const corsHeaders = getCorsHeaders(req);

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const auth = await requireAdmin(req, supabaseAdmin);
  if (!auth.isAdmin) {
    return errorResponse(auth.error || 'Admin access required', auth.authenticated ? 403 : 401, corsHeaders);
  }

  try {
    const { deal_id } = await req.json();
    if (!deal_id) {
      return errorResponse('deal_id is required', 400, corsHeaders);
    }

    // Fetch listing data
    const { data: listing, error: listingErr } = await supabaseAdmin
      .from('listings')
      .select('title, internal_company_name, category, location, revenue, ebitda, description, services, owner_goals, general_notes, key_risks, growth_trajectory, customer_types, number_of_locations, full_time_employees, part_time_employees, geographic_states, revenue_model, business_model, acquisition_type')
      .eq('id', deal_id)
      .maybeSingle();

    if (listingErr) throw listingErr;
    if (!listing) {
      return errorResponse('Deal not found', 404, corsHeaders);
    }

    // Build context for AI
    const parts: string[] = [];
    if (listing.title) parts.push(`Title: ${listing.title}`);
    if (listing.internal_company_name) parts.push(`Company: ${listing.internal_company_name}`);
    if (listing.category) parts.push(`Industry: ${listing.category}`);
    if (listing.location) parts.push(`Location: ${listing.location}`);
    if (listing.revenue) parts.push(`Revenue: $${(listing.revenue / 1_000_000).toFixed(1)}M`);
    if (listing.ebitda) parts.push(`EBITDA: $${(listing.ebitda / 1_000_000).toFixed(1)}M`);
    if (listing.full_time_employees) parts.push(`Employees: ${listing.full_time_employees} FT`);
    if (listing.number_of_locations) parts.push(`Locations: ${listing.number_of_locations}`);
    if (listing.services) parts.push(`Services: ${listing.services}`);
    if (listing.customer_types) parts.push(`Customer Types: ${JSON.stringify(listing.customer_types)}`);
    if (listing.growth_trajectory) parts.push(`Growth: ${listing.growth_trajectory}`);
    if (listing.revenue_model) parts.push(`Revenue Model: ${listing.revenue_model}`);
    if (listing.business_model) parts.push(`Business Model: ${listing.business_model}`);
    if (listing.acquisition_type) parts.push(`Acquisition Type: ${listing.acquisition_type}`);
    if (listing.geographic_states) parts.push(`Geographic Coverage: ${JSON.stringify(listing.geographic_states)}`);
    if (listing.owner_goals) parts.push(`Owner Goals: ${listing.owner_goals}`);
    if (listing.description) parts.push(`Description: ${listing.description.substring(0, 1500)}`);
    if (listing.general_notes) parts.push(`Notes: ${listing.general_notes.substring(0, 1000)}`);
    if (listing.key_risks) parts.push(`Key Risks: ${listing.key_risks}`);

    const geminiKey = Deno.env.get('GEMINI_API_KEY');
    if (!geminiKey) {
      return errorResponse('GEMINI_API_KEY not configured', 500, corsHeaders);
    }

    const systemPrompt = `You are an M&A analyst writing executive summaries for deal listings. Write a concise 3-5 sentence executive summary that highlights the key investment thesis. Include: what the company does, its financial profile, geographic presence, and why it would be attractive to buyers. Be factual - only reference data provided. Do not use em dashes. Use a professional, direct tone. Do not include any header or label - just the summary text.`;

    const userPrompt = `Generate an executive summary for this deal:\n\n${parts.join('\n')}`;

    const response = await fetchWithAutoRetry(
      GEMINI_API_URL,
      {
        method: 'POST',
        headers: getGeminiHeaders(geminiKey),
        body: JSON.stringify({
          model: DEFAULT_GEMINI_MODEL,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.3,
          max_tokens: 500,
        }),
        signal: AbortSignal.timeout(30000),
      },
      { maxRetries: 2, baseDelayMs: 1000, callerName: 'generate-executive-summary' },
    );

    if (!response.ok) {
      const errText = await response.text();
      console.error('Gemini error:', response.status, errText.substring(0, 300));
      return errorResponse('AI generation failed', 502, corsHeaders);
    }

    const result = await response.json();
    const summary = result.choices?.[0]?.message?.content?.trim();

    if (!summary) {
      return errorResponse('AI returned empty summary', 502, corsHeaders);
    }

    return new Response(JSON.stringify({ summary }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('generate-executive-summary error:', err);
    return errorResponse(err instanceof Error ? err.message : 'Internal error', 500, corsHeaders);
  }
});
