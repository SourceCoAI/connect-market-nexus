/**
 * Industry Research Tools
 * Provides comprehensive industry research for PE due diligence and call prep.
 * Combines multiple data sources in parallel: M&A guides, Google search (Serper),
 * internal transcripts, buyer data, and deal data.
 */

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import type { ClaudeTool } from '../../_shared/claude-client.ts';
import type { ToolResult } from './index.ts';
import { googleSearch } from '../../_shared/serper-client.ts';

interface UniverseRow {
  id: string;
  name: string;
  ma_guide_content: string | null;
  ma_guide_generated_at: string | null;
  description: string | null;
  fit_criteria: string | null;
  service_criteria: string | null;
}

interface BuyerRow {
  id: string;
  company_name: string;
  pe_firm_name: string | null;
  buyer_type: string | null;
  hq_state: string | null;
  target_services: string | null;
  thesis_summary: string | null;
  acquisition_appetite: string | null;
  alignment_score: number | null;
}

interface DealRow {
  id: string;
  title: string;
  industry: string | null;
  services: string | null;
  address_state: string | null;
  reported_revenue: number | null;
  reported_ebitda: number | null;
  status: string | null;
  deal_total_score: number | null;
}

interface TranscriptMatch {
  source: string;
  id: string;
  buyer_id?: string;
  listing_id?: string;
  title: string | null;
  summary_preview?: string;
  call_date: string | null;
}

// ---------- Tool definitions ----------

export const industryResearchTools: ClaudeTool[] = [
  {
    name: 'research_industry',
    description: `Research an industry vertical for PE due diligence and call prep. This is the PRIMARY tool for industry questions.
Searches 5 sources IN PARALLEL:
1. M&A Guides — rich, multi-section industry research documents from our buyer universes (highest value if they exist)
2. Google — current M&A activity, market trends, valuation context via Serper
3. Internal transcripts — any prior call discussions about this industry
4. Buyers — PE firms and platforms active in this space
5. Deals — any deals we have in this industry

Use when:
- "Tell me about the restoration industry"
- "I have a call with a pest control company and don't know the space"
- "What do PE buyers look for in HVAC?"
- "Prep me for a diligence call in [industry]"
- "What questions should I ask a [industry] company?"`,
    input_schema: {
      type: 'object',
      properties: {
        industry: {
          type: 'string',
          description:
            'The industry to research — e.g. "restoration", "HVAC", "pest control", "collision repair", "staffing"',
        },
        focus: {
          type: 'string',
          enum: ['call_prep', 'market_overview', 'pe_landscape', 'diligence_questions'],
          description:
            'Research focus: "call_prep" (default, comprehensive), "market_overview" (market size/trends), "pe_landscape" (who is buying), "diligence_questions" (what to ask)',
        },
      },
      required: ['industry'],
    },
  },
];

// ---------- Executor ----------

export async function executeIndustryResearchTool(
  supabase: SupabaseClient,
  toolName: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  if (toolName !== 'research_industry') {
    return { error: `Unknown industry research tool: ${toolName}` };
  }

  return researchIndustry(supabase, args);
}

// ---------- Implementation ----------

