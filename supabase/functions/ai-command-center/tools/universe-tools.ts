/* eslint-disable @typescript-eslint/no-explicit-any -- Supabase client used with untyped tables */
/**
 * Buyer Universe & Outreach Tools
 * Query buyer universes, outreach records, and deal-universe mappings.
 *
 * MERGED Feb 2026: get_outreach_records + get_remarketing_outreach
 * → unified get_outreach_records with a `source` parameter.
 */

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import type { ClaudeTool } from '../../_shared/claude-client.ts';
import type { ToolResult } from './index.ts';

// ---------- Tool definitions ----------

export const universeTools: ClaudeTool[] = [
  {
    name: 'search_buyer_universes',
    description: `Search and list buyer universes — the curated buyer lists built for specific industry verticals.
DATA SOURCE: buyer_universes table.
USE WHEN: "find the HVAC universe", "which universes exist", "universes for plumbing buyers".
SEARCHABLE FIELDS: search param checks name, description, fit_criteria, service_criteria, geography_criteria, size_criteria, buyer_types_criteria.
Each universe defines fit criteria, scoring weights, and which deals it applies to.
Returns has_ma_guide flag indicating if a detailed M&A industry research guide has been generated for this universe — use get_universe_details to read the full guide content.`,
    input_schema: {
      type: 'object',
      properties: {
        search: {
          type: 'string',
          description:
            'Free-text search across name, description, fit_criteria, service_criteria, geography_criteria, size_criteria, buyer_types_criteria',
        },
        archived: { type: 'boolean', description: 'Include archived universes (default false)' },
        limit: { type: 'number', description: 'Max results (default 50)' },
      },
      required: [],
    },
  },
  {
    name: 'get_universe_details',
    description:
      'Get full details for a specific buyer universe — criteria, scoring weights, associated deals, buyer count, and M&A industry guide (if generated). The ma_guide_content field contains a detailed, multi-section industry research document covering PE diligence frameworks, KPIs, competitive dynamics, and deal structure guidance.',
    input_schema: {
      type: 'object',
      properties: {
        universe_id: { type: 'string', description: 'The buyer universe UUID' },
      },
      required: ['universe_id'],
    },
  },
  {
    name: 'get_outreach_records',
    description:
      'Get outreach tracking records — who was contacted for a deal/buyer, NDA status, meeting history, outcomes, and next actions. Queries both outreach_records (detailed tracking with NDA/memo/meeting dates) and remarketing_outreach (campaign status tracking) tables. Use `source` to target a specific table, or omit to search both.',
    input_schema: {
      type: 'object',
      properties: {
        source: {
          type: 'string',
          enum: ['outreach_records', 'remarketing_outreach', 'all'],
          description:
            'Which outreach table to query: "outreach_records" for detailed NDA/meeting tracking, "remarketing_outreach" for campaign status tracking, "all" for both (default "all")',
        },
        deal_id: { type: 'string', description: 'Filter by deal/listing UUID' },
        buyer_id: { type: 'string', description: 'Filter by buyer UUID' },
        universe_id: {
          type: 'string',
          description: 'Filter by universe UUID (outreach_records only)',
        },
        outcome: {
          type: 'string',
          description:
            'Filter outreach_records by outcome: in_progress, won, lost, withdrawn, no_response',
        },
        status: {
          type: 'string',
          description:
            'Filter remarketing_outreach by status: pending, contacted, responded, meeting_scheduled, nda_sent, passed',
        },
        has_nda: {
          type: 'boolean',
          description: 'Filter to records where NDA was sent (outreach_records only)',
        },
        has_meeting: {
          type: 'boolean',
          description: 'Filter to records where meeting was scheduled (outreach_records only)',
        },
        next_action_overdue: {
          type: 'boolean',
          description:
            'Filter to records where next_action_date is past due (outreach_records only)',
        },
        limit: {
          type: 'number',
          description: 'Max results (default 50, use 1000 for full pipeline counts)',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_universe_buyer_fits',
    description:
      'Get buyers in a universe categorized by fit status — identifies which buyers are fits, not fits (passed/disqualified), or unscored. Returns buyer IDs grouped by category, ready for UI selection. Use when user asks to "select not fits", "check the non-fits", "select passed buyers", etc. The buyer IDs returned can be passed directly to select_table_rows to check their boxes in the UI.',
    input_schema: {
      type: 'object',
      properties: {
        universe_id: { type: 'string', description: 'The buyer universe UUID' },
        fit_filter: {
          type: 'string',
          enum: ['not_fit', 'fit', 'unscored', 'all'],
          description:
            'Which category to return: "not_fit" = passed/disqualified buyers, "fit" = active/approved buyers, "unscored" = buyers with no scores, "all" = all buyers with their categories. Default: "all"',
        },
        score_threshold: {
          type: 'number',
          description:
            'Optional: treat buyers with composite_score below this threshold as not-fits (e.g. 40). Only applies when fit_filter is "not_fit".',
        },
      },
      required: ['universe_id'],
    },
  },
];

// ---------- Executor ----------

export async function executeUniverseTool(
  supabase: SupabaseClient,
  toolName: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  switch (toolName) {
    case 'search_buyer_universes':
      return searchBuyerUniverses(supabase, args);
    case 'get_universe_details':
      return getUniverseDetails(supabase, args);
    case 'get_universe_buyer_fits':
      return getUniverseBuyerFits(supabase, args);
    case 'get_outreach_records':
      return getOutreachRecordsUnified(supabase, args);
    // Backward compatibility alias
    case 'get_remarketing_outreach':
      return getOutreachRecordsUnified(supabase, { ...args, source: 'remarketing_outreach' });
    default:
      return { error: `Unknown universe tool: ${toolName}` };
  }
}

// ---------- Implementations ----------

async function searchBuyerUniverses(
  supabase: SupabaseClient,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const limit = Math.min(Number(args.limit) || 50, 200);

  let query = (supabase as any)
    .from('buyer_universes')
    .select(
      'id, name, description, fit_criteria, size_criteria, geography_criteria, service_criteria, buyer_types_criteria, geography_weight, size_weight, service_weight, owner_goals_weight, archived, created_at, updated_at, ma_guide_content, ma_guide_generated_at',
    )
    .order('updated_at', { ascending: false })
    .limit(limit);

  if (args.archived !== true) query = query.eq('archived', false);

  const { data, error } = await query;
  if (error) return { error: error.message };

  // Add has_ma_guide flag and strip full guide content to save tokens
  let results = (data || []).map((u: Record<string, unknown>) => {
    const { ma_guide_content, ...rest } = u;
    return { ...rest, has_ma_guide: !!ma_guide_content };
  });
  const totalFromDb = results.length;

  if (args.search) {
    const term = (args.search as string).toLowerCase();
    results = results.filter(
      (u: any) =>
        (u.name as string)?.toLowerCase().includes(term) ||
        (u.description as string)?.toLowerCase().includes(term) ||
        (u.fit_criteria as string)?.toLowerCase().includes(term) ||
        (u.service_criteria as string)?.toLowerCase().includes(term) ||
        (u.geography_criteria as string)?.toLowerCase().includes(term) ||
        (u.size_criteria as string)?.toLowerCase().includes(term) ||
        (u.buyer_types_criteria as string)?.toLowerCase().includes(term),
    );
  }

  const filtersApplied: Record<string, unknown> = {};
  if (args.search) filtersApplied.search = args.search;
  if (args.archived) filtersApplied.archived = args.archived;

  return {
    data: {
      universes: results,
      total: results.length,
      total_before_filtering: totalFromDb,
      filters_applied: filtersApplied,
      ...(results.length === 0
        ? {
            suggestion:
              totalFromDb > 0
                ? `${totalFromDb} universes exist but none match "${args.search}". Try a broader search term (e.g. "hvac" instead of "residential hvac") or omit the search to list all universes.`
                : 'No buyer universes found. They may not have been created yet.',
          }
        : {}),
    },
  };
}

async function getUniverseDetails(
  supabase: SupabaseClient,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const universeId = args.universe_id as string;

  const [universeResult, dealsResult, buyerCountResult] = await Promise.all([
    (supabase as any).from('buyer_universes').select('*').eq('id', universeId).single(),
    (supabase as any)
      .from('remarketing_universe_deals')
      .select('id, listing_id, status, added_at, notes')
      .eq('universe_id', universeId)
      .eq('status', 'active'),
    (supabase as any)
      .from('buyers')
      .select('id', { count: 'exact', head: true })
      .eq('universe_id', universeId)
      .eq('archived', false),
  ]);

  if (universeResult.error) return { error: universeResult.error.message };

  // Truncate ma_guide_content to save tokens (full guides can be 20K+)
  const universe = { ...universeResult.data };
  if (universe.ma_guide_content && universe.ma_guide_content.length > 6000) {
    universe.ma_guide_content =
      universe.ma_guide_content.substring(0, 6000) +
      '\n\n[... guide truncated — full guide is ' +
      universeResult.data.ma_guide_content.length +
      ' chars]';
  }

  return {
    data: {
      universe,
      associated_deals: dealsResult.data || [],
      buyer_count: buyerCountResult.count || 0,
    },
  };
}

async function getUniverseBuyerFits(
  supabase: SupabaseClient,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const universeId = args.universe_id as string;
  const fitFilter = (args.fit_filter as string) || 'all';
  const scoreThreshold = args.score_threshold as number | undefined;

  // 1. Fetch all buyers in this universe
  const { data: buyers, error: buyersError } = await (supabase as any)
    .from('buyers')
    .select('id, company_name, alignment_score, has_fee_agreement')
    .eq('universe_id', universeId)
    .eq('archived', false)
    .order('company_name');

  if (buyersError) return { error: buyersError.message };
  if (!buyers || buyers.length === 0) {
    return { data: { message: 'No buyers found in this universe', total: 0 } };
  }

  const buyerIds = buyers.map((b: { id: string }) => b.id);

  // 2. Fetch all scores for these buyers (across all deals in the universe)
  // Batch in chunks of 100 to avoid query limits
  const allScores: unknown[] = [];
  for (let i = 0; i < buyerIds.length; i += 100) {
    const chunk = buyerIds.slice(i, i + 100);
    const { data: scores } = await (supabase as any)
      .from('remarketing_scores')
      .select(
        'buyer_id, listing_id, composite_score, status, is_disqualified, pass_reason, disqualification_reason',
      )
      .in('buyer_id', chunk);
    if (scores) allScores.push(...scores);
  }

  // 3. Build a map of buyer_id -> worst score status (if ANY deal marks them as not-fit, they're not-fit)
  const buyerScoreMap = new Map<
    string,
    { status: string; is_disqualified: boolean; min_score: number | null; reasons: string[] }
  >();
  for (const _score of allScores) {
    const score = _score as Record<string, any>;
    const existing = buyerScoreMap.get(score.buyer_id);
    const isNotFit =
      score.is_disqualified || score.status === 'passed' || score.status === 'disqualified';
    const reason = score.disqualification_reason || score.pass_reason || '';

    if (!existing) {
      buyerScoreMap.set(score.buyer_id, {
        status: isNotFit ? 'not_fit' : score.status || 'scored',
        is_disqualified: !!score.is_disqualified,
        min_score: score.composite_score,
        reasons: reason ? [reason] : [],
      });
    } else {
      // If ANY score marks them as not-fit, mark overall as not-fit
      if (isNotFit) {
        existing.status = 'not_fit';
        existing.is_disqualified = existing.is_disqualified || !!score.is_disqualified;
      }
      if (score.composite_score !== null) {
        existing.min_score =
          existing.min_score === null
            ? score.composite_score
            : Math.min(existing.min_score, score.composite_score);
      }
      if (reason) existing.reasons.push(reason);
    }
  }

  // 4. Categorize buyers
  const notFitBuyers: Array<{ id: string; company_name: string; reason: string }> = [];
  const fitBuyers: Array<{ id: string; company_name: string; score: number | null }> = [];
  const unscoredBuyers: Array<{ id: string; company_name: string }> = [];

  for (const buyer of buyers) {
    const scoreInfo = buyerScoreMap.get(buyer.id);

    if (!scoreInfo) {
      // No scores at all — unscored
      unscoredBuyers.push({ id: buyer.id, company_name: buyer.company_name });
    } else if (scoreInfo.status === 'not_fit') {
      // Passed or disqualified
      notFitBuyers.push({
        id: buyer.id,
        company_name: buyer.company_name,
        reason: scoreInfo.reasons[0] || (scoreInfo.is_disqualified ? 'disqualified' : 'passed'),
      });
    } else if (
      scoreThreshold &&
      scoreInfo.min_score !== null &&
      scoreInfo.min_score < scoreThreshold
    ) {
      // Below score threshold — also not a fit
      notFitBuyers.push({
        id: buyer.id,
        company_name: buyer.company_name,
        reason: `score below ${scoreThreshold} (${scoreInfo.min_score})`,
      });
    } else {
      fitBuyers.push({
        id: buyer.id,
        company_name: buyer.company_name,
        score: scoreInfo.min_score,
      });
    }
  }

  // 5. Return based on filter
  const result: Record<string, unknown> = {
    universe_id: universeId,
    total_buyers: buyers.length,
    summary: {
      not_fit: notFitBuyers.length,
      fit: fitBuyers.length,
      unscored: unscoredBuyers.length,
    },
  };

  if (fitFilter === 'not_fit' || fitFilter === 'all') {
    result.not_fit_buyers = notFitBuyers;
    result.not_fit_ids = notFitBuyers.map((b) => b.id);
  }
  if (fitFilter === 'fit' || fitFilter === 'all') {
    result.fit_buyers = fitBuyers;
    result.fit_ids = fitBuyers.map((b) => b.id);
  }
  if (fitFilter === 'unscored' || fitFilter === 'all') {
    result.unscored_buyers = unscoredBuyers;
    result.unscored_ids = unscoredBuyers.map((b) => b.id);
  }

  // Provide a helpful message for the AI to know what to do next
  result.hint =
    'Use select_table_rows with table="buyers" and the returned IDs to select these buyers in the UI.';

  return { data: result };
}

async function getOutreachRecordsUnified(
  supabase: SupabaseClient,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const source = (args.source as string) || 'all';
  const limit = Math.min(Number(args.limit) || 50, 2000);
  const results: Record<string, unknown> = { source_filter: source };
  const errors: string[] = [];

  // Query outreach_records table
  if (source === 'all' || source === 'outreach_records') {
    const now = new Date().toISOString();
    let query = (supabase as any)
      .from('outreach_records')
      .select(
        'id, listing_id, buyer_id, universe_id, contacted_at, nda_sent_at, nda_signed_at, cim_sent_at, meeting_scheduled_at, outcome, outcome_notes, outcome_at, last_contact_date, next_action, next_action_date, priority, notes, created_at, updated_at',
      )
      .order('updated_at', { ascending: false })
      .limit(limit);

    if (args.deal_id) query = query.eq('listing_id', args.deal_id as string);
    if (args.buyer_id) query = query.eq('buyer_id', args.buyer_id as string);
    if (args.universe_id) query = query.eq('universe_id', args.universe_id as string);
    if (args.outcome) query = query.eq('outcome', args.outcome as string);
    if (args.has_nda === true) query = query.not('nda_sent_at', 'is', null);
    if (args.has_meeting === true) query = query.not('meeting_scheduled_at', 'is', null);
    if (args.next_action_overdue === true)
      query = query.lt('next_action_date', now).not('next_action_date', 'is', null);

    const { data, error } = await query;
    if (error) {
      errors.push(`outreach_records: ${error.message}`);
    } else {
      const records = data || [];
      const byOutcome: Record<string, number> = {};
      let nda_sent = 0,
        nda_signed = 0,
        meetings = 0,
        overdue = 0;
      for (const r of records) {
        const oc = r.outcome || 'in_progress';
        byOutcome[oc] = (byOutcome[oc] || 0) + 1;
        if (r.nda_sent_at) nda_sent++;
        if (r.nda_signed_at) nda_signed++;
        if (r.meeting_scheduled_at) meetings++;
        if (
          r.next_action_date &&
          new Date(r.next_action_date) < new Date() &&
          r.outcome === 'in_progress'
        )
          overdue++;
      }
      results.outreach_records = {
        records,
        total: records.length,
        summary: {
          by_outcome: byOutcome,
          nda_sent,
          nda_signed,
          meetings_scheduled: meetings,
          overdue_actions: overdue,
        },
      };
    }
  }

  // Query remarketing_outreach table
  if (source === 'all' || source === 'remarketing_outreach') {
    let query = (supabase as any)
      .from('remarketing_outreach')
      .select(
        'id, listing_id, buyer_id, status, contact_method, contacted_at, response_at, meeting_at, notes, created_at, updated_at',
      )
      .order('updated_at', { ascending: false })
      .limit(limit);

    if (args.deal_id) query = query.eq('listing_id', args.deal_id as string);
    if (args.buyer_id) query = query.eq('buyer_id', args.buyer_id as string);
    if (args.status) query = query.eq('status', args.status as string);

    const { data, error } = await query;
    if (error) {
      errors.push(`remarketing_outreach: ${error.message}`);
    } else {
      const records = data || [];
      const byStatus: Record<string, number> = {};
      for (const r of records) {
        byStatus[r.status] = (byStatus[r.status] || 0) + 1;
      }
      results.remarketing_outreach = {
        records,
        total: records.length,
        by_status: byStatus,
      };
    }
  }

  // Compute total
  const totalCount =
    ((results.outreach_records as { total?: number })?.total || 0) +
    ((results.remarketing_outreach as { total?: number })?.total || 0);

  results.total_across_sources = totalCount;
  if (errors.length > 0) results.errors = errors;

  return { data: results };
}
