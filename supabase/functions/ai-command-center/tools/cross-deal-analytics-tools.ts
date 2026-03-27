/* eslint-disable @typescript-eslint/no-explicit-any -- Supabase client used with untyped tables */
/**
 * Cross-Deal Analytics Tools
 * Aggregate analytics across universes, deals, and buyers for strategic insights.
 */

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import type { ClaudeTool } from '../../_shared/claude-client.ts';
import type { ToolResult } from './index.ts';

// State name → code mapping for normalizing deal address_state (full names) to buyer hq_state (2-letter codes)
const STATE_NAME_TO_CODE: Record<string, string> = {
  alabama: 'AL',
  alaska: 'AK',
  arizona: 'AZ',
  arkansas: 'AR',
  california: 'CA',
  colorado: 'CO',
  connecticut: 'CT',
  delaware: 'DE',
  florida: 'FL',
  georgia: 'GA',
  hawaii: 'HI',
  idaho: 'ID',
  illinois: 'IL',
  indiana: 'IN',
  iowa: 'IA',
  kansas: 'KS',
  kentucky: 'KY',
  louisiana: 'LA',
  maine: 'ME',
  maryland: 'MD',
  massachusetts: 'MA',
  michigan: 'MI',
  minnesota: 'MN',
  mississippi: 'MS',
  missouri: 'MO',
  montana: 'MT',
  nebraska: 'NE',
  nevada: 'NV',
  'new hampshire': 'NH',
  'new jersey': 'NJ',
  'new mexico': 'NM',
  'new york': 'NY',
  'north carolina': 'NC',
  'north dakota': 'ND',
  ohio: 'OH',
  oklahoma: 'OK',
  oregon: 'OR',
  pennsylvania: 'PA',
  'rhode island': 'RI',
  'south carolina': 'SC',
  'south dakota': 'SD',
  tennessee: 'TN',
  texas: 'TX',
  utah: 'UT',
  vermont: 'VT',
  virginia: 'VA',
  washington: 'WA',
  'west virginia': 'WV',
  wisconsin: 'WI',
  wyoming: 'WY',
  'district of columbia': 'DC',
};

/** Normalize a state string to a 2-letter code. Handles full names, codes, and mixed case. */
function normalizeToStateCode(raw: string): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  const upper = trimmed.toUpperCase();
  // Already a 2-letter code?
  if (upper.length === 2 && /^[A-Z]{2}$/.test(upper)) return upper;
  // Full name?
  return STATE_NAME_TO_CODE[trimmed.toLowerCase()] || null;
}

// ---------- Tool definitions ----------

export const crossDealAnalyticsTools: ClaudeTool[] = [
  {
    name: 'get_cross_deal_analytics',
    description: `Get aggregate analytics across multiple deals and buyer universes. Answers questions like:
- "Which universe has the best conversion rate?"
- "Compare my HVAC deals" (use industry param)
- "Compare buyer engagement across my top 3 deals"
- "What's the average score by buyer type?"
- "Which deal source produces the highest quality leads?"
Supports multiple analysis modes: universe_comparison, deal_comparison, buyer_type_analysis, source_analysis, conversion_funnel, geography_heatmap. Use the industry param to filter deal_comparison and source_analysis to a specific vertical.`,
    input_schema: {
      type: 'object',
      properties: {
        analysis_type: {
          type: 'string',
          enum: [
            'universe_comparison',
            'deal_comparison',
            'buyer_type_analysis',
            'source_analysis',
            'conversion_funnel',
            'geography_heatmap',
          ],
          description: 'Type of cross-deal analysis to perform',
        },
        universe_ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'Specific universe UUIDs to compare (optional — compares all if omitted)',
        },
        deal_ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'Specific deal UUIDs to compare',
        },
        industry: {
          type: 'string',
          description:
            'Filter deals by industry keyword (e.g. "hvac", "plumbing"). Applies to deal_comparison and source_analysis. Checks title, industry, category, services fields.',
        },
        days: {
          type: 'number',
          description: 'Lookback period in days (default 90)',
        },
        limit: {
          type: 'number',
          description: 'Max results per group (default 10)',
        },
      },
      required: ['analysis_type'],
    },
  },
];

// ---------- Executor ----------

export async function executeCrossDealAnalyticsTool(
  supabase: SupabaseClient,
  toolName: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  switch (toolName) {
    case 'get_cross_deal_analytics':
      return getCrossDealAnalytics(supabase, args);
    default:
      return { error: `Unknown cross-deal analytics tool: ${toolName}` };
  }
}

// ---------- Implementation ----------

