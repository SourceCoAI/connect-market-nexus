/**
 * Pipeline Analytics Tools
 * Aggregated metrics and analytics across the deal pipeline.
 *
 * MERGED Feb 2026: get_analytics + get_cross_deal_analytics
 * → unified get_analytics with expanded analysis_type including cross-deal modes.
 */

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import type { ClaudeTool } from '../../_shared/claude-client.ts';
import type { ToolResult } from './index.ts';

// ---------- Tool definitions ----------

export const analyticsTools: ClaudeTool[] = [
  {
    name: 'get_enrichment_status',
    description:
      'Get enrichment job status and queue — check if buyer or deal enrichment jobs are running, pending, or failed. Shows progress, error counts, and records processed. Also checks the buyer enrichment queue.',
    input_schema: {
      type: 'object',
      properties: {
        job_type: {
          type: 'string',
          enum: ['deal_enrichment', 'buyer_enrichment', 'all'],
          description: 'Filter by job type (default "all")',
        },
        status: {
          type: 'string',
          description:
            'Filter by job status: pending, processing, completed, failed, paused, cancelled',
        },
        limit: { type: 'number', description: 'Max results (default 10)' },
      },
      required: [],
    },
  },
  {
    name: 'get_industry_trackers',
    description: `Get industry trackers — named industry verticals that group deals and buyers together with custom scoring weights.
DATA SOURCE: industry_trackers table.
USE WHEN: "which industries do we track", "HVAC tracker details", "tracker scoring weights".
SEARCHABLE FIELDS: search param checks name, description, service_criteria, geography_criteria, size_criteria.
Each tracker is linked to a buyer universe and shows deal count, buyer count, and scoring configuration.`,
    input_schema: {
      type: 'object',
      properties: {
        search: {
          type: 'string',
          description:
            'Search across name, description, service_criteria, geography_criteria, size_criteria',
        },
        universe_id: { type: 'string', description: 'Filter by associated buyer universe UUID' },
        active_only: {
          type: 'boolean',
          description: 'Only show active (non-archived) trackers (default true)',
        },
        limit: { type: 'number', description: 'Max results (default 50)' },
      },
      required: [],
    },
  },
  {
    name: 'get_analytics',
    description:
      'Get pipeline and cross-deal analytics. Supports pipeline-level metrics (pipeline_health, scoring_distribution, source_performance, activity_summary, buyer_engagement) and cross-deal strategic analysis (universe_comparison, deal_comparison, buyer_type_analysis, source_analysis, conversion_funnel, geography_heatmap). Use for dashboards, reports, pipeline health, and strategic insights.',
    input_schema: {
      type: 'object',
      properties: {
        analysis_type: {
          type: 'string',
          enum: [
            'pipeline_health',
            'scoring_distribution',
            'source_performance',
            'activity_summary',
            'buyer_engagement',
            'universe_comparison',
            'deal_comparison',
            'buyer_type_analysis',
            'source_analysis',
            'conversion_funnel',
            'geography_heatmap',
          ],
          description:
            'Which analysis to run. Pipeline metrics: pipeline_health, scoring_distribution, source_performance, activity_summary, buyer_engagement. Cross-deal: universe_comparison, deal_comparison, buyer_type_analysis, source_analysis, conversion_funnel, geography_heatmap. Default: pipeline_health.',
        },
        days: {
          type: 'number',
          description: 'Lookback period in days (default 30 for pipeline, 90 for cross-deal)',
        },
        universe_ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'Specific universe UUIDs to compare (universe_comparison only)',
        },
        deal_ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'Specific deal UUIDs to compare (deal_comparison only)',
        },
        limit: {
          type: 'number',
          description: 'Max results per group (default 10, cross-deal only)',
        },
      },
      required: [],
    },
  },
];

// ---------- Executor ----------

