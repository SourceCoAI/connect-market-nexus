/**
 * Signal & Intelligence Tools
 * Engagement signals, buyer decisions, score history, interest signals.
 *
 * MERGED Feb 2026:
 *   get_engagement_signals + get_buyer_decisions + get_interest_signals → get_buyer_signals (with signal_source param)
 *   get_score_history + get_buyer_learning_history → get_buyer_history (with history_type param)
 */

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import type { ClaudeTool } from "../../_shared/claude-client.ts";
import type { ToolResult } from "./index.ts";

// ---------- Tool definitions ----------

export const signalTools: ClaudeTool[] = [
  {
    name: 'get_buyer_signals',
    description: 'Get buyer signals and activity for a deal or buyer. Covers engagement signals (site visits, financial requests, NDA signed, CEO involvement, IOI/LOI, meetings), buyer approve/pass decisions, and marketplace interest signals. Use `signal_source` to target a specific data type, or omit for all.',
    input_schema: {
      type: 'object',
      properties: {
        signal_source: {
          type: 'string',
          enum: ['engagement', 'decisions', 'interest', 'all'],
          description: '"engagement" for engagement signals (site visits, NDA, IOI/LOI, etc), "decisions" for approve/pass decisions, "interest" for marketplace interest signals, "all" for everything (default "all")',
        },
        deal_id: { type: 'string', description: 'Filter by deal/listing UUID' },
        buyer_id: { type: 'string', description: 'Filter by buyer UUID' },
        signal_type: {
          type: 'string',
          description: 'Filter engagement signals by type: site_visit, financial_request, ceo_involvement, nda_signed, ioi_submitted, loi_submitted, call_scheduled, management_presentation, data_room_access, email_engagement',
        },
        decision_type: { type: 'string', enum: ['approved', 'passed', 'all'], description: 'Filter decisions by type (default "all")' },
        pass_category: { type: 'string', description: 'Filter by pass category: geographic_mismatch, size_mismatch, service_mismatch, acquisition_timing, competition, other' },
        converted_only: { type: 'boolean', description: 'Only show interest signals that converted to connection requests' },
        days: { type: 'number', description: 'Lookback period in days (default 30)' },
        limit: { type: 'number', description: 'Max results per source (default 50)' },
      },
      required: [],
    },
  },
  {
    name: 'get_buyer_history',
    description: 'Get historical buyer scoring and decision data. Covers score snapshots (how composite/dimension scores changed over time) and buyer learning history (approve/pass decisions with scores at time of decision). Use `history_type` to target specific data.',
    input_schema: {
      type: 'object',
      properties: {
        history_type: {
          type: 'string',
          enum: ['scores', 'learning', 'all'],
          description: '"scores" for score snapshots over time, "learning" for decision history with score context, "all" for both (default "all")',
        },
        deal_id: { type: 'string', description: 'Filter by deal/listing UUID' },
        buyer_id: { type: 'string', description: 'Filter by buyer UUID' },
        universe_id: { type: 'string', description: 'Filter by buyer universe UUID' },
        action: { type: 'string', enum: ['approved', 'passed', 'hidden', 'all'], description: 'Filter learning history by decision action (default "all")' },
        pass_category: { type: 'string', description: 'Filter by pass category: geographic_mismatch, size_mismatch, service_mismatch, acquisition_timing, competition, other' },
        limit: { type: 'number', description: 'Max results per source (default 20 for scores, 50 for learning)' },
      },
      required: [],
    },
  },
];

// ---------- Executor ----------

export async function executeSignalTool(
  supabase: SupabaseClient,
  toolName: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  switch (toolName) {
    // Merged tools
    case 'get_buyer_signals': return getBuyerSignals(supabase, args);
    case 'get_buyer_history': return getBuyerHistory(supabase, args);
    // Backward compatibility aliases
    case 'get_engagement_signals': return getBuyerSignals(supabase, { ...args, signal_source: 'engagement' });
    case 'get_buyer_decisions': return getBuyerSignals(supabase, { ...args, signal_source: 'decisions' });
    case 'get_interest_signals': return getBuyerSignals(supabase, { ...args, signal_source: 'interest' });
    case 'get_score_history': return getBuyerHistory(supabase, { ...args, history_type: 'scores' });
    case 'get_buyer_learning_history': return getBuyerHistory(supabase, { ...args, history_type: 'learning' });
    default: return { error: `Unknown signal tool: ${toolName}` };
  }
}