async function getCrossDealAnalytics(
  supabase: SupabaseClient,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const analysisType = args.analysis_type as string;

  switch (analysisType) {
    case 'universe_comparison':
      return universeComparison(supabase, args);
    case 'deal_comparison':
      return dealComparison(supabase, args);
    case 'buyer_type_analysis':
      return buyerTypeAnalysis(supabase, args);
    case 'source_analysis':
      return sourceAnalysis(supabase, args);
    case 'conversion_funnel':
      return conversionFunnel(supabase, args);
    case 'geography_heatmap':
      return geographyHeatmap(supabase, args);
    default:
      return { error: `Unknown analysis type: ${analysisType}` };
  }
}

async function universeComparison(
  supabase: SupabaseClient,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  // Fetch all universes with their stats
  let query = (supabase as any)
    .from('buyer_universes')
    .select('id, name, description, buyer_count, deal_count, created_at')
    .eq('archived', false)
    .order('buyer_count', { ascending: false })
    .limit(Number(args.limit) || 20);

  if (args.universe_ids) {
    query = query.in('id', args.universe_ids as string[]);
  }

  const { data: universes, error } = await query;
  if (error) return { error: error.message };
  if (!universes?.length) return { data: { universes: [], message: 'No universes found' } };

  // Fetch scoring stats per universe
  const universeIds = universes.map((u: { id: string }) => u.id);
  const [scoresResult, outreachResult, decisionsResult] = await Promise.all([
    (supabase as any)
      .from('remarketing_scores')
      .select('buyer_id, listing_id, composite_score, status, tier, universe_id')
      .in('universe_id', universeIds),
    (supabase as any)
      .from('outreach_records')
      .select('id, deal_id, stage, universe_id')
      .in('universe_id', universeIds),
    (supabase as any)
      .from('buyer_approve_decisions')
      .select('id, buyer_id, listing_id, created_at')
      .limit(2000),
  ]);

  const scores = scoresResult.data || [];
  const outreach = outreachResult.data || [];
  const _approvals = decisionsResult.data || [];

  // Aggregate per universe
  const universeStats = universes.map(
    (u: { id: string; name: string; buyer_count: number; deal_count: number }) => {
      const uScores = scores.filter((s: { universe_id?: string }) => {
        return s.universe_id === u.id;
      });
      const uOutreach = outreach.filter((o: { universe_id?: string }) => o.universe_id === u.id);

      const compositeScores = uScores
        .map((s: { composite_score?: number }) => s.composite_score)
        .filter(Boolean) as number[];
      const avgScore =
        compositeScores.length > 0
          ? Math.round(compositeScores.reduce((a, b) => a + b, 0) / compositeScores.length)
          : null;

      const statusBreakdown: Record<string, number> = {};
      for (const s of uScores) {
        statusBreakdown[s.status || 'unknown'] = (statusBreakdown[s.status || 'unknown'] || 0) + 1;
      }

      const outreachByStage: Record<string, number> = {};
      for (const o of uOutreach) {
        outreachByStage[o.stage || 'unknown'] = (outreachByStage[o.stage || 'unknown'] || 0) + 1;
      }

      const approved = statusBreakdown['approved'] || 0;
      const total = uScores.length || 1;
      const conversionRate = Math.round((approved / total) * 100);

      return {
        universe_id: u.id,
        universe_name: u.name,
        buyer_count: u.buyer_count,
        deal_count: u.deal_count,
        scored_buyers: uScores.length,
        avg_composite_score: avgScore,
        conversion_rate_pct: conversionRate,
        status_breakdown: statusBreakdown,
        outreach_by_stage: outreachByStage,
        total_outreach: uOutreach.length,
      };
    },
  );

  // Sort by conversion rate
  universeStats.sort((a: { conversion_rate_pct: number }, b: { conversion_rate_pct: number }) => b.conversion_rate_pct - a.conversion_rate_pct);

  return {
    data: {
      analysis_type: 'universe_comparison',
      universes: universeStats,
      total_universes: universeStats.length,
      best_conversion: universeStats[0]?.universe_name || 'N/A',
      source_tables: ['buyer_universes', 'remarketing_scores', 'outreach_records'],
    },
  };
}