export async function executeAnalyticsTool(
  supabase: SupabaseClient,
  toolName: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  switch (toolName) {
    case 'get_enrichment_status':
      return getEnrichmentStatus(supabase, args);
    case 'get_industry_trackers':
      return getIndustryTrackers(supabase, args);
    case 'get_analytics':
      return getAnalyticsUnified(supabase, args);
    // Backward compatibility alias: get_cross_deal_analytics routes into the unified handler
    case 'get_cross_deal_analytics':
      return getAnalyticsUnified(supabase, args);
    default:
      return { error: `Unknown analytics tool: ${toolName}` };
  }
}

async function getIndustryTrackers(
  supabase: SupabaseClient,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const limit = Math.min(Number(args.limit) || 50, 200);

  let query = supabase
    .from('industry_trackers')
    .select(
      'id, name, description, universe_id, deal_count, buyer_count, color, is_active, archived, geography_weight, service_mix_weight, size_weight, owner_goals_weight, geography_mode, size_criteria, service_criteria, geography_criteria, created_at, updated_at',
    )
    .order('deal_count', { ascending: false })
    .limit(limit);

  if (args.active_only !== false) query = query.eq('archived', false);
  if (args.universe_id) query = query.eq('universe_id', args.universe_id as string);

  const { data, error } = await query;
  if (error) return { error: error.message };

  let results = data || [];
  const totalFromDb = results.length;

  if (args.search) {
    const term = (args.search as string).toLowerCase();
    results = results.filter(
      (t: { name?: string; description?: string; service_criteria?: string; geography_criteria?: string; size_criteria?: string }) =>
        t.name?.toLowerCase().includes(term) ||
        t.description?.toLowerCase().includes(term) ||
        t.service_criteria?.toLowerCase().includes(term) ||
        t.geography_criteria?.toLowerCase().includes(term) ||
        t.size_criteria?.toLowerCase().includes(term),
    );
  }

  const filtersApplied: Record<string, unknown> = {};
  if (args.search) filtersApplied.search = args.search;
  if (args.universe_id) filtersApplied.universe_id = args.universe_id;
  if (args.active_only !== false) filtersApplied.active_only = true;

  return {
    data: {
      trackers: results,
      total: results.length,
      total_before_filtering: totalFromDb,
      total_deals: results.reduce((s: number, t: { deal_count?: number }) => s + (t.deal_count || 0), 0),
      total_buyers: results.reduce((s: number, t: { buyer_count?: number }) => s + (t.buyer_count || 0), 0),
      filters_applied: filtersApplied,
      ...(results.length === 0
        ? {
            suggestion:
              totalFromDb > 0
                ? `${totalFromDb} industry trackers exist but none match "${args.search}". Try a broader keyword.`
                : 'No industry trackers found. They may not have been set up yet.',
          }
        : {}),
    },
  };
}

async function getEnrichmentStatus(
  supabase: SupabaseClient,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const limit = Math.min(Number(args.limit) || 10, 50);
  const jobType = (args.job_type as string) || 'all';

  let jobQuery = supabase
    .from('enrichment_jobs')
    .select(
      'id, job_type, status, total_records, records_processed, records_succeeded, records_failed, records_skipped, error_summary, error_count, circuit_breaker_tripped, started_at, completed_at, created_at, triggered_by, source',
    )
    .order('created_at', { ascending: false })
    .limit(limit);

  if (jobType !== 'all') jobQuery = jobQuery.eq('job_type', jobType);
  if (args.status) jobQuery = jobQuery.eq('status', args.status as string);

  const [jobsResult, queueResult] = await Promise.all([
    jobQuery,
    supabase
      .from('buyer_enrichment_queue')
      .select(
        'id, buyer_id, universe_id, status, attempts, queued_at, completed_at, last_error, created_at',
      )
      .order('queued_at', { ascending: false })
      .limit(50),
  ]);

  if (jobsResult.error) return { error: jobsResult.error.message };

  const jobs = jobsResult.data || [];
  const queue = queueResult.data || [];

  const queueByStatus: Record<string, number> = {};
  for (const q of queue) {
    queueByStatus[q.status] = (queueByStatus[q.status] || 0) + 1;
  }

  return {
    data: {
      jobs,
      total_jobs: jobs.length,
      buyer_enrichment_queue: {
        items: queue,
        total: queue.length,
        by_status: queueByStatus,
      },
    },
  };
}