async function researchIndustry(
  supabase: SupabaseClient,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const industry = ((args.industry as string) || '').trim();
  const focus = (args.focus as string) || 'call_prep';

  if (!industry) {
    return { error: 'industry parameter is required' };
  }

  const term = industry.toLowerCase();
  const sourcesSearched: string[] = [];

  // Run all 5 data fetches in parallel
  const [maGuides, webResearch, transcripts, buyers, deals] = await Promise.allSettled([
    searchMAGuides(supabase, term),
    searchWeb(industry, focus),
    searchTranscripts(supabase, term),
    searchBuyers(supabase, term),
    searchDeals(supabase, term),
  ]);

  // Assemble results, handling failures gracefully
  const result: Record<string, unknown> = { industry, focus };

  // 1. M&A Guides (highest value)
  if (maGuides.status === 'fulfilled' && maGuides.value.length > 0) {
    result.ma_guides = maGuides.value;
    sourcesSearched.push(`ma_guides (${maGuides.value.length} found)`);
  } else {
    result.ma_guides = [];
    sourcesSearched.push('ma_guides (none found)');
  }

  // 2. Web research
  if (webResearch.status === 'fulfilled') {
    result.web_research = webResearch.value;
    const totalResults =
      (webResearch.value.ma_activity?.length || 0) +
      (webResearch.value.market_trends?.length || 0) +
      (webResearch.value.valuation_context?.length || 0);
    sourcesSearched.push(`google_search (${totalResults} results)`);
  } else {
    result.web_research = { ma_activity: [], market_trends: [], valuation_context: [] };
    sourcesSearched.push(`google_search (failed: ${webResearch.reason})`);
  }

  // 3. Internal transcripts
  if (transcripts.status === 'fulfilled') {
    result.internal_transcripts = transcripts.value;
    sourcesSearched.push(`transcripts (${transcripts.value.count} matches)`);
  } else {
    result.internal_transcripts = { matches: [], count: 0 };
    sourcesSearched.push('transcripts (failed)');
  }

  // 4. Active buyers
  if (buyers.status === 'fulfilled') {
    result.active_buyers = buyers.value;
    sourcesSearched.push(`buyers (${buyers.value.count} matches)`);
  } else {
    result.active_buyers = { matches: [], count: 0 };
    sourcesSearched.push('buyers (failed)');
  }

  // 5. Related deals
  if (deals.status === 'fulfilled') {
    result.related_deals = deals.value;
    sourcesSearched.push(`deals (${deals.value.count} matches)`);
  } else {
    result.related_deals = { matches: [], count: 0 };
    sourcesSearched.push('deals (failed)');
  }

  result.sources_searched = sourcesSearched;

  return { data: result };
}

// ---------- Data source fetchers ----------

/**
 * Search buyer universes for M&A guides matching this industry.
 * These are the richest source — 14-phase AI-generated industry deep dives.
 */
async function searchMAGuides(
  supabase: SupabaseClient,
  term: string,
): Promise<
  Array<{
    universe_name: string;
    universe_id: string;
    guide_excerpt: string;
    generated_at: string | null;
  }>
> {
  const { data, error } = await supabase
    .from('buyer_universes')
    .select(
      'id, name, ma_guide_content, ma_guide_generated_at, description, fit_criteria, service_criteria',
    )
    .eq('archived', false)
    .not('ma_guide_content', 'is', null);

  if (error || !data) return [];

  // Filter universes whose name, description, or criteria mention the industry
  const matches = data.filter((u: UniverseRow) => {
    const searchText = [
      u.name || '',
      u.description || '',
      u.fit_criteria || '',
      u.service_criteria || '',
    ]
      .join(' ')
      .toLowerCase();
    return searchText.includes(term);
  });

  return matches.map((u: UniverseRow) => ({
    universe_name: u.name,
    universe_id: u.id,
    guide_excerpt: (u.ma_guide_content || '').substring(0, 4000),
    generated_at: u.ma_guide_generated_at,
  }));
}

/**
 * Search Google via Serper for industry intelligence.
 * Runs 3 targeted queries in parallel based on focus area.
 */
async function searchWeb(
  industry: string,
  focus: string,
): Promise<{
  ma_activity: Array<{ title: string; url: string; description: string }>;
  market_trends: Array<{ title: string; url: string; description: string }>;
  valuation_context: Array<{ title: string; url: string; description: string }>;
}> {
  const queries: string[] = [];

  // Always search M&A activity
  queries.push(`${industry} industry PE private equity acquisitions roll-up`);

  // Add focus-specific queries
  if (focus === 'market_overview' || focus === 'call_prep') {
    queries.push(`${industry} industry market size trends 2025 2026`);
  }
  if (focus === 'pe_landscape' || focus === 'call_prep') {
    queries.push(`${industry} company valuation multiples EBITDA M&A`);
  }
  if (focus === 'diligence_questions') {
    queries.push(`${industry} industry due diligence questions PE acquisition`);
  }

  // Ensure we always have 3 queries
  while (queries.length < 3) {
    queries.push(`${industry} industry overview business model key metrics`);
  }

  const [maActivity, marketTrends, valuationContext] = await Promise.allSettled([
    googleSearch(queries[0], 5),
    googleSearch(queries[1], 5),
    googleSearch(queries[2], 5),
  ]);

  return {
    ma_activity: maActivity.status === 'fulfilled' ? maActivity.value : [],
    market_trends: marketTrends.status === 'fulfilled' ? marketTrends.value : [],
    valuation_context: valuationContext.status === 'fulfilled' ? valuationContext.value : [],
  };
}

