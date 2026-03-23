import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { GEMINI_API_URL, getGeminiHeaders, DEFAULT_GEMINI_MODEL } from '../_shared/ai-providers.ts';

import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';

interface SuggestRequest {
  listing_id: string;
}

interface UniverseSuggestion {
  universe_id: string;
  universe_name: string;
  confidence: number;
  reason: string;
  matching_criteria: string[];
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(req);
  }

  try {
    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
    if (!GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY is not configured');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body: SuggestRequest = await req.json();
    const { listing_id } = body;

    // Fetch listing details
    const { data: listing, error: listingError } = await supabase
      .from('listings')
      .select('*')
      .eq('id', listing_id)
      .single();

    if (listingError || !listing) {
      throw new Error('Listing not found');
    }

    // Fetch all active universes with their criteria
    const { data: universes, error: universesError } = await supabase
      .from('buyer_universes')
      .select(
        'id, name, description, fit_criteria, size_criteria, geography_criteria, service_criteria',
      )
      .eq('archived', false);

    if (universesError) {
      throw new Error('Failed to fetch universes');
    }

    if (!universes || universes.length === 0) {
      return new Response(JSON.stringify({ suggestions: [], message: 'No universes available' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check which universes this listing is already linked to
    const { data: existingLinks } = await supabase
      .from('remarketing_universe_deals')
      .select('universe_id')
      .eq('listing_id', listing_id);

    const linkedUniverseIds = new Set((existingLinks || []).map((l) => l.universe_id));

    // Filter out already-linked universes
    const unlinkedUniverses = universes.filter((u) => !linkedUniverseIds.has(u.id));

    if (unlinkedUniverses.length === 0) {
      return new Response(
        JSON.stringify({
          suggestions: [],
          message: 'Listing is already linked to all available universes',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Use AI to suggest the best universes
    const prompt = `You are a M&A matching expert. Analyze this listing and suggest which buyer universes it should be linked to.

LISTING:
- Title: ${listing.title}
- Category: ${listing.category || 'N/A'}
- Location: ${listing.location || 'N/A'}
- Revenue: ${listing.revenue ? `$${listing.revenue.toLocaleString()}` : 'N/A'}
- EBITDA: ${listing.ebitda ? `$${listing.ebitda.toLocaleString()}` : 'N/A'}
- Description: ${listing.description?.substring(0, 500) || 'N/A'}

AVAILABLE UNIVERSES:
${unlinkedUniverses
  .map(
    (u, i) => `
${i + 1}. ${u.name}
   - Description: ${u.description || 'N/A'}
   - Fit Criteria: ${u.fit_criteria || 'N/A'}
   - Size Criteria: ${JSON.stringify(u.size_criteria || {})}
   - Geography Criteria: ${JSON.stringify(u.geography_criteria || {})}
   - Service Criteria: ${JSON.stringify(u.service_criteria || {})}
`,
  )
  .join('\n')}

For each universe that is a potential match, provide:
1. A confidence score (0-100)
2. A brief reason for the match
3. Which specific criteria matched

Return JSON array: [{ "index": 1, "confidence": 85, "reason": "...", "matching_criteria": ["category", "size"] }]
Only include universes with confidence >= 50. Sort by confidence descending.`;

    const aiResponse = await fetch(GEMINI_API_URL, {
      method: 'POST',
      headers: getGeminiHeaders(GEMINI_API_KEY),
      body: JSON.stringify({
        model: DEFAULT_GEMINI_MODEL,
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      }),
    });

    if (!aiResponse.ok) {
      console.error('AI API error:', await aiResponse.text());
      throw new Error('AI suggestion failed');
    }

    const aiResult = await aiResponse.json();
    const responseText = aiResult.choices?.[0]?.message?.content || '';

    // Parse AI response
    let suggestions: UniverseSuggestion[] = [];
    try {
      const jsonMatch = responseText.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as {
          index: number;
          confidence: number;
          reason: string;
          matching_criteria?: string[];
        }[];
        suggestions = parsed
          .filter((s) => s.confidence >= 50)
          .map((s) => ({
            universe_id: unlinkedUniverses[s.index - 1]?.id,
            universe_name: unlinkedUniverses[s.index - 1]?.name,
            confidence: s.confidence,
            reason: s.reason,
            matching_criteria: s.matching_criteria || [],
          }))
          .filter((s: UniverseSuggestion) => s.universe_id);
      }
    } catch (parseError) {
      console.error('Failed to parse AI response:', parseError);
      // Fallback: simple category matching
      suggestions = unlinkedUniverses
        .filter((u) => {
          const listingCategory = (listing.category || '').toLowerCase();
          const universeDesc = (u.description || '').toLowerCase() + (u.name || '').toLowerCase();
          return (
            universeDesc.includes(listingCategory) ||
            listingCategory.includes(universeDesc.split(' ')[0])
          );
        })
        .map((u) => ({
          universe_id: u.id,
          universe_name: u.name,
          confidence: 60,
          reason: 'Category match',
          matching_criteria: ['category'],
        }));
    }

    // Sort by confidence
    suggestions.sort((a, b) => b.confidence - a.confidence);

    return new Response(
      JSON.stringify({
        success: true,
        suggestions,
        listing_title: listing.title,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('Suggest universe error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
