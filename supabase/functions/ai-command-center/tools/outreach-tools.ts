/**
 * Outreach & Call History Tools
 * Track data room access, buyer outreach status, and PhoneBurner call history.
 * Updated Feb 2026: Added get_call_history tool to expose PhoneBurner call data to AI.
 */

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import type { ClaudeTool } from '../../_shared/claude-client.ts';
import type { ToolResult } from './index.ts';

// ---------- Tool definitions ----------

export const outreachTools: ClaudeTool[] = [
  {
    name: 'get_outreach_status',
    description:
      'Get outreach and data room access status for a deal — who has been contacted, who has data room access, pending outreach, and engagement timeline.',
    input_schema: {
      type: 'object',
      properties: {
        deal_id: { type: 'string', description: 'The deal/listing UUID' },
        buyer_id: { type: 'string', description: 'Optional: filter to a specific buyer' },
      },
      required: ['deal_id'],
    },
  },
  {
    name: 'get_document_engagement',
    description:
      'Track who has viewed deal documents — data room opens, teaser views, and document access patterns. Shows which buyers are actively reviewing materials. Use when the user asks "who opened the teaser?", "data room engagement?", "which buyers viewed documents?".',
    input_schema: {
      type: 'object',
      properties: {
        deal_id: { type: 'string', description: 'Filter by deal UUID' },
        buyer_id: { type: 'string', description: 'Filter by buyer UUID' },
        days: { type: 'number', description: 'Lookback period in days (default 30)' },
        limit: { type: 'number', description: 'Max results (default 50)' },
      },
      required: [],
    },
  },
  {
    name: 'get_call_history',
    description:
      'Get PhoneBurner call history from the contact_activities table. Shows call attempts, completed calls, dispositions, talk time, recordings, and callbacks. Use to answer "has this contact been called?", "how many calls to this buyer?", "what was the outcome of the last call?", "show rep calling activity", or "show all calls for this deal".',
    input_schema: {
      type: 'object',
      properties: {
        contact_id: { type: 'string', description: 'Filter by unified contact UUID' },
        buyer_id: {
          type: 'string',
          description:
            'Filter by buyer UUID (remarketing_buyer_id) — returns all call activity for contacts at this buyer firm',
        },
        deal_id: {
          type: 'string',
          description:
            'Filter by deal/listing UUID — returns call activity for all buyers scored against this deal (resolved via remarketing_scores)',
        },
        user_email: {
          type: 'string',
          description: 'Filter by rep/user email — shows calls made by a specific team member',
        },
        activity_type: {
          type: 'string',
          enum: [
            'call_attempt',
            'call_completed',
            'callback_scheduled',
            'contact_displayed',
            'all',
          ],
          description: 'Filter by activity type (default "all")',
        },
        disposition: {
          type: 'string',
          description:
            'Filter by disposition — matches against disposition_label (e.g. "Interested", "Left Voicemail", "No Answer") or disposition_code',
        },
        start_date: {
          type: 'string',
          description:
            'Start of date range filter (ISO 8601, e.g. "2026-01-01"). Overrides days if provided.',
        },
        end_date: {
          type: 'string',
          description: 'End of date range filter (ISO 8601, e.g. "2026-02-28"). Defaults to now.',
        },
        days: {
          type: 'number',
          description: 'Lookback period in days (default 90). Ignored if start_date is provided.',
        },
        limit: { type: 'number', description: 'Max results (default 50)' },
      },
      required: [],
    },
  },
];

// ---------- Executor ----------

export async function executeOutreachTool(
  supabase: SupabaseClient,
  toolName: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  switch (toolName) {
    case 'get_outreach_status':
      return getOutreachStatus(supabase, args);
    case 'get_document_engagement':
      return getDocumentEngagement(supabase, args);
    case 'get_call_history':
      return getCallHistory(supabase, args);
    default:
      return { error: `Unknown outreach tool: ${toolName}` };
  }
}

// ---------- Implementations ----------