/**
 * Search internal transcripts (buyer_transcripts + deal_transcripts) for industry mentions.
 */
async function searchTranscripts(
  supabase: SupabaseClient,
  term: string,
): Promise<{ matches: TranscriptMatch[]; count: number }> {
  const [buyerResult, dealResult] = await Promise.allSettled([
    supabase
      .from('buyer_transcripts')
      .select('id, buyer_id, title, summary, call_date')
      .or(`title.ilike.%${term}%,summary.ilike.%${term}%`)
      .order('call_date', { ascending: false })
      .limit(5),
    supabase
      .from('deal_transcripts')
      .select('id, listing_id, title, call_date')
      .or(`title.ilike.%${term}%,transcript_text.ilike.%${term}%`)
      .order('call_date', { ascending: false })
      .limit(5),
  ]);

  const matches: TranscriptMatch[] = [];

  if (buyerResult.status === 'fulfilled' && buyerResult.value.data) {
    for (const t of buyerResult.value.data) {
      matches.push({
        source: 'buyer_transcript',
        id: t.id,
        buyer_id: t.buyer_id,
        title: t.title,
        summary_preview: (t.summary || '').substring(0, 300),
        call_date: t.call_date,
      });
    }
  }

  if (dealResult.status === 'fulfilled' && dealResult.value.data) {
    for (const t of dealResult.value.data) {
      matches.push({
        source: 'deal_transcript',
        id: t.id,
        listing_id: t.listing_id,
        title: t.title,
        call_date: t.call_date,
      });
    }
  }

  return { matches, count: matches.length };
}

/**
 * Search for buyers targeting this industry.
 */
async function searchBuyers(
  supabase: SupabaseClient,
  term: string,
): Promise<{ matches: Record<string, unknown>[]; count: number }> {
  const { data, error } = await supabase
    .from('buyers')
    .select(
      'id, company_name, pe_firm_name, buyer_type, hq_state, target_services, target_industries, thesis_summary, acquisition_appetite, alignment_score',
    )
    .eq('archived', false)
    .or(
      `target_services.ilike.%${term}%,target_industries.ilike.%${term}%,thesis_summary.ilike.%${term}%,company_name.ilike.%${term}%`,
    )
    .order('alignment_score', { ascending: false, nullsFirst: false })
    .limit(15);

  if (error || !data) return { matches: [], count: 0 };

  const matches = data.map((b: BuyerRow) => ({
    id: b.id,
    name: b.pe_firm_name || b.company_name,
    buyer_type: b.buyer_type,
    hq_state: b.hq_state,
    target_services: b.target_services,
    thesis_summary: b.thesis_summary ? b.thesis_summary.substring(0, 200) : null,
    acquisition_appetite: b.acquisition_appetite,
    alignment_score: b.alignment_score,
  }));

  return { matches, count: matches.length };
}

/**
 * Search for deals in this industry.
 */
async function searchDeals(
  supabase: SupabaseClient,
  term: string,
): Promise<{ matches: Record<string, unknown>[]; count: number }> {
  const { data, error } = await supabase
    .from('listings')
    .select(
      'id, title, industry, services, category, address_state, reported_revenue, reported_ebitda, status, deal_total_score',
    )
    .or(
      `industry.ilike.%${term}%,services.ilike.%${term}%,category.ilike.%${term}%,title.ilike.%${term}%`,
    )
    .order('deal_total_score', { ascending: false, nullsFirst: false })
    .limit(10);

  if (error || !data) return { matches: [], count: 0 };

  const matches = data.map((d: DealRow) => ({
    id: d.id,
    title: d.title,
    industry: d.industry,
    services: d.services,
    state: d.address_state,
    revenue: d.reported_revenue,
    ebitda: d.reported_ebitda,
    status: d.status,
    score: d.deal_total_score,
  }));

  return { matches, count: matches.length };
}