async function dealComparison(
  supabase: SupabaseClient,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  let query = (supabase as any)
    .from('listings')
    .select(
      'id, title, industry, category, services, revenue, ebitda, status, deal_total_score, deal_source, address_state, remarketing_status, created_at',
    )
    .is('deleted_at', null)
    .order('deal_total_score', { ascending: false, nullsFirst: false })
    .limit(Number(args.limit) || 50);

  if (args.deal_ids) {
    query = query.in('id', args.deal_ids as string[]);
  }

  const { data: rawDeals, error } = await query;
  if (error) return { error: error.message };

  // Client-side industry filter
  let deals = rawDeals || [];
  if (args.industry) {
    const term = (args.industry as string).toLowerCase();
    deals = deals.filter(
      (d: { title?: string; industry?: string; category?: string; services?: string[] }) =>
        d.title?.toLowerCase().includes(term) ||
        d.industry?.toLowerCase().includes(term) ||
        d.category?.toLowerCase().includes(term) ||
        (d.services || []).some((s: string) => s.toLowerCase().includes(term)),
    );
  }

  // Apply final limit after filtering
  deals = deals.slice(0, Number(args.limit) || 10);

  if (!deals.length)
    return {
      data: {
        analysis_type: 'deal_comparison',
        deals: [],
        total_deals: 0,
        total_before_filtering: (rawDeals || []).length,
        filters_applied: {
          ...(args.industry ? { industry: args.industry } : {}),
          ...(args.deal_ids ? { deal_ids: args.deal_ids } : {}),
        },
        suggestion: args.industry
          ? `${(rawDeals || []).length} deals exist but none match industry "${args.industry}". Try a broader keyword or remove the industry filter.`
          : 'No deals found. Check that deals exist in the pipeline with query_deals.',
        source_tables: ['listings'],
      },
    };

  // Fetch score counts per deal
  const dealIds = deals.map((d: { id: string }) => d.id);
  const [scoresResult, outreachResult, tasksResult] = await Promise.all([
    (supabase as any)
      .from('remarketing_scores')
      .select('listing_id, composite_score, status')
      .in('listing_id', dealIds),
    (supabase as any).from('outreach_records').select('deal_id, stage').in('deal_id', dealIds),
    (supabase as any)
      .from('daily_standup_tasks')
      .select('entity_id, status')
      .eq('entity_type', 'deal')
      .in('entity_id', dealIds),
  ]);

  const scores = scoresResult.data || [];
  const outreach = outreachResult.data || [];
  const tasks = tasksResult.data || [];

  const dealStats = deals.map(
    (d: {
      id: string;
      title: string;
      revenue: number;
      ebitda: number;
      deal_total_score: number;
      status: string;
      address_state: string;
    }) => {
      const dScores = scores.filter((s: { listing_id: string }) => s.listing_id === d.id);
      const dOutreach = outreach.filter((o: { deal_id: string }) => o.deal_id === d.id);
      const dTasks = tasks.filter((t: { entity_id: string }) => t.entity_id === d.id);

      const composites = dScores
        .map((s: { composite_score?: number }) => s.composite_score)
        .filter(Boolean) as number[];
      const avgScore =
        composites.length > 0
          ? Math.round(composites.reduce((a: number, b: number) => a + b, 0) / composites.length)
          : null;

      const approved = dScores.filter((s: { status?: string }) => s.status === 'approved').length;
      const passed = dScores.filter((s: { status?: string }) => s.status === 'passed').length;

      return {
        deal_id: d.id,
        deal_name: d.title,
        revenue: d.revenue,
        ebitda: d.ebitda,
        deal_score: d.deal_total_score,
        status: d.status,
        state: d.address_state,
        total_buyers_scored: dScores.length,
        avg_buyer_score: avgScore,
        approved_buyers: approved,
        passed_buyers: passed,
        approval_rate_pct: dScores.length > 0 ? Math.round((approved / dScores.length) * 100) : 0,
        active_outreach: dOutreach.length,
        open_tasks: dTasks.filter(
          (t: { status?: string }) => t.status === 'pending' || t.status === 'in_progress',
        ).length,
      };
    },
  );

  return {
    data: {
      analysis_type: 'deal_comparison',
      deals: dealStats,
      total_deals: dealStats.length,
      total_before_filtering: (rawDeals || []).length,
      filters_applied: {
        ...(args.industry ? { industry: args.industry } : {}),
        ...(args.deal_ids ? { deal_ids: args.deal_ids } : {}),
      },
      source_tables: ['listings', 'remarketing_scores', 'outreach_records', 'daily_standup_tasks'],
    },
  };
}