// ---------- Implementations ----------

import { executeCrossDealAnalyticsTool } from './cross-deal-analytics-tools.ts';

const CROSS_DEAL_TYPES = new Set([
  'universe_comparison',
  'deal_comparison',
  'buyer_type_analysis',
  'source_analysis',
  'conversion_funnel',
  'geography_heatmap',
]);

async function getAnalyticsUnified(
  supabase: SupabaseClient,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  // Support both old `metric` param and new `analysis_type` param
  const analysisType =
    (args.analysis_type as string) || (args.metric as string) || 'pipeline_health';
  const days = Number(args.days) || 30;
  const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  // Route cross-deal analysis types to the cross-deal handler
  if (CROSS_DEAL_TYPES.has(analysisType)) {
    return executeCrossDealAnalyticsTool(supabase, 'get_cross_deal_analytics', {
      ...args,
      analysis_type: analysisType,
    });
  }

  // Pipeline-level metrics
  switch (analysisType) {
    case 'pipeline_health':
      return pipelineHealth(supabase);
    case 'scoring_distribution':
      return scoringDistribution(supabase);
    case 'source_performance':
      return sourcePerformance(supabase);
    case 'activity_summary':
      return activitySummary(supabase, cutoffDate);
    case 'buyer_engagement':
      return buyerEngagement(supabase, cutoffDate);
    default:
      return pipelineHealth(supabase);
  }
}

async function pipelineHealth(supabase: SupabaseClient): Promise<ToolResult> {
  const { data: deals, error } = await supabase
    .from('listings')
    .select(
      'id, status, revenue, ebitda, deal_total_score, is_priority_target, deal_source, remarketing_status, created_at',
    )
    .is('deleted_at', null);

  if (error) return { error: error.message };
  const d = deals || [];

  const byStatus: Record<string, number> = {};
  let totalRevenue = 0;
  let totalEbitda = 0;
  let scoredCount = 0;
  let scoreSum = 0;

  for (const deal of d) {
    byStatus[deal.status] = (byStatus[deal.status] || 0) + 1;
    totalRevenue += deal.revenue || 0;
    totalEbitda += deal.ebitda || 0;
    if (deal.deal_total_score) {
      scoredCount++;
      scoreSum += deal.deal_total_score;
    }
  }

  return {
    data: {
      metric: 'pipeline_health',
      total_deals: d.length,
      by_status: byStatus,
      priority_count: d.filter((x: { is_priority_target?: boolean }) => x.is_priority_target).length,
      total_revenue: totalRevenue,
      total_ebitda: totalEbitda,
      avg_deal_score: scoredCount > 0 ? Math.round(scoreSum / scoredCount) : null,
      by_source: d.reduce((acc: Record<string, number>, x: { deal_source?: string }) => {
        const src = x.deal_source || 'unknown';
        acc[src] = (acc[src] || 0) + 1;
        return acc;
      }, {}),
    },
  };
}