async function getOutreachStatus(
  supabase: SupabaseClient,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const dealId = args.deal_id as string;

  // Parallel fetch: data_room_access + deal_data_room_access + scores with status
  const queries: Promise<unknown>[] = [
    Promise.resolve(supabase
      .from('data_room_access')
      .select(
        'id, deal_id, remarketing_buyer_id, contact_id, can_view_teaser, can_view_full_memo, can_view_data_room, granted_at, granted_by, last_access_at, link_sent_at, link_sent_to_email, revoked_at',
      )
      .eq('deal_id', dealId)),
    Promise.resolve(supabase
      .from('deal_data_room_access')
      .select(
        'id, deal_id, buyer_id, buyer_name, buyer_email, buyer_firm, is_active, granted_at, last_accessed_at, nda_signed_at, fee_agreement_signed_at, revoked_at',
      )
      .eq('deal_id', dealId)),
    Promise.resolve(supabase
      .from('remarketing_scores')
      .select('buyer_id, status, composite_score, tier')
      .eq('listing_id', dealId)),
  ];

  const [accessResult, dealAccessResult, scoresResult] = (await Promise.all(queries)) as [
    { data: unknown[] | null; error: { message: string } | null },
    { data: unknown[] | null; error: { message: string } | null },
    {
      data: Array<{
        buyer_id: string;
        status: string;
        composite_score: number;
        tier: string | null;
      }> | null;
      error: { message: string } | null;
    },
  ];

  if (accessResult.error) return { error: accessResult.error.message };

  const access = accessResult.data || [];
  const dealAccess = dealAccessResult.data || [];
  const scores = scoresResult.data || [];

  // Filter to specific buyer if requested
  let filteredAccess = access;
  let filteredDealAccess = dealAccess;
  if (args.buyer_id) {
    const bid = args.buyer_id as string;
    filteredAccess = (access as { remarketing_buyer_id?: string }[]).filter(
      (a) => a.remarketing_buyer_id === bid,
    );
    filteredDealAccess = (dealAccess as { buyer_id?: string }[]).filter((a) => a.buyer_id === bid);
  }

  // Compute status summary from scores
  const statusCounts: Record<string, number> = {};
  for (const s of scores) {
    const st = s.status?.toUpperCase() || 'PENDING';
    statusCounts[st] = (statusCounts[st] || 0) + 1;
  }

  return {
    data: {
      data_room_access: filteredAccess,
      deal_data_room_access: filteredDealAccess,
      buyer_status_summary: statusCounts,
      total_scored_buyers: scores.length,
      deal_id: dealId,
    },
  };
}

/**
 * Track document engagement — data room opens, teaser views, access patterns.
 * Queries data_room_access for last_access_at and engagement_signals for data room events.
 */