async function buyerTypeAnalysis(
  supabase: SupabaseClient,
  _args: Record<string, unknown>,
): Promise<ToolResult> {
  const { data: buyers, error } = await (supabase as any)
    .from('buyers')
    .select(
      'id, buyer_type, alignment_score, has_fee_agreement, total_acquisitions, acquisition_appetite',
    )
    .eq('archived', false);

  if (error) return { error: error.message };

  const byType: Record<
    string,
    { count: number; avgScore: number; feeAgreements: number; totalAcqs: number; scores: number[] }
  > = {};

  for (const b of buyers || []) {
    const type = b.buyer_type || 'unknown';
    if (!byType[type])
      byType[type] = { count: 0, avgScore: 0, feeAgreements: 0, totalAcqs: 0, scores: [] };
    byType[type].count++;
    if (b.alignment_score) byType[type].scores.push(b.alignment_score);
    if (b.has_fee_agreement) byType[type].feeAgreements++;
    byType[type].totalAcqs += b.total_acquisitions || 0;
  }

  const analysis = Object.entries(byType).map(([type, stats]) => ({
    buyer_type: type,
    count: stats.count,
    avg_alignment_score:
      stats.scores.length > 0
        ? Math.round(stats.scores.reduce((a, b) => a + b, 0) / stats.scores.length)
        : null,
    fee_agreement_pct: Math.round((stats.feeAgreements / stats.count) * 100),
    avg_acquisitions: stats.count > 0 ? Math.round(stats.totalAcqs / stats.count) : 0,
  }));

  analysis.sort((a, b) => (b.avg_alignment_score || 0) - (a.avg_alignment_score || 0));

  return {
    data: {
      analysis_type: 'buyer_type_analysis',
      types: analysis,
      total_buyers: (buyers || []).length,
      source_tables: ['buyers'],
    },
  };
}

async function sourceAnalysis(
  supabase: SupabaseClient,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const days = Number(args.days) || 90;
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const { data: rawDeals, error } = await (supabase as any)
    .from('listings')
    .select(
      'id, title, industry, category, services, deal_source, status, revenue, ebitda, deal_total_score, is_priority_target, created_at',
    )
    .is('deleted_at', null)
    .gte('created_at', cutoff);

  if (error) return { error: error.message };

  // Client-side industry filter
  let filteredDeals = rawDeals || [];
  if (args.industry) {
    const term = (args.industry as string).toLowerCase();
    filteredDeals = filteredDeals.filter(
      (d: { title?: string; industry?: string; category?: string; services?: string[] }) =>
        d.title?.toLowerCase().includes(term) ||
        d.industry?.toLowerCase().includes(term) ||
        d.category?.toLowerCase().includes(term) ||
        (d.services || []).some((s: string) => s.toLowerCase().includes(term)),
    );
  }

  const bySrc: Record<
    string,
    { count: number; active: number; priority: number; revenue: number; scores: number[] }
  > = {};

  for (const d of filteredDeals) {
    const src = d.deal_source || 'unknown';
    if (!bySrc[src]) bySrc[src] = { count: 0, active: 0, priority: 0, revenue: 0, scores: [] };
    bySrc[src].count++;
    if (d.status === 'active') bySrc[src].active++;
    if (d.is_priority_target) bySrc[src].priority++;
    bySrc[src].revenue += d.revenue || 0;
    if (d.deal_total_score) bySrc[src].scores.push(d.deal_total_score);
  }

  const analysis = Object.entries(bySrc).map(([source, stats]) => ({
    source,
    total_deals: stats.count,
    active_deals: stats.active,
    priority_deals: stats.priority,
    total_revenue: stats.revenue,
    avg_deal_score:
      stats.scores.length > 0
        ? Math.round(stats.scores.reduce((a, b) => a + b, 0) / stats.scores.length)
        : null,
    quality_ratio: stats.count > 0 ? Math.round((stats.priority / stats.count) * 100) : 0,
  }));

  analysis.sort((a, b) => (b.avg_deal_score || 0) - (a.avg_deal_score || 0));

  return {
    data: {
      analysis_type: 'source_analysis',
      period_days: days,
      sources: analysis,
      total_deals: filteredDeals.length,
      total_before_filtering: (rawDeals || []).length,
      filters_applied: {
        period_days: days,
        ...(args.industry ? { industry: args.industry } : {}),
      },
      ...(filteredDeals.length === 0
        ? {
            suggestion: args.industry
              ? `${(rawDeals || []).length} deals found in the last ${days} days but none match industry "${args.industry}". Try a broader keyword or longer lookback period.`
              : `No deals found in the last ${days} days. Try increasing the days parameter.`,
          }
        : {}),
      source_tables: ['listings'],
    },
  };
}

