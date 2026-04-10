/* eslint-disable @typescript-eslint/no-explicit-any -- Supabase client used with untyped tables */
/**
 * Content Generation Tools
 * Meeting prep briefs, outreach email drafts, pipeline reports.
 * These tools gather data and return structured content for Claude to synthesize.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
type SupabaseClient = ReturnType<typeof createClient>;
import type { ClaudeTool } from '../../_shared/claude-client.ts';
import type { ToolResult } from './index.ts';

// ---------- Tool definitions ----------

export const contentTools: ClaudeTool[] = [
  {
    name: 'generate_meeting_prep',
    description:
      'Gather all data needed for a meeting prep brief — deal details, buyer/counterparty profile, past meeting transcripts, open tasks, and scoring. Returns structured data that Claude synthesizes into a briefing.',
    input_schema: {
      type: 'object',
      properties: {
        deal_id: { type: 'string', description: 'The deal/listing UUID' },
        buyer_id: {
          type: 'string',
          description: 'The buyer UUID (if meeting is with a specific buyer)',
        },
        meeting_context: {
          type: 'string',
          description:
            'Brief context about the meeting (e.g. "First call with CEO", "NDA follow-up")',
        },
      },
      required: ['deal_id'],
    },
  },
  {
    name: 'draft_outreach_email',
    description:
      'Gather buyer and deal context needed to draft a personalized outreach email. Returns structured data that Claude uses to compose the email.',
    input_schema: {
      type: 'object',
      properties: {
        deal_id: { type: 'string', description: 'The deal/listing UUID' },
        buyer_id: { type: 'string', description: 'The target buyer UUID' },
        email_type: {
          type: 'string',
          enum: [
            'initial_outreach',
            'follow_up',
            'teaser_intro',
            'data_room_invite',
            'meeting_request',
          ],
          description: 'Type of email to draft',
        },
        tone: {
          type: 'string',
          enum: ['formal', 'warm', 'brief'],
          description: 'Email tone (default "warm")',
        },
      },
      required: ['deal_id', 'buyer_id'],
    },
  },
  {
    name: 'generate_eod_recap',
    description:
      'Gather data for an end-of-day or end-of-week recap — activities logged today/this week, tasks completed vs remaining, outreach sent and responses, deals that moved stages, and tomorrow\'s priorities. Returns structured data that Claude synthesizes into a summary. Use when the user asks "give me a recap", "what did I do today?", "end of day summary", or "weekly recap".',
    input_schema: {
      type: 'object',
      properties: {
        period: {
          type: 'string',
          enum: ['today', 'this_week', 'yesterday', 'last_week'],
          description: 'Recap period (default "today")',
        },
        user_id: {
          type: 'string',
          description: 'User UUID. Use "CURRENT_USER" for the logged-in user.',
        },
      },
      required: [],
    },
  },
  {
    name: 'generate_pipeline_report',
    description:
      'Gather comprehensive pipeline data for a weekly/monthly report. Returns aggregated metrics, deal status changes, and highlights.',
    input_schema: {
      type: 'object',
      properties: {
        period_days: {
          type: 'number',
          description: 'Report period in days (default 7 for weekly)',
        },
        include_details: {
          type: 'boolean',
          description: 'Include per-deal details (default false for summary)',
        },
      },
      required: [],
    },
  },
];

// ---------- Executor ----------

export async function executeContentTool(
  supabase: SupabaseClient,
  toolName: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  switch (toolName) {
    case 'generate_meeting_prep':
      return generateMeetingPrep(supabase, args);
    case 'draft_outreach_email':
      return draftOutreachEmail(supabase, args);
    case 'generate_eod_recap':
      return generateEodRecap(supabase, args);
    case 'generate_pipeline_report':
      return generatePipelineReport(supabase, args);
    default:
      return { error: `Unknown content tool: ${toolName}` };
  }
}

// ---------- Implementations ----------

async function generateMeetingPrep(
  supabase: SupabaseClient,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const dealId = args.deal_id as string;
  const buyerId = args.buyer_id as string | undefined;

  // Parallel fetch: deal + tasks + transcripts + (optional) buyer + score
  const queries: Promise<any>[] = [
    (supabase as any).from('listings').select('*').eq('id', dealId).single(),
    (supabase as any)
      .from('daily_standup_tasks')
      .select('id, title, status, priority, due_date, assignee_id')
      .eq('entity_type', 'deal')
      .eq('entity_id', dealId)
      .in('status', ['pending', 'in_progress', 'pending_approval'])
      .order('due_date', { ascending: true, nullsFirst: false })
      .limit(10),
    (supabase as any)
      .from('deal_transcripts')
      .select('id, title, call_date, extracted_data, meeting_attendees, duration_minutes')
      .eq('listing_id', dealId)
      .order('call_date', { ascending: false, nullsFirst: false })
      .limit(5),
    (supabase as any)
      .from('call_transcripts')
      .select('id, created_at, call_type, ceo_detected, key_quotes, extracted_insights')
      .eq('listing_id', dealId)
      .order('created_at', { ascending: false })
      .limit(5),
    (supabase as any)
      .from('deal_activities')
      .select('id, title, activity_type, description, created_at')
      .eq('deal_id', dealId)
      .order('created_at', { ascending: false })
      .limit(10),
  ];

  // Add buyer-specific queries if buyer is specified
  if (buyerId) {
    queries.push(
      (supabase as any).from('buyers').select('*').eq('id', buyerId).single(),
      (supabase as any)
        .from('remarketing_scores')
        .select('*')
        .eq('buyer_id', buyerId)
        .eq('listing_id', dealId)
        .single(),
      (supabase as any)
        .from('contacts')
        .select('*')
        .eq('remarketing_buyer_id', buyerId)
        .eq('archived', false)
        .order('is_primary_at_firm', { ascending: false }),
    );
  }

  const results = (await Promise.all(queries)) as Array<{
    data: unknown;
    error: { message: string } | null;
  }>;

  const [dealResult, tasksResult, transcriptsResult, callTranscriptsResult, activitiesResult] =
    results;
  const buyerResult = buyerId ? results[5] : null;
  const scoreResult = buyerId ? results[6] : null;
  const contactsResult = buyerId ? results[7] : null;

  if (dealResult.error) return { error: dealResult.error.message };

  return {
    data: {
      deal: dealResult.data,
      open_tasks: (tasksResult as { data: unknown[] }).data || [],
      recent_meetings: (transcriptsResult as { data: unknown[] }).data || [],
      call_transcripts: (callTranscriptsResult as { data: unknown[] }).data || [],
      recent_activities: (activitiesResult as { data: unknown[] }).data || [],
      buyer: buyerResult?.data || null,
      buyer_score: scoreResult?.data || null,
      buyer_contacts: (contactsResult as { data: unknown[] } | null)?.data || [],
      meeting_context: args.meeting_context || null,
    },
  };
}

async function draftOutreachEmail(
  supabase: SupabaseClient,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const dealId = args.deal_id as string;
  const buyerId = args.buyer_id as string;

  // Parallel fetch: deal + buyer + score + contacts + past outreach
  const [dealResult, buyerResult, scoreResult, contactsResult, accessResult] = await Promise.all([
    (supabase as any)
      .from('listings')
      .select(
        'id, title, industry, services, revenue, ebitda, location, address_state, geographic_states, executive_summary, investment_thesis, business_model, number_of_locations, full_time_employees',
      )
      .eq('id', dealId)
      .single(),
    (supabase as any)
      .from('buyers')
      .select(
        'id, company_name, pe_firm_name, buyer_type, target_services, target_geographies, target_revenue_min, target_revenue_max, thesis_summary, acquisition_appetite, business_summary',
      )
      .eq('id', buyerId)
      .single(),
    (supabase as any)
      .from('remarketing_scores')
      .select('composite_score, geography_score, service_score, size_score, fit_reasoning')
      .eq('buyer_id', buyerId)
      .eq('listing_id', dealId)
      .single(),
    (supabase as any)
      .from('contacts')
      .select('*')
      .eq('remarketing_buyer_id', buyerId)
      .eq('archived', false)
      .order('is_primary_at_firm', { ascending: false })
      .limit(3),
    (supabase as any)
      .from('deal_data_room_access')
      .select('buyer_name, buyer_email, granted_at, is_active')
      .eq('deal_id', dealId)
      .eq('buyer_id', buyerId),
  ]);

  if (dealResult.error) return { error: dealResult.error.message };
  if (buyerResult.error) return { error: buyerResult.error.message };

  return {
    data: {
      deal: dealResult.data,
      buyer: buyerResult.data,
      score: scoreResult.data || null,
      contacts: contactsResult.data || [],
      existing_access: accessResult.data || [],
      email_type: args.email_type || 'initial_outreach',
      tone: args.tone || 'warm',
    },
  };
}

async function generatePipelineReport(
  supabase: SupabaseClient,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const periodDays = Number(args.period_days) || 7;
  const includeDetails = args.include_details === true;
  const cutoffDate = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000).toISOString();

  // Parallel fetch: current pipeline + recent activities + recent scoring + data room grants
  const [dealsResult, activitiesResult, scoresResult, accessResult, tasksResult] =
    await Promise.all([
      (supabase as any)
        .from('listings')
        .select(
          'id, title, status, deal_source, industry, revenue, ebitda, deal_total_score, is_priority_target, remarketing_status, updated_at',
        )
        .is('deleted_at', null),
      (supabase as any)
        .from('deal_activities')
        .select('deal_id, activity_type, title, created_at')
        .gte('created_at', cutoffDate)
        .order('created_at', { ascending: false }),
      (supabase as any)
        .from('remarketing_scores')
        .select('buyer_id, listing_id, status, composite_score, updated_at')
        .gte('updated_at', cutoffDate),
      (supabase as any)
        .from('deal_data_room_access')
        .select('deal_id, buyer_name, granted_at, is_active')
        .gte('granted_at', cutoffDate),
      (supabase as any)
        .from('daily_standup_tasks')
        .select('entity_id, title, status, completed_at')
        .eq('entity_type', 'deal')
        .gte('created_at', cutoffDate),
    ]);

  const deals = dealsResult.data || [];
  const activities = activitiesResult.data || [];
  const scores = scoresResult.data || [];
  const accessGrants = accessResult.data || [];
  const tasks = tasksResult.data || [];

  // Aggregate metrics
  const byStatus: Record<string, number> = {};
  const bySource: Record<string, number> = {};
  let totalRevenue = 0;

  for (const d of deals as any[]) {
    byStatus[d.status] = (byStatus[d.status] || 0) + 1;
    bySource[d.deal_source || 'unknown'] = (bySource[d.deal_source || 'unknown'] || 0) + 1;
    totalRevenue += d.revenue || 0;
  }

  const activityByType: Record<string, number> = {};
  for (const a of activities as any[]) {
    activityByType[a.activity_type] = (activityByType[a.activity_type] || 0) + 1;
  }

  const scoreStatusChanges: Record<string, number> = {};
  for (const s of scores as any[]) {
    scoreStatusChanges[s.status] = (scoreStatusChanges[s.status] || 0) + 1;
  }

  return {
    data: {
      period_days: periodDays,
      period_start: cutoffDate,
      pipeline_snapshot: {
        total_deals: deals.length,
        by_status: byStatus,
        by_source: bySource,
        total_pipeline_revenue: totalRevenue,
        priority_count: deals.filter((d: { is_priority_target: boolean }) => d.is_priority_target)
          .length,
      },
      period_activity: {
        total_activities: activities.length,
        by_type: activityByType,
        unique_deals_active: new Set(activities.map((a: { deal_id: string }) => a.deal_id)).size,
      },
      scoring_activity: {
        scores_updated: scores.length,
        by_status: scoreStatusChanges,
      },
      data_room: {
        new_grants: accessGrants.length,
        unique_deals: new Set(accessGrants.map((a: { deal_id: string }) => a.deal_id)).size,
      },
      tasks: {
        created: tasks.length,
        completed: tasks.filter((t: { status: string }) => t.status === 'completed').length,
      },
      deal_details: includeDetails ? deals.slice(0, 50) : undefined,
    },
  };
}

async function generateEodRecap(
  supabase: SupabaseClient,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const period = (args.period as string) || 'today';
  const userId = args.user_id as string | undefined;

  const now = new Date();
  let startDate: Date;
  let endDate: Date = now;
  let periodLabel: string;

  switch (period) {
    case 'today':
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      periodLabel = 'Today';
      break;
    case 'yesterday': {
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      startDate = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate());
      endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      periodLabel = 'Yesterday';
      break;
    }
    case 'this_week': {
      const dayOfWeek = now.getDay();
      const monday = new Date(now);
      monday.setDate(monday.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
      startDate = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate());
      periodLabel = 'This Week';
      break;
    }
    case 'last_week': {
      const dayOfWeek = now.getDay();
      const thisMonday = new Date(now);
      thisMonday.setDate(thisMonday.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
      endDate = new Date(thisMonday.getFullYear(), thisMonday.getMonth(), thisMonday.getDate());
      startDate = new Date(endDate);
      startDate.setDate(startDate.getDate() - 7);
      periodLabel = 'Last Week';
      break;
    }
    default:
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      periodLabel = 'Today';
  }

  const startStr = startDate.toISOString();
  const endStr = endDate.toISOString();

  // Parallel: activities, tasks completed, tasks created, outreach, data room grants
  const queries: Promise<any>[] = [
    (() => {
      let q = (supabase as any)
        .from('deal_activities')
        .select('deal_id, activity_type, title, description, created_at')
        .gte('created_at', startStr)
        .lt('created_at', endStr)
        .order('created_at', { ascending: false })
        .limit(100);
      if (userId) q = q.eq('admin_id', userId);
      return q;
    })(),
    (() => {
      let q = (supabase as any)
        .from('daily_standup_tasks')
        .select('id, title, entity_id, priority, completed_at')
        .eq('status', 'completed')
        .gte('completed_at', startStr)
        .lt('completed_at', endStr)
        .order('completed_at', { ascending: false })
        .limit(50);
      if (userId) q = q.eq('completed_by', userId);
      return q;
    })(),
    (() => {
      let q = (supabase as any)
        .from('daily_standup_tasks')
        .select('id, title, entity_id, priority, due_date, status')
        .in('status', ['pending', 'in_progress', 'pending_approval', 'overdue'])
        .order('due_date', { ascending: true, nullsFirst: false })
        .limit(20);
      if (userId) q = q.eq('assignee_id', userId);
      return q;
    })(),
    (supabase as any)
      .from('outreach_records')
      .select('id, buyer_name, deal_id, stage, last_action_date')
      .gte('last_action_date', startStr)
      .lt('last_action_date', endStr)
      .order('last_action_date', { ascending: false })
      .limit(50),
    (supabase as any)
      .from('data_room_access')
      .select('deal_id, remarketing_buyer_id, granted_at')
      .gte('granted_at', startStr)
      .lt('granted_at', endStr)
      .limit(50),
    (() => {
      const q = (supabase as any)
        .from('contact_activities')
        .select('activity_type, call_outcome, talk_time_seconds, user_email')
        .gte('created_at', startStr)
        .lt('created_at', endStr)
        .limit(200);
      if (userId) {
        // Can't easily filter by user_id in contact_activities — skip user filter
      }
      return q;
    })(),

    // Email activity
    (supabase as any)
      .from('email_messages')
      .select('id, direction, subject, from_address, to_addresses, sent_at, deal_id, contact_id')
      .gte('sent_at', startStr)
      .lt('sent_at', endStr)
      .order('sent_at', { ascending: false })
      .limit(100),

    // Meeting transcripts linked
    (supabase as any)
      .from('deal_transcripts')
      .select('id, title, listing_id, source, duration_minutes, call_date, has_content')
      .gte('created_at', startStr)
      .lt('created_at', endStr)
      .order('created_at', { ascending: false })
      .limit(50),
  ];

  const [
    activitiesResult,
    completedTasksResult,
    openTasksResult,
    outreachResult,
    accessResult,
    callsResult,
    emailsResult,
    meetingsResult,
  ] = (await Promise.all(queries)) as Array<{
    data: unknown[] | null;
    error: { message: string } | null;
  }>;

  const activities = activitiesResult.data || [];
  const completedTasks = completedTasksResult.data || [];
  const openTasks = openTasksResult.data || [];
  const outreachUpdates = outreachResult.data || [];
  const accessGrants = accessResult.data || [];
  const calls = callsResult.data || [];
  const emailData = (emailsResult.data || []) as Array<{ id: string; direction: string; subject: string; sent_at: string }>;
  const meetingsData = (meetingsResult.data || []) as Array<{ id: string; title: string; source: string; duration_minutes: number; call_date: string }>;

  // Activity breakdown
  const actByType: Record<string, number> = {};
  for (const a of activities as Array<{ activity_type: string }>) {
    actByType[a.activity_type] = (actByType[a.activity_type] || 0) + 1;
  }

  // Call summary
  let totalCalls = 0;
  let connectedCalls = 0;
  let totalTalkTime = 0;
  for (const c of calls as Array<{
    activity_type: string;
    call_outcome: string;
    talk_time_seconds: number;
  }>) {
    if (c.activity_type === 'call_attempt' || c.activity_type === 'call_completed') totalCalls++;
    if (c.talk_time_seconds > 0) {
      connectedCalls++;
      totalTalkTime += c.talk_time_seconds;
    }
  }

  // Upcoming priorities (next 3 days)
  const threeDaysOut = new Date(now);
  threeDaysOut.setDate(threeDaysOut.getDate() + 3);
  const upcomingPriorities = (
    openTasks as Array<{ due_date: string | null; priority: string }>
  ).filter((t) => t.due_date && new Date(t.due_date) <= threeDaysOut);

  const overdueTasks = (openTasks as Array<{ due_date: string | null }>).filter(
    (t) => t.due_date && new Date(t.due_date) < now,
  );

  return {
    data: {
      period: periodLabel,
      period_start: startStr,
      period_end: endStr,
      activities: {
        total: activities.length,
        by_type: actByType,
        recent: (
          activities as Array<{
            deal_id: string;
            title: string;
            activity_type: string;
            created_at: string;
          }>
        )
          .slice(0, 10)
          .map((a) => ({
            deal_id: a.deal_id,
            title: a.title,
            type: a.activity_type,
            created_at: a.created_at,
          })),
      },
      tasks: {
        completed: completedTasks.length,
        completed_list: (
          completedTasks as Array<{
            title: string;
            entity_id: string;
            priority: string;
            completed_at: string;
          }>
        )
          .slice(0, 10)
          .map((t) => ({
            title: t.title,
            deal_id: t.entity_id,
            priority: t.priority,
          })),
        still_open: openTasks.length,
        overdue: overdueTasks.length,
      },
      outreach: {
        updates: outreachUpdates.length,
        by_stage: (() => {
          const stages: Record<string, number> = {};
          for (const o of outreachUpdates as Array<{ stage: string }>) {
            stages[o.stage] = (stages[o.stage] || 0) + 1;
          }
          return stages;
        })(),
      },
      calls: {
        total: totalCalls,
        connected: connectedCalls,
        total_talk_time_seconds: totalTalkTime,
      },
      emails: {
        total: emailData.length,
        sent: emailData.filter(e => e.direction === 'outbound').length,
        received: emailData.filter(e => e.direction === 'inbound').length,
        subjects: emailData.slice(0, 10).map(e => ({
          subject: e.subject,
          direction: e.direction,
          sent_at: e.sent_at,
        })),
      },
      meetings: {
        total: meetingsData.length,
        titles: meetingsData.slice(0, 10).map(m => ({
          title: m.title,
          source: m.source,
          duration_minutes: m.duration_minutes,
          date: m.call_date,
        })),
      },
      data_room_grants: accessGrants.length,
      priorities: {
        overdue_tasks: overdueTasks.length,
        upcoming_3_days: upcomingPriorities.length,
        upcoming_tasks: (
          upcomingPriorities as Array<{
            title: string;
            entity_id: string;
            due_date: string;
            priority: string;
          }>
        )
          .slice(0, 5)
          .map((t) => ({
            title: t.title,
            deal_id: t.entity_id,
            due_date: t.due_date,
            priority: t.priority,
          })),
      },
    },
  };
}