// ---------- Unified get_buyer_signals ----------

async function getBuyerSignals(
  supabase: SupabaseClient,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const signalSource = (args.signal_source as string) || 'all';
  const results: Record<string, unknown> = { signal_source_filter: signalSource };
  const errors: string[] = [];

  if (signalSource === 'all' || signalSource === 'engagement') {
    const res = await getEngagementSignals(supabase, args);
    if (res.error) errors.push(`engagement: ${res.error}`);
    else results.engagement = res.data;
  }

  if (signalSource === 'all' || signalSource === 'decisions') {
    const res = await getBuyerDecisions(supabase, args);
    if (res.error) errors.push(`decisions: ${res.error}`);
    else results.decisions = res.data;
  }

  if (signalSource === 'all' || signalSource === 'interest') {
    const res = await getInterestSignals(supabase, args);
    if (res.error) errors.push(`interest: ${res.error}`);
    else results.interest = res.data;
  }

  if (errors.length > 0) results.errors = errors;
  return { data: results };
}

// ---------- Unified get_buyer_history ----------

async function getBuyerHistory(
  supabase: SupabaseClient,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const historyType = (args.history_type as string) || 'all';
  const results: Record<string, unknown> = { history_type_filter: historyType };
  const errors: string[] = [];

  if (historyType === 'all' || historyType === 'scores') {
    const res = await getScoreHistory(supabase, args);
    if (res.error) errors.push(`scores: ${res.error}`);
    else results.score_history = res.data;
  }

  if (historyType === 'all' || historyType === 'learning') {
    const res = await getBuyerLearningHistory(supabase, args);
    if (res.error) errors.push(`learning: ${res.error}`);
    else results.learning_history = res.data;
  }

  if (errors.length > 0) results.errors = errors;
  return { data: results };
}

// ---------- Original implementations (preserved) ----------

async function getEngagementSignals(
  supabase: SupabaseClient,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const limit = Math.min(Number(args.limit) || 100, 1000);
  const days = Number(args.days) || 30;
  const cutoff = new Date(Date.now() - days * 86400000).toISOString();

  let query = supabase
    .from('engagement_signals')
    .select('id, listing_id, buyer_id, signal_type, signal_value, signal_date, source, notes, created_at')
    .gte('signal_date', cutoff)
    .order('signal_date', { ascending: false })
    .limit(limit);

  if (args.deal_id) query = query.eq('listing_id', args.deal_id as string);
  if (args.buyer_id) query = query.eq('buyer_id', args.buyer_id as string);
  if (args.signal_type) query = query.eq('signal_type', args.signal_type as string);

  const { data, error } = await query;
  if (error) return { error: error.message };

  const signals = data || [];
  const byType: Record<string, number> = {};
  const byBuyer: Record<string, number> = {};
  for (const s of signals) {
    byType[s.signal_type] = (byType[s.signal_type] || 0) + 1;
    if (s.buyer_id) byBuyer[s.buyer_id] = (byBuyer[s.buyer_id] || 0) + 1;
  }

  return {
    data: {
      signals,
      total: signals.length,
      by_type: byType,
      most_engaged_buyers: Object.entries(byBuyer).sort((a, b) => b[1] - a[1]).slice(0, 10),
    },
  };
}