async function conversionFunnel(
  supabase: SupabaseClient,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const days = Number(args.days) || 90;
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const [scoresResult, outreachResult, approvalsResult, passResult] = await Promise.all([
    (supabase as any)
      .from('remarketing_scores')
      .select('id, status, composite_score')
      .gte('updated_at', cutoff),
    (supabase as any).from('outreach_records').select('id, stage').gte('created_at', cutoff),
    (supabase as any).from('buyer_approve_decisions').select('id').gte('created_at', cutoff),
    (supabase as any)
      .from('buyer_pass_decisions')
      .select('id, pass_category')
      .gte('created_at', cutoff),
  ]);

  const scores = scoresResult.data || [];
  const outreach = outreachResult.data || [];
  const approvals = approvalsResult.data || [];
  const passes = passResult.data || [];

  const outreachByStage: Record<string, number> = {};
  for (const o of outreach) {
    outreachByStage[o.stage || 'unknown'] = (outreachByStage[o.stage || 'unknown'] || 0) + 1;
  }

  const passByCategory: Record<string, number> = {};
  for (const p of passes) {
    passByCategory[p.pass_category || 'uncategorized'] =
      (passByCategory[p.pass_category || 'uncategorized'] || 0) + 1;
  }

  return {
    data: {
      analysis_type: 'conversion_funnel',
      period_days: days,
      funnel: {
        total_scored: scores.length,
        approved: approvals.length,
        passed: passes.length,
        outreach_started: outreach.length,
        nda_sent: outreachByStage['nda_sent'] || 0,
        nda_signed: outreachByStage['nda_signed'] || 0,
        cim_sent: outreachByStage['cim_sent'] || 0,
        meeting_scheduled: outreachByStage['meeting_scheduled'] || 0,
      },
      conversion_rates: {
        scored_to_approved:
          scores.length > 0 ? Math.round((approvals.length / scores.length) * 100) : 0,
        approved_to_outreach:
          approvals.length > 0 ? Math.round((outreach.length / approvals.length) * 100) : 0,
        outreach_to_meeting:
          outreach.length > 0
            ? Math.round(((outreachByStage['meeting_scheduled'] || 0) / outreach.length) * 100)
            : 0,
      },
      pass_reasons: passByCategory,
      source_tables: [
        'remarketing_scores',
        'outreach_records',
        'buyer_approve_decisions',
        'buyer_pass_decisions',
      ],
    },
  };
}

async function geographyHeatmap(
  supabase: SupabaseClient,
  _args: Record<string, unknown>,
): Promise<ToolResult> {
  const [buyersResult, dealsResult] = await Promise.all([
    (supabase as any).from('buyers').select('hq_state, geographic_footprint').eq('archived', false),
    (supabase as any)
      .from('listings')
      .select('address_state, geographic_states')
      .is('deleted_at', null),
  ]);

  const buyers = buyersResult.data || [];
  const deals = dealsResult.data || [];

  const buyersByState: Record<string, number> = {};
  for (const b of buyers) {
    if (b.hq_state) buyersByState[b.hq_state] = (buyersByState[b.hq_state] || 0) + 1;
    for (const s of b.geographic_footprint || []) {
      buyersByState[s] = (buyersByState[s] || 0) + 1;
    }
  }

  // Normalize deal address_state (may be full names like "Texas") to 2-letter codes
  // to match buyer hq_state format. Also include geographic_states for multi-location deals.
  const dealsByState: Record<string, number> = {};
  for (const d of deals) {
    if (d.address_state) {
      const code = normalizeToStateCode(d.address_state) || d.address_state;
      dealsByState[code] = (dealsByState[code] || 0) + 1;
    }
    // Include geographic_states for multi-location deals (was previously ignored)
    for (const s of (d.geographic_states as string[]) || []) {
      const code = normalizeToStateCode(s) || s;
      dealsByState[code] = (dealsByState[code] || 0) + 1;
    }
  }

  // Find coverage gaps (states with deals but few buyers)
  const gaps: Array<{ state: string; deals: number; buyers: number }> = [];
  for (const [state, dealCount] of Object.entries(dealsByState)) {
    const buyerCount = buyersByState[state] || 0;
    if (buyerCount < dealCount * 3) {
      gaps.push({ state, deals: dealCount, buyers: buyerCount });
    }
  }
  gaps.sort((a, b) => a.buyers - b.buyers);

  return {
    data: {
      analysis_type: 'geography_heatmap',
      buyers_by_state: buyersByState,
      deals_by_state: dealsByState,
      coverage_gaps: gaps.slice(0, 10),
      total_buyer_states: Object.keys(buyersByState).length,
      total_deal_states: Object.keys(dealsByState).length,
      source_tables: ['buyers', 'listings'],
    },
  };
}