async function getDocumentEngagement(
  supabase: SupabaseClient,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const days = Number(args.days) || 30;
  const limit = Math.min(Number(args.limit) || 50, 200);
  const cutoff = new Date(Date.now() - days * 86400000).toISOString();

  // Parallel queries: data_room_access + engagement_signals for data room events
  const [accessResult, signalsResult] = await Promise.all([
    (() => {
      let q = supabase
        .from('data_room_access')
        .select(
          'id, deal_id, remarketing_buyer_id, contact_id, can_view_teaser, can_view_full_memo, can_view_data_room, granted_at, last_access_at, link_sent_at, link_sent_to_email, revoked_at',
        )
        .is('revoked_at', null)
        .order('last_access_at', { ascending: false, nullsFirst: false })
        .limit(limit);

      if (args.deal_id) q = q.eq('deal_id', args.deal_id as string);
      if (args.buyer_id) q = q.eq('remarketing_buyer_id', args.buyer_id as string);
      return q;
    })(),
    (() => {
      let q = supabase
        .from('engagement_signals')
        .select('id, deal_id, buyer_id, signal_type, signal_value, signal_source, created_at')
        .in('signal_type', [
          'data_room_access',
          'data_room_view',
          'teaser_view',
          'memo_view',
          'document_download',
        ])
        .gte('created_at', cutoff)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (args.deal_id) q = q.eq('deal_id', args.deal_id as string);
      if (args.buyer_id) q = q.eq('buyer_id', args.buyer_id as string);
      return q;
    })(),
  ]);

  const accessRecords = accessResult.data || [];
  const signals = signalsResult.data || [];

  // Compute engagement summary
  const buyerEngagement: Record<
    string,
    {
      buyer_id: string;
      access_level: string;
      granted_at: string | null;
      last_access_at: string | null;
      total_signals: number;
      signal_types: Record<string, number>;
    }
  > = {};

  for (const a of accessRecords) {
    const bid = a.remarketing_buyer_id;
    if (!bid) continue;
    if (!buyerEngagement[bid]) {
      buyerEngagement[bid] = {
        buyer_id: bid,
        access_level: a.can_view_data_room ? 'full' : a.can_view_full_memo ? 'memo' : 'teaser',
        granted_at: a.granted_at,
        last_access_at: a.last_access_at,
        total_signals: 0,
        signal_types: {},
      };
    }
    // Update last_access to most recent
    if (
      a.last_access_at &&
      (!buyerEngagement[bid].last_access_at ||
        a.last_access_at > buyerEngagement[bid].last_access_at!)
    ) {
      buyerEngagement[bid].last_access_at = a.last_access_at;
    }
  }

  for (const s of signals) {
    const bid = s.buyer_id;
    if (!bid) continue;
    if (!buyerEngagement[bid]) {
      buyerEngagement[bid] = {
        buyer_id: bid,
        access_level: 'unknown',
        granted_at: null,
        last_access_at: null,
        total_signals: 0,
        signal_types: {},
      };
    }
    buyerEngagement[bid].total_signals++;
    buyerEngagement[bid].signal_types[s.signal_type] =
      (buyerEngagement[bid].signal_types[s.signal_type] || 0) + 1;
  }

  const engagementList = Object.values(buyerEngagement).sort(
    (a, b) => b.total_signals - a.total_signals,
  );

  // Buyers who accessed but never viewed
  const accessedNeverViewed = accessRecords.filter(
    (a: { last_access_at: string | null; remarketing_buyer_id: string }) =>
      !a.last_access_at && a.remarketing_buyer_id,
  ).length;

  return {
    data: {
      buyer_engagement: engagementList,
      access_records: accessRecords,
      recent_signals: signals,
      summary: {
        total_with_access: accessRecords.length,
        total_who_viewed: engagementList.filter((e) => e.last_access_at).length,
        total_signals: signals.length,
        accessed_never_viewed: accessedNeverViewed,
        most_active_buyers: engagementList.slice(0, 5).map((e) => ({
          buyer_id: e.buyer_id,
          signals: e.total_signals,
        })),
      },
      lookback_days: days,
    },
  };
}

/**
 * Get PhoneBurner call history from the contact_activities table.
 * Surfaces call attempts, completed calls, dispositions, recordings, and callbacks.
 * Supports filtering by buyer_id, contact_id, deal_id (via remarketing_scores),
 * date range (start_date/end_date or days lookback), and disposition (label or code).
 */
