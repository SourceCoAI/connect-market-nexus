import 'https://deno.land/x/xhr@0.1.0/mod.ts';
import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4';

import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(req);
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } },
    );

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      throw new Error('Unauthorized');
    }

    const { listingId } = await req.json();
    if (!listingId) throw new Error('listingId is required');

    // Fetch buyer profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select(
        'first_name, last_name, company, buyer_type, business_categories, target_locations, revenue_range_min, revenue_range_max, ebitda_min, ebitda_max, deal_intent, ideal_target_description, bio, job_title, fund_size, aum, investment_size, estimated_revenue, industry_expertise, geographic_focus',
      )
      .eq('id', user.id)
      .single();

    if (profileError) throw profileError;

    // Fetch listing details
    const { data: listing, error: listingError } = await supabase
      .from('listings')
      .select(
        'title, category, categories, location, revenue, ebitda, description, hero_description, acquisition_type, ownership_structure, seller_motivation, timeline_preference',
      )
      .eq('id', listingId)
      .single();

    if (listingError) throw listingError;

    // Build the prompt
    const buyerContext = [
      `Buyer type: ${profile.buyer_type || 'Not specified'}`,
      profile.company ? `Company/Firm: ${profile.company}` : null,
      profile.job_title ? `Title: ${profile.job_title}` : null,
      profile.business_categories?.length
        ? `Sector focus: ${profile.business_categories.join(', ')}`
        : null,
      profile.target_locations?.length
        ? `Geographic focus: ${Array.isArray(profile.target_locations) ? profile.target_locations.join(', ') : profile.target_locations}`
        : null,
      profile.revenue_range_min || profile.revenue_range_max
        ? `Revenue target: ${profile.revenue_range_min || 'Any'} - ${profile.revenue_range_max || 'Any'}`
        : null,
      profile.ebitda_min || profile.ebitda_max
        ? `EBITDA target: ${profile.ebitda_min || 'Any'} - ${profile.ebitda_max || 'Any'}`
        : null,
      profile.deal_intent ? `Deal intent: ${profile.deal_intent}` : null,
      profile.ideal_target_description
        ? `Acquisition thesis: ${profile.ideal_target_description}`
        : null,
      profile.fund_size ? `Fund size: ${profile.fund_size}` : null,
      profile.aum ? `AUM: ${profile.aum}` : null,
      profile.industry_expertise?.length
        ? `Industry expertise: ${profile.industry_expertise.join(', ')}`
        : null,
    ]
      .filter(Boolean)
      .join('\n');

    const listingContext = [
      `Business: ${listing.title}`,
      `Category: ${listing.category}`,
      listing.categories?.length ? `Categories: ${listing.categories.join(', ')}` : null,
      `Location: ${listing.location}`,
      listing.revenue ? `Revenue: $${(listing.revenue / 1000000).toFixed(1)}M` : null,
      listing.ebitda ? `EBITDA: $${(listing.ebitda / 1000000).toFixed(1)}M` : null,
      listing.acquisition_type ? `Acquisition type: ${listing.acquisition_type}` : null,
      listing.hero_description ? `Summary: ${listing.hero_description}` : null,
      listing.executive_summary ? `Executive Summary: ${listing.executive_summary.substring(0, 500)}` : null,
      listing.ownership_structure ? `Ownership: ${listing.ownership_structure}` : null,
      listing.seller_motivation ? `Seller motivation: ${listing.seller_motivation}` : null,
      listing.timeline_preference ? `Timeline: ${listing.timeline_preference}` : null,
    ]
      .filter(Boolean)
      .join('\n');

    const systemPrompt = `You are a connection message drafting assistant for SourceCo, an M&A marketplace. You help buyers write compelling connection request messages to business owners.

The message should:
- Be written in first person from the buyer's perspective
- Be 200-350 words, concise and specific
- Follow this structure:
  1. Opening: Who we are and our relevant acquisition experience
  2. Fit: Why this specific business aligns with our thesis (sector/geography/size overlap)
  3. Capability: Why we can close (timeline signal, capital readiness)
  4. Close: Request for an intro call or more details
- Reference specific data points showing the match between buyer profile and listing
- Sound professional but genuine — not templated
- Never include placeholder text like [insert X here]

If the buyer's profile has limited information, still write the best message possible with what's available, but note at the end which profile fields would strengthen the message.`;

    const userPrompt = `Draft a connection request message for this buyer and listing:

BUYER PROFILE:
${buyerContext}

LISTING:
${listingContext}

Write the message now. Do not include any preamble or explanation — just the message text itself.`;

    if (!ANTHROPIC_API_KEY) {
      // Fallback template when no API key
      const fallback = `I'm reaching out regarding ${listing.title}. ${profile.company ? `At ${profile.company}, we` : 'We'} are actively pursuing acquisitions in the ${listing.category} space${profile.target_locations?.length ? `, particularly in ${Array.isArray(profile.target_locations) ? profile.target_locations[0] : profile.target_locations}` : ''}. This opportunity aligns well with our investment criteria${profile.deal_intent ? ` as a ${profile.deal_intent} acquisition` : ''}. We would welcome the opportunity to learn more about the business and discuss how we might be a strong fit. We are prepared to move quickly and have the capital ready to deploy.`;

      return new Response(JSON.stringify({ message: fallback, source: 'template' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`Claude API error: ${response.status} ${errorBody}`);
      throw new Error(`AI service error: ${response.status}`);
    }

    const result = await response.json();
    const message = result.content?.[0]?.text || '';

    return new Response(JSON.stringify({ message, source: 'ai' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('draft-connection-message error:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : String(error) || 'Failed to draft message',
      }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }
});