async function getBuyerDecisions(
  supabase: SupabaseClient,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const limit = Math.min(Number(args.limit) || 50, 500);
  const decisionType = (args.decision_type as string) || 'all';

  const queries: Promise<unknown>[] = [];

  // Fetch approved decisions if requested
  if (decisionType === 'all' || decisionType === 'approved') {
    let approvedQuery = supabase
      .from('buyer_approve_decisions')
      .select('id, listing_id, buyer_id, user_id, approval_reason, created_at')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (args.deal_id) approvedQuery = approvedQuery.eq('listing_id', args.deal_id as string);
    if (args.buyer_id) approvedQuery = approvedQuery.eq('buyer_id', args.buyer_id as string);
    queries.push(Promise.resolve(approvedQuery));
  } else {
    queries.push(Promise.resolve({ data: [], error: null }));
  }

  // Fetch pass decisions if requested
  if (decisionType === 'all' || decisionType === 'passed') {
    let passedQuery = supabase
      .from('buyer_pass_decisions')
      .select('id, listing_id, buyer_id, user_id, pass_reason, pass_category, created_at')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (args.deal_id) passedQuery = passedQuery.eq('listing_id', args.deal_id as string);
    if (args.buyer_id) passedQuery = passedQuery.eq('buyer_id', args.buyer_id as string);
    if (args.pass_category) passedQuery = passedQuery.eq('pass_category', args.pass_category as string);
    queries.push(Promise.resolve(passedQuery));
  } else {
    queries.push(Promise.resolve({ data: [], error: null }));
  }

  const [approvedResult, passedResult] = await Promise.all(queries) as [
    { data: unknown[]; error: unknown },
    { data: unknown[]; error: unknown },
  ];

  const approved = (approvedResult.data || []).map(d => ({ ...d as object, decision: 'approved' }));
  const passed = (passedResult.data || []).map(d => ({ ...d as object, decision: 'passed' }));

  const passByCategory: Record<string, number> = {};
  for (const p of passed as Array<{ pass_category?: string }>) {
    const cat = p.pass_category || 'other';
    passByCategory[cat] = (passByCategory[cat] || 0) + 1;
  }

  return {
    data: {
      approved,
      passed,
      total_approved: approved.length,
      total_passed: passed.length,
      pass_by_category: passByCategory,
    },
  };
}

async function getScoreHistory(
  supabase: SupabaseClient,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const limit = Math.min(Number(args.limit) || 20, 100);

  let query = supabase
    .from('score_snapshots')
    .select('id, listing_id, buyer_id, universe_id, composite_score, geography_score, size_score, service_score, owner_goals_score, deal_quality_score, engagement_score, tier, trigger_type, scoring_version, scored_at')
    .order('scored_at', { ascending: false })
    .limit(limit);

  if (args.deal_id) query = query.eq('listing_id', args.deal_id as string);
  if (args.buyer_id) query = query.eq('buyer_id', args.buyer_id as string);
  if (args.universe_id) query = query.eq('universe_id', args.universe_id as string);

  const { data, error } = await query;
  if (error) return { error: error.message };

  return { data: { snapshots: data || [], total: (data || []).length } };
}

async function getInterestSignals(
  supabase: SupabaseClient,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const limit = Math.min(Number(args.limit) || 50, 500);
  const days = Number(args.days) || 30;
  const cutoff = new Date(Date.now() - days * 86400000).toISOString();

  let query = supabase
    .from('interest_signals')
    .select('id, listing_id, user_id, created_at, converted_to_connection, converted_at')
    .gte('created_at', cutoff)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (args.deal_id) query = query.eq('listing_id', args.deal_id as string);
  if (args.converted_only === true) query = query.eq('converted_to_connection', true);

  const { data, error } = await query;
  if (error) return { error: error.message };

  const signals = data || [];
  return {
    data: {
      signals,
      total: signals.length,
      converted: signals.filter((s: { converted_to_connection?: boolean }) => s.converted_to_connection).length,
    },
  };
}

async function getBuyerLearningHistory(
  supabase: SupabaseClient,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const limit = Math.min(Number(args.limit) || 50, 500);
  const action = (args.action as string) || 'all';

  let query = supabase
    .from('buyer_learning_history')
    .select('id, buyer_id, listing_id, universe_id, score_id, action, pass_reason, pass_category, composite_score, geography_score, size_score, service_score, owner_goals_score, score_at_decision, action_by, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (args.buyer_id) query = query.eq('buyer_id', args.buyer_id as string);
  if (args.deal_id) query = query.eq('listing_id', args.deal_id as string);
  if (args.universe_id) query = query.eq('universe_id', args.universe_id as string);
  if (action !== 'all') query = query.eq('action', action);
  if (args.pass_category) query = query.eq('pass_category', args.pass_category as string);

  const { data, error } = await query;
  if (error) return { error: error.message };

  const records = data || [];
  const byAction: Record<string, number> = {};
  const byPassCategory: Record<string, number> = {};
  for (const r of records) {
    byAction[r.action] = (byAction[r.action] || 0) + 1;
    if (r.pass_category) byPassCategory[r.pass_category] = (byPassCategory[r.pass_category] || 0) + 1;
  }

  return {
    data: {
      history: records,
      total: records.length,
      by_action: byAction,
      pass_by_category: byPassCategory,
    },
  };
}
