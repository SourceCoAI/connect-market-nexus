/* eslint-disable @typescript-eslint/no-explicit-any -- Supabase client used with untyped tables */
/**
 * Unified Follow-Up Queue Tool
 * Aggregates all pending follow-ups: overdue tasks, stale outreach,
 * unsigned NDAs, unread messages, and upcoming due dates into a single view.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
type SupabaseClient = ReturnType<typeof createClient>;
import type { ClaudeTool } from '../../_shared/claude-client.ts';
import type { ToolResult } from './index.ts';

// ---------- Tool definitions ----------

export const followupTools: ClaudeTool[] = [
  {
    name: 'get_stale_deals',
    description:
      'Find deals that have gone quiet — no activity (tasks, outreach, notes, stage changes) within a specified number of days. Use when the user asks "which deals have gone quiet?", "stale deals?", "deals with no activity in 30 days?".',
    input_schema: {
      type: 'object',
      properties: {
        days: {
          type: 'number',
          description: 'Number of days of inactivity to consider stale (default 30)',
        },
        status_filter: {
          type: 'string',
          description: 'Filter by deal status: "active", "all" (default "active")',
        },
        limit: {
          type: 'number',
          description: 'Max deals to return (default 20)',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_follow_up_queue',
    description: `Get a unified follow-up queue across all systems. Returns everything the user needs to act on today:
- Overdue deal tasks (past due_date)
- Stale outreach (no response in X business days)
- Unsigned NDAs / fee agreements with pending buyers
- Unread connection request messages
- Upcoming due dates (next 7 days)
Use this when the user asks "who do I need to follow up with?", "what's overdue?", or "what should I do today?"`,
    input_schema: {
      type: 'object',
      properties: {
        user_id: {
          type: 'string',
          description: 'User UUID. Use "CURRENT_USER" for the logged-in user.',
        },
        stale_days: {
          type: 'number',
          description: 'Days of no response before marking outreach as stale (default 5)',
        },
        include_upcoming: {
          type: 'boolean',
          description: 'Include tasks due in the next 7 days (default true)',
        },
        limit: {
          type: 'number',
          description: 'Max items per category (default 10)',
        },
      },
      required: [],
    },
  },
];

// ---------- Executor ----------

export async function executeFollowupTool(
  supabase: SupabaseClient,
  toolName: string,
  args: Record<string, unknown>,
  userId: string,
): Promise<ToolResult> {
  switch (toolName) {
    case 'get_stale_deals':
      return getStaleDealsTool(supabase, args);
    case 'get_follow_up_queue':
      return getFollowUpQueue(supabase, args, userId);
    default:
      return { error: `Unknown followup tool: ${toolName}` };
  }
}

// ---------- Implementation ----------

async function getFollowUpQueue(
  supabase: SupabaseClient,
  args: Record<string, unknown>,
  userId: string,
): Promise<ToolResult> {
  const targetUserId = (args.user_id as string) || userId;
  const staleDays = (args.stale_days as number) || 5;
  const includeUpcoming = args.include_upcoming !== false;
  const limit = Math.min((args.limit as number) || 10, 25);

  const now = new Date();
  const staleDate = new Date(now);
  staleDate.setDate(staleDate.getDate() - staleDays);
  const staleDateStr = staleDate.toISOString();

  const upcomingDate = new Date(now);
  upcomingDate.setDate(upcomingDate.getDate() + 7);
  const upcomingDateStr = upcomingDate.toISOString();

  // Parallel queries for all follow-up categories
  const [
    overdueTasksResult,
    upcomingTasksResult,
    staleOutreachResult,
    pendingNdasResult,
    unreadMessagesResult,
  ] = await Promise.all([
    // 1. Overdue tasks (from unified daily_standup_tasks)
    (supabase as any)
      .from('daily_standup_tasks')
      .select('id, title, entity_id, status, priority, due_date')
      .eq('assignee_id', targetUserId)
      .eq('entity_type', 'deal')
      .in('status', ['pending', 'in_progress', 'overdue'])
      .lt('due_date', now.toISOString())
      .order('due_date', { ascending: true })
      .limit(limit),

    // 2. Upcoming tasks (next 7 days, from unified daily_standup_tasks)
    includeUpcoming
      ? (supabase as any)
          .from('daily_standup_tasks')
          .select('id, title, entity_id, status, priority, due_date')
          .eq('assignee_id', targetUserId)
          .eq('entity_type', 'deal')
          .in('status', ['pending', 'in_progress'])
          .gte('due_date', now.toISOString())
          .lte('due_date', upcomingDateStr)
          .order('due_date', { ascending: true })
          .limit(limit)
      : Promise.resolve({ data: [], error: null }),

    // 3. Stale outreach (no update in staleDays)
    (supabase as any)
      .from('outreach_records')
      .select('id, buyer_name, deal_id, stage, last_action_date, next_action, next_action_date')
      .in('stage', ['nda_sent', 'intro_sent', 'cim_sent', 'meeting_scheduled'])
      .lt('last_action_date', staleDateStr)
      .order('last_action_date', { ascending: true })
      .limit(limit),

    // 4. Pending NDAs/fee agreements
    (supabase as any)
      .from('firm_agreements')
      .select('id, primary_company_name, nda_signed, fee_agreement_signed, created_at')
      .eq('nda_signed', false)
      .order('created_at', { ascending: true })
      .limit(limit),

    // 5. Unread connection request messages
    (supabase as any)
      .from('connection_messages')
      .select('id, body, sender_role, created_at, connection_request_id')
      .eq('is_read_by_admin', false)
      .eq('sender_role', 'buyer')
      .order('created_at', { ascending: false })
      .limit(limit),
  ]);

  // Map entity_id to deal_id for backward compatibility
  const overdueTasks = (overdueTasksResult.data || []).map(
    (t: {
      id: string;
      title: string;
      entity_id: string;
      status: string;
      priority: string;
      due_date: string;
    }) => ({
      ...t,
      deal_id: t.entity_id,
    }),
  );
  const upcomingTasks = (upcomingTasksResult.data || []).map(
    (t: {
      id: string;
      title: string;
      entity_id: string;
      status: string;
      priority: string;
      due_date: string;
    }) => ({
      ...t,
      deal_id: t.entity_id,
    }),
  );
  const staleOutreach = staleOutreachResult.data || [];
  const pendingNdas = pendingNdasResult.data || [];
  const unreadMessages = unreadMessagesResult.data || [];

  const totalItems =
    overdueTasks.length + staleOutreach.length + pendingNdas.length + unreadMessages.length;

  return {
    data: {
      summary: {
        total_action_items: totalItems,
        overdue_tasks: overdueTasks.length,
        stale_outreach: staleOutreach.length,
        pending_ndas: pendingNdas.length,
        unread_messages: unreadMessages.length,
        upcoming_tasks: upcomingTasks.length,
      },
      overdue_tasks: overdueTasks.map(
        (t: {
          id: string;
          title: string;
          deal_id: string;
          priority: string;
          due_date: string;
        }) => ({
          id: t.id,
          title: t.title,
          deal_id: t.deal_id,
          priority: t.priority,
          due_date: t.due_date,
          days_overdue: Math.floor(
            (now.getTime() - new Date(t.due_date).getTime()) / (1000 * 60 * 60 * 24),
          ),
        }),
      ),
      stale_outreach: staleOutreach.map(
        (o: {
          id: string;
          buyer_name: string;
          deal_id: string;
          stage: string;
          last_action_date: string;
          next_action: string;
          next_action_date: string;
        }) => ({
          id: o.id,
          buyer_name: o.buyer_name,
          deal_id: o.deal_id,
          stage: o.stage,
          last_action_date: o.last_action_date,
          days_since_action: Math.floor(
            (now.getTime() - new Date(o.last_action_date).getTime()) / (1000 * 60 * 60 * 24),
          ),
          next_action: o.next_action,
        }),
      ),
      pending_ndas: pendingNdas.map(
        (n: {
          id: string;
          primary_company_name: string;
          nda_signed: boolean;
          fee_agreement_signed: boolean;
          created_at: string;
        }) => ({
          id: n.id,
          company: n.primary_company_name,
          has_fee_agreement: n.fee_agreement_signed,
          created_at: n.created_at,
        }),
      ),
      unread_messages: unreadMessages.map(
        (m: {
          id: string;
          body: string;
          sender_role: string;
          created_at: string;
          connection_request_id: string;
        }) => ({
          id: m.id,
          preview: (m.body || '').substring(0, 100),
          connection_request_id: m.connection_request_id,
          created_at: m.created_at,
        }),
      ),
      upcoming_tasks: upcomingTasks.map(
        (t: {
          id: string;
          title: string;
          deal_id: string;
          priority: string;
          due_date: string;
        }) => ({
          id: t.id,
          title: t.title,
          deal_id: t.deal_id,
          priority: t.priority,
          due_date: t.due_date,
        }),
      ),
      source_tables: [
        'daily_standup_tasks',
        'outreach_records',
        'firm_agreements',
        'connection_messages',
      ],
    },
  };
}

// ---------- Stale deals detection ----------

async function getStaleDealsTool(
  supabase: SupabaseClient,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const days = (args.days as number) || 30;
  const statusFilter = (args.status_filter as string) || 'active';
  const limit = Math.min((args.limit as number) || 20, 50);

  const cutoffDate = new Date(Date.now() - days * 86400000).toISOString();

  // 1. Get deals
  let dealsQuery = (supabase as any)
    .from('listings')
    .select(
      'id, title, internal_company_name, industry, category, revenue, ebitda, address_state, remarketing_status, updated_at, created_at',
    )
    .order('updated_at', { ascending: true });

  if (statusFilter === 'active') {
    dealsQuery = dealsQuery.not(
      'remarketing_status',
      'in',
      '("closed","passed","archived","dead")',
    );
  }

  const { data: deals, error: dealsError } = await dealsQuery.limit(500);
  if (dealsError) return { error: dealsError.message };
  if (!deals?.length) return { data: { stale_deals: [], total: 0, message: 'No deals found' } };

  const dealIds = deals.map((d: { id: string }) => d.id);

  // 2. Get latest activity per deal
  const { data: activities } = await (supabase as any)
    .from('deal_activities')
    .select('deal_id, created_at')
    .in('deal_id', dealIds)
    .gte('created_at', cutoffDate);

  const activeDeals = new Set((activities || []).map((a: { deal_id: string }) => a.deal_id));

  // 3. Also check daily_standup_tasks for recent updates on deals
  const { data: tasks } = await (supabase as any)
    .from('daily_standup_tasks')
    .select('entity_id, created_at')
    .eq('entity_type', 'deal')
    .in('entity_id', dealIds)
    .gte('created_at', cutoffDate);

  for (const t of (tasks || []) as any[]) activeDeals.add(t.entity_id);

  // 4. Check outreach_records for recent action
  const { data: outreach } = await (supabase as any)
    .from('outreach_records')
    .select('deal_id, last_action_date')
    .in('deal_id', dealIds)
    .gte('last_action_date', cutoffDate);

  for (const o of (outreach || []) as any[]) activeDeals.add(o.deal_id);

  // 5. Filter to stale deals
  const staleDealsList = deals
    .filter((d: { id: string }) => !activeDeals.has(d.id))
    .slice(0, limit);

  return {
    data: {
      stale_deals: staleDealsList.map(
        (d: {
          id: string;
          title: string;
          internal_company_name: string;
          industry: string;
          revenue: number;
          address_state: string;
          remarketing_status: string;
          updated_at: string;
        }) => ({
          id: d.id,
          title: d.title || d.internal_company_name,
          industry: d.industry,
          revenue: d.revenue,
          state: d.address_state,
          status: d.remarketing_status,
          last_updated: d.updated_at,
          days_inactive: Math.floor((Date.now() - new Date(d.updated_at).getTime()) / 86400000),
        }),
      ),
      total_stale: staleDealsList.length,
      total_deals_checked: deals.length,
      inactivity_threshold_days: days,
      message: `${staleDealsList.length} deals have had no activity in the last ${days} days`,
    },
  };
}