async function getCallHistory(
  supabase: SupabaseClient,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const limit = Math.min(Number(args.limit) || 50, 500);
  const activityType = (args.activity_type as string) || 'all';

  // Date range: explicit start_date/end_date takes precedence over days lookback
  let dateFrom: string;
  let dateTo: string | null = null;
  if (args.start_date) {
    dateFrom = new Date(args.start_date as string).toISOString();
    if (args.end_date) {
      dateTo = new Date(args.end_date as string).toISOString();
    }
  } else {
    const days = Number(args.days) || 90;
    dateFrom = new Date(Date.now() - days * 86400000).toISOString();
  }

  // Resolve buyer_id alias (the column is remarketing_buyer_id)
  const buyerId = (args.buyer_id as string) || (args.remarketing_buyer_id as string) || null;

  // If deal_id is provided, resolve to buyer IDs via remarketing_scores
  let dealBuyerIds: string[] | null = null;
  if (args.deal_id) {
    const { data: scoredBuyers, error: scErr } = await supabase
      .from('remarketing_scores')
      .select('buyer_id')
      .eq('listing_id', args.deal_id as string);

    if (scErr) return { error: `Failed to resolve deal buyers: ${scErr.message}` };
    dealBuyerIds = (scoredBuyers || []).map((s: { buyer_id: string }) => s.buyer_id);
    if (!dealBuyerIds || dealBuyerIds.length === 0) {
      return {
        data: {
          activities: [],
          total: 0,
          summary: {
            by_type: {},
            by_disposition: {},
            by_rep: {},
            total_talk_time_seconds: 0,
            total_duration_seconds: 0,
            connected_calls: 0,
            avg_talk_time_seconds: 0,
          },
          deal_id: args.deal_id,
          note: 'No buyers scored against this deal — no call activity to show.',
        },
      };
    }
  }

  // Build the query
  let query = supabase
    .from('contact_activities')
    .select(
      'id, activity_type, source_system, contact_id, remarketing_buyer_id, user_email, user_name, call_started_at, call_ended_at, call_duration_seconds, talk_time_seconds, call_outcome, disposition_code, disposition_label, disposition_notes, recording_url, recording_duration_seconds, callback_scheduled_date, callback_outcome, phoneburner_call_id, phoneburner_session_id, created_at',
    )
    .gte('created_at', dateFrom)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (dateTo) query = query.lte('created_at', dateTo);
  if (args.contact_id) query = query.eq('contact_id', args.contact_id as string);
  if (buyerId) query = query.eq('remarketing_buyer_id', buyerId);
  if (dealBuyerIds && !buyerId) query = query.in('remarketing_buyer_id', dealBuyerIds);
  if (args.user_email) query = query.eq('user_email', args.user_email as string);
  if (activityType !== 'all') query = query.eq('activity_type', activityType);

  // Disposition filter: match against label (case-insensitive via ilike) or exact code
  if (args.disposition) {
    const disp = (args.disposition as string).replace(/[,%()]/g, '');
    query = query.or(`disposition_label.ilike.%${disp}%,disposition_code.eq.${disp}`);
  }

  const { data, error } = await query;
  if (error) return { error: error.message };

  const activities = data || [];

  // Compute summary statistics
  const byType: Record<string, number> = {};
  const byDisposition: Record<string, number> = {};
  const byRep: Record<string, number> = {};
  let totalTalkTime = 0;
  let totalDuration = 0;
  let connectedCalls = 0;

  for (const a of activities) {
    byType[a.activity_type] = (byType[a.activity_type] || 0) + 1;
    if (a.disposition_label) {
      byDisposition[a.disposition_label] = (byDisposition[a.disposition_label] || 0) + 1;
    }
    if (a.user_email) {
      byRep[a.user_email] = (byRep[a.user_email] || 0) + 1;
    }
    if (a.talk_time_seconds) {
      totalTalkTime += a.talk_time_seconds;
      connectedCalls++;
    }
    if (a.call_duration_seconds) {
      totalDuration += a.call_duration_seconds;
    }
  }

  return {
    data: {
      activities,
      total: activities.length,
      summary: {
        by_type: byType,
        by_disposition: byDisposition,
        by_rep: byRep,
        total_talk_time_seconds: totalTalkTime,
        total_duration_seconds: totalDuration,
        connected_calls: connectedCalls,
        avg_talk_time_seconds: connectedCalls > 0 ? Math.round(totalTalkTime / connectedCalls) : 0,
      },
      ...(args.deal_id ? { deal_id: args.deal_id, deal_buyer_count: dealBuyerIds?.length } : {}),
      date_range: { from: dateFrom, ...(dateTo ? { to: dateTo } : {}) },
    },
  };
}
