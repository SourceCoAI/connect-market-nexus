/**
 * Recommended Buyer Tools (Feature 1)
 * AI-ranked buyer shortlist and strategy narrative generation.
 *
 * Both tools invoke the `score-deal-buyers` edge function for scored buyer data.
 * `generate_buyer_narrative` additionally calls Gemini to synthesize a written
 * strategy paragraph referencing the deal's service type, geography, EBITDA range,
 * and per-buyer rationale.
 */

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import type { ClaudeTool } from '../../_shared/claude-client.ts';
import type { ToolResult } from './index.ts';
import {
  GEMINI_API_URL,
  getGeminiHeaders,
  DEFAULT_GEMINI_MODEL,
  fetchWithAutoRetry,
} from '../../_shared/ai-providers.ts';

// ---------- Types ----------

interface BuyerScore {
  buyer_id: string;
  company_name: string;
  pe_firm_name: string | null;
  buyer_type: string | null;
  hq_state: string | null;
  hq_city: string | null;
  has_fee_agreement: boolean;
  acquisition_appetite: string | null;
  composite_score: number;
  service_score: number;
  geography_score: number;
  size_score: number;
  bonus_score: number;
  fit_signals: string[];
  tier: 'move_now' | 'strong' | 'speculative';
  source: string;
}

interface ScoreDealBuyersResponse {
  buyers: BuyerScore[];
  total: number;
  total_scored?: number;
  cached: boolean;
  scored_at: string;
}

// ---------- Tool definitions ----------

export const recommendedBuyerTools: ClaudeTool[] = [
  {
    name: 'get_recommended_buyers',
    description: `Get AI-ranked buyer recommendations for a deal with composite scoring, tier classification, fit signals, and engagement data.
DATA SOURCE: Invokes the score-deal-buyers edge function which scores ALL active buyers against the deal across 3 dimensions: service/sector (70%), geography (15%), and bonus factors (15%). EBITDA size scoring was removed in v3 as unreliable.
RESPONSE: Returns buyers grouped by tier (move_now, strong, speculative) with composite_score, per-dimension scores, fit_signals, buyer profile data, and tier classification.
USE WHEN: "Who should we target for this deal?", "Recommended buyers for [deal]", "Best fit buyers", "Buyer shortlist".
NOTE: Also fetches deal details and buyer universe context for richer presentation.`,
    input_schema: {
      type: 'object',
      properties: {
        deal_id: {
          type: 'string',
          description: 'The deal/listing UUID to get buyer recommendations for',
        },
        min_score: {
          type: 'number',
          description: 'Minimum composite score threshold (default 0 — returns all scored buyers)',
        },
        tier: {
          type: 'string',
          enum: ['move_now', 'strong', 'speculative'],
          description: 'Filter to a specific tier only',
        },
        limit: {
          type: 'number',
          description: 'Max buyers to return (default 50, which is the scoring cap)',
        },
        force_refresh: {
          type: 'boolean',
          description: 'Force re-scoring even if cached results exist (default false)',
        },
      },
      required: ['deal_id'],
    },
  },
  {
    name: 'generate_buyer_narrative',
    description: `Generate a written strategy narrative for a deal's recommended buyers. Invokes scoring, then uses Gemini to produce a strategy paragraph referencing the deal's service type, geography, and per-buyer rationale with tier summaries and recommended next actions.
USE WHEN: "Write a buyer strategy for [deal]", "Narrative buyer analysis", "Strategy memo for recommended buyers".
RETURNS: A structured response with the narrative text, deal context, tier summaries, and the underlying scored buyer data.`,
    input_schema: {
      type: 'object',
      properties: {
        deal_id: {
          type: 'string',
          description: 'The deal/listing UUID to generate narrative for',
        },
        force_refresh: {
          type: 'boolean',
          description: 'Force re-scoring before generating narrative (default false)',
        },
      },
      required: ['deal_id'],
    },
  },
];

// ---------- Executor ----------

export async function executeRecommendedBuyerTool(
  supabase: SupabaseClient,
  toolName: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  switch (toolName) {
    case 'get_recommended_buyers':
      return getRecommendedBuyers(supabase, args);
    case 'generate_buyer_narrative':
      return generateBuyerNarrative(supabase, args);
    default:
      return { error: `Unknown recommended buyer tool: ${toolName}` };
  }
}

// ---------- Shared: invoke score-deal-buyers edge function ----------