async function scoringDistribution(supabase: SupabaseClient): Promise<ToolResult> {
  // Paginate to fetch ALL scores for accurate distribution.
  // Previous limit of 500 silently truncated low scores, skewing the distribution
  // toward high scores and undercounting below_50 and 50-59 buckets.
  const PAGE_SIZE = 1000;
  let allScores: Array<{ composite_score: number; status: string; tier: string }> = [];
  let offset = 0;
  const MAX_TOTAL = 10000;

  while (offset < MAX_TOTAL) {
    const { data: batch, error } = await supabase
      .from('remarketing_scores')
      .select('composite_score, status, tier')
      .order('composite_score', { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) return { error: error.message };
    if (!batch || batch.length === 0) break;
    allScores = allScores.concat(batch);
    if (batch.length < PAGE_SIZE) break;
    offset += batch.length;
  }

  const scores = allScores;

  const byStatus: Record<string, number> = {};
  const byTier: Record<string, number> = {};
  const ranges = { '90-100': 0, '80-89': 0, '70-79': 0, '60-69': 0, '50-59': 0, below_50: 0 };

  for (const s of scores) {
    byStatus[s.status] = (byStatus[s.status] || 0) + 1;
    if (s.tier) byTier[s.tier] = (byTier[s.tier] || 0) + 1;

    const score = s.composite_score;
    if (score >= 90) ranges['90-100']++;
    else if (score >= 80) ranges['80-89']++;
    else if (score >= 70) ranges['70-79']++;
    else if (score >= 60) ranges['60-69']++;
    else if (score >= 50) ranges['50-59']++;
    else ranges['below_50']++;
  }

  return {
    data: {
      metric: 'scoring_distribution',
      total_scores: scores.length,
      by_status: byStatus,
      by_tier: byTier,
      score_ranges: ranges,
      avg_score:
        scores.length > 0
          ? Math.round(
              scores.reduce((s: number, x: { composite_score: number }) => s + x.composite_score, 0) / scores.length,
            )
          : null,
    },
  };
}

async function sourcePerformance(supabase: SupabaseClient): Promise<ToolResult> {
  const { data, error } = await supabase
    .from('listings')
    .select('deal_source, status, revenue, ebitda, deal_total_score, is_priority_target')
    .is('deleted_at', null);

  if (error) return { error: error.message };
  const deals = data || [];

  const sources: Record<
    string,
    { count: number; active: number; revenue: number; avg_score: number; priority: number }
  > = {};

  for (const d of deals) {
    const src = d.deal_source || 'unknown';
    if (!sources[src])
      sources[src] = { count: 0, active: 0, revenue: 0, avg_score: 0, priority: 0 };
    sources[src].count++;
    if (d.status === 'active') sources[src].active++;
    sources[src].revenue += d.revenue || 0;
    sources[src].avg_score += d.deal_total_score || 0;
    if (d.is_priority_target) sources[src].priority++;
  }

  for (const s of Object.values(sources)) {
    s.avg_score = s.count > 0 ? Math.round(s.avg_score / s.count) : 0;
  }

  return {
    data: { metric: 'source_performance', sources },
  };
}

async function activitySummary(supabase: SupabaseClient, cutoffDate: string): Promise<ToolResult> {
  const { data, error } = await supabase
    .from('deal_activities')
    .select('activity_type, deal_id, created_at')
    .gte('created_at', cutoffDate);

  if (error) return { error: error.message };
  const activities = data || [];

  const byType: Record<string, number> = {};
  const byDay: Record<string, number> = {};

  for (const a of activities) {
    byType[a.activity_type] = (byType[a.activity_type] || 0) + 1;
    const day = a.created_at?.substring(0, 10) || 'unknown';
    byDay[day] = (byDay[day] || 0) + 1;
  }

  return {
    data: {
      metric: 'activity_summary',
      total_activities: activities.length,
      unique_deals: new Set(activities.map((a: { deal_id: string }) => a.deal_id)).size,
      by_type: byType,
      by_day: byDay,
    },
  };
}

async function buyerEngagement(supabase: SupabaseClient, cutoffDate: string): Promise<ToolResult> {
  const [accessResult, scoresResult] = await Promise.all([
    supabase
      .from('deal_data_room_access')
      .select(
        'buyer_id, buyer_name, deal_id, granted_at, last_accessed_at, is_active, nda_signed_at',
      )
      .gte('granted_at', cutoffDate),
    supabase
      .from('remarketing_scores')
      .select('buyer_id, status, listing_id')
      .gte('updated_at', cutoffDate),
  ]);

  const access = accessResult.data || [];
  const scores = scoresResult.data || [];

  const statusChanges: Record<string, number> = {};
  for (const s of scores) {
    statusChanges[s.status] = (statusChanges[s.status] || 0) + 1;
  }

  return {
    data: {
      metric: 'buyer_engagement',
      data_room_grants: access.length,
      active_access: access.filter((a: { is_active?: boolean }) => a.is_active).length,
      nda_signed: access.filter((a: { nda_signed_at?: string | null }) => a.nda_signed_at).length,
      score_status_changes: statusChanges,
      unique_buyers_engaged: new Set(access.map((a: { buyer_id: string }) => a.buyer_id)).size,
    },
  };
}