async function invokeScoringFunction(
  supabase: SupabaseClient,
  dealId: string,
  forceRefresh: boolean,
): Promise<{ data: ScoreDealBuyersResponse | null; error: string | null }> {
  try {
    const { data, error } = await supabase.functions.invoke('score-deal-buyers', {
      body: { listingId: dealId, forceRefresh },
    });

    if (error) {
      // Extract message from FunctionsHttpError
      let msg = error.message || String(error);
      if (error.context && typeof error.context.json === 'function') {
        try {
          const body = await error.context.json();
          if (body?.error) msg = body.error + (body.details ? `: ${body.details}` : '');
        } catch {
          // fall through
        }
      }
      return { data: null, error: msg };
    }

    if (!data || !Array.isArray(data.buyers)) {
      return { data: null, error: 'Unexpected response shape from score-deal-buyers' };
    }

    return { data: data as ScoreDealBuyersResponse, error: null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { data: null, error: `Failed to invoke score-deal-buyers: ${msg}` };
  }
}

// ---------- Shared: fetch deal details ----------

async function fetchDealContext(
  supabase: SupabaseClient,
  dealId: string,
): Promise<Record<string, unknown> | null> {
  const { data, error } = await supabase
    .from('listings')
    .select(
      'id, title, industry, category, categories, services, revenue, ebitda, ' +
        'address_state, geographic_states, location, executive_summary, investment_thesis, ' +
        'business_model, owner_goals, number_of_locations, full_time_employees, remarketing_status',
    )
    .eq('id', dealId)
    .single();

  if (error) {
    console.error(`[recommended-buyer-tools] Deal fetch failed: ${error.message}`);
    return null;
  }
  return data as unknown as Record<string, unknown>;
}

// ---------- Implementation: get_recommended_buyers ----------

async function getRecommendedBuyers(
  supabase: SupabaseClient,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const dealId = args.deal_id as string;
  const minScore = (args.min_score as number) || 0;
  const tierFilter = args.tier as string | undefined;
  const limit = Math.min(Number(args.limit) || 50, 50);
  const forceRefresh = args.force_refresh === true;

  // Parallel: score buyers + fetch deal context
  const [scoringResult, deal] = await Promise.all([
    invokeScoringFunction(supabase, dealId, forceRefresh),
    fetchDealContext(supabase, dealId),
  ]);

  if (scoringResult.error) {
    return { error: scoringResult.error };
  }

  const scoring = scoringResult.data!;
  let buyers = scoring.buyers;

  // Apply filters
  if (minScore > 0) {
    buyers = buyers.filter((b) => b.composite_score >= minScore);
  }
  if (tierFilter) {
    buyers = buyers.filter((b) => b.tier === tierFilter);
  }
  buyers = buyers.slice(0, limit);

  // Group by tier for structured presentation
  const tiers: Record<string, BuyerScore[]> = {
    move_now: [],
    strong: [],
    speculative: [],
  };
  for (const b of buyers) {
    if (tiers[b.tier]) {
      tiers[b.tier].push(b);
    }
  }

  // Summary stats
  const tierSummary = {
    move_now: tiers.move_now.length,
    strong: tiers.strong.length,
    speculative: tiers.speculative.length,
  };

  return {
    data: {
      buyers,
      tiers,
      tier_summary: tierSummary,
      total: buyers.length,
      total_scored: scoring.total_scored || scoring.total,
      cached: scoring.cached,
      scored_at: scoring.scored_at,
      deal: deal || { id: dealId },
      filters_applied: {
        ...(minScore > 0 ? { min_score: minScore } : {}),
        ...(tierFilter ? { tier: tierFilter } : {}),
        limit,
      },
    },
  };
}

// ---------- Implementation: generate_buyer_narrative ----------

async function generateBuyerNarrative(
  supabase: SupabaseClient,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const dealId = args.deal_id as string;
  const forceRefresh = args.force_refresh === true;

  // Parallel: score buyers + fetch deal context
  const [scoringResult, deal] = await Promise.all([
    invokeScoringFunction(supabase, dealId, forceRefresh),
    fetchDealContext(supabase, dealId),
  ]);

  if (scoringResult.error) {
    return { error: scoringResult.error };
  }

  const scoring = scoringResult.data!;
  const buyers = scoring.buyers;

  if (!deal) {
    return { error: `Deal not found: ${dealId}` };
  }

  // Group by tier
  const tiers: Record<string, BuyerScore[]> = {
    move_now: [],
    strong: [],
    speculative: [],
  };
  for (const b of buyers) {
    if (tiers[b.tier]) {
      tiers[b.tier].push(b);
    }
  }

  // Build deal context string for the prompt
  const dealTitle = (deal.title as string) || 'Unnamed Deal';
  const dealIndustry = (deal.industry as string) || (deal.category as string) || 'Unknown';
  const dealServices = Array.isArray(deal.services)
    ? (deal.services as string[]).join(', ')
    : (deal.services as string) || '';
  const dealState = (deal.address_state as string) || '';
  const dealGeoStates = Array.isArray(deal.geographic_states)
    ? (deal.geographic_states as string[]).join(', ')
    : '';
  const dealGeography = dealState
    ? `${dealState}${dealGeoStates ? ` (service area: ${dealGeoStates})` : ''}`
    : dealGeoStates || 'Unknown';
  const dealEbitda = deal.ebitda
    ? `$${((deal.ebitda as number) / 1_000_000).toFixed(1)}M`
    : 'Not disclosed';
  const dealRevenue = deal.revenue
    ? `$${((deal.revenue as number) / 1_000_000).toFixed(1)}M`
    : 'Not disclosed';
  const investmentThesis = (deal.investment_thesis as string) || '';
  const ownerGoals = (deal.owner_goals as string) || '';

  // Build buyer summaries for the prompt
  const buyerSummaries = buyers.slice(0, 25).map((b) => {
    const name = b.company_name || b.pe_firm_name || 'Unknown';
    const signals = b.fit_signals.length > 0 ? b.fit_signals.join('; ') : 'No specific signals';
    return `- ${name} (${b.buyer_type || 'unknown type'}, ${b.hq_state || '??'}): score=${b.composite_score}, tier=${b.tier}, svc=${b.service_score}, geo=${b.geography_score}, signals=[${signals}]${b.has_fee_agreement ? ', FEE AGREEMENT' : ''}${b.acquisition_appetite === 'aggressive' ? ', AGGRESSIVE APPETITE' : ''}`;
  });

  // Call Gemini to generate the narrative
  const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
  if (!geminiApiKey) {
    return {
      error: 'GEMINI_API_KEY not configured — cannot generate narrative',
    };
  }

  const systemPrompt = `You are a senior M&A advisor writing a buyer strategy narrative for an investment banker. Write in a professional, analytical tone. Be concise but insightful — this will be read by deal team members to guide outreach decisions.`;

  const userPrompt = `Write a buyer strategy narrative for the following deal and its recommended buyers.

DEAL CONTEXT:
- Title: ${dealTitle}
- Industry/Service Type: ${dealIndustry}${dealServices ? ` (${dealServices})` : ''}
- Geography: ${dealGeography}
- EBITDA: ${dealEbitda}
- Revenue: ${dealRevenue}
${investmentThesis ? `- Investment Thesis: ${investmentThesis}` : ''}
${ownerGoals ? `- Owner Goals: ${ownerGoals}` : ''}

TIER SUMMARY:
- Move Now (score 80+, active mandate): ${tiers.move_now.length} buyers
- Strong Candidate (score 60-79): ${tiers.strong.length} buyers
- Speculative (below 60): ${tiers.speculative.length} buyers

SCORED BUYERS (top ${buyerSummaries.length} of ${scoring.total_scored || scoring.total} total):
${buyerSummaries.join('\n')}

INSTRUCTIONS:
1. Start with a 2-3 sentence deal framing paragraph that captures the service type, geography, and what makes this deal attractive.
2. For each tier that has buyers, write a paragraph summarizing the tier and calling out 2-3 specific buyers with their rationale (citing fit signals, geography match, fee agreements, appetite).
3. End with a short "Recommended Actions" paragraph suggesting next steps (e.g., prioritize Move Now buyers for immediate outreach, schedule intro calls with Strong Candidates, monitor Speculative for mandate changes).
4. Keep the total narrative under 500 words.
5. Do NOT use markdown headers or bullet points — write in flowing prose paragraphs.`;

  try {
    const response = await fetchWithAutoRetry(
      GEMINI_API_URL,
      {
        method: 'POST',
        headers: getGeminiHeaders(geminiApiKey),
        body: JSON.stringify({
          model: DEFAULT_GEMINI_MODEL,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.4,
          max_tokens: 2048,
        }),
        signal: AbortSignal.timeout(30000),
      },
      { maxRetries: 2, baseDelayMs: 2000, callerName: 'BuyerNarrative' },
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `[generate_buyer_narrative] Gemini API error ${response.status}: ${errorText.substring(0, 300)}`,
      );
      return {
        error: `Gemini API error (${response.status}): ${errorText.substring(0, 200)}`,
      };
    }

    const geminiData = await response.json();
    const narrative =
      geminiData.choices?.[0]?.message?.content || geminiData.choices?.[0]?.text || '';

    if (!narrative) {
      return { error: 'Gemini returned an empty narrative response' };
    }

    return {
      data: {
        narrative,
        deal: {
          id: deal.id,
          title: dealTitle,
          industry: dealIndustry,
          services: dealServices,
          geography: dealGeography,
          ebitda: dealEbitda,
          revenue: dealRevenue,
        },
        tier_summary: {
          move_now: tiers.move_now.length,
          strong: tiers.strong.length,
          speculative: tiers.speculative.length,
        },
        total_scored: scoring.total_scored || scoring.total,
        scored_at: scoring.scored_at,
        buyers: buyers.slice(0, 25).map((b) => ({
          buyer_id: b.buyer_id,
          company_name: b.company_name,
          pe_firm_name: b.pe_firm_name,
          composite_score: b.composite_score,
          tier: b.tier,
          fit_signals: b.fit_signals,
        })),
      },
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[generate_buyer_narrative] Gemini call failed: ${msg}`);
    return { error: `Failed to generate narrative: ${msg}` };
  }
}
