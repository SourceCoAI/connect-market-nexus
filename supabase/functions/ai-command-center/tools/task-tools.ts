/**
 * AI Command Center — Task Management Tools (v3.1)
 *
 * New tools for the enhanced task system: inbox, briefing, overdue,
 * buyer spotlight, snooze, confirm/dismiss AI tasks, comments.
 */

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;
import type { ClaudeTool } from '../../_shared/claude-client.ts';
import type { ToolResult } from './index.ts';

// ---------- Tool definitions ----------

export const taskTools: ClaudeTool[] = [
  {
    name: 'get_task_inbox',
    description: `Get the user's task inbox with filtering. Returns tasks assigned to the user grouped by status.
Use when the user asks "what's on my plate?", "show my tasks", "task inbox", or "what do I need to do?"`,
    input_schema: {
      type: 'object',
      properties: {
        user_id: {
          type: 'string',
          description: 'User UUID. Use "CURRENT_USER" for the logged-in user.',
        },
        status_filter: {
          type: 'string',
          description:
            'Filter by status: "all", "open" (pending+in_progress+overdue), "overdue", "snoozed", "completed" (default "open")',
        },
        entity_type: {
          type: 'string',
          description: 'Filter by entity type: "listing", "deal", "buyer", "contact"',
        },
        entity_id: {
          type: 'string',
          description: 'Filter by specific entity UUID',
        },
        priority: {
          type: 'string',
          description: 'Filter by priority: "high", "medium", "low"',
        },
        limit: {
          type: 'number',
          description: 'Max tasks to return (default 20)',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_daily_briefing',
    description: `Get a comprehensive daily briefing for the user. Returns:
- Overdue tasks (sorted by days overdue)
- Due today (sorted by priority)
- Due this week (top 5)
- AI tasks pending review
- Buyer spotlight (overdue contacts)
- Unacknowledged critical signals
- Recent new leads and connections
- Day-of-week context (Monday = start of week, Friday = end of week)
Use when the user asks for "daily briefing", "morning briefing", "what should I focus on today?", "Monday briefing", "start my day"`,
    input_schema: {
      type: 'object',
      properties: {
        user_id: {
          type: 'string',
          description: 'User UUID. Use "CURRENT_USER" for the logged-in user.',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_overdue_tasks',
    description:
      'Get all overdue tasks for a user, with aging tier classification. Use when user asks "what\'s overdue?"',
    input_schema: {
      type: 'object',
      properties: {
        user_id: {
          type: 'string',
          description: 'User UUID. Use "CURRENT_USER" for the logged-in user.',
        },
        limit: { type: 'number', description: 'Max results (default 20)' },
      },
      required: [],
    },
  },
  {
    name: 'get_buyer_spotlight',
    description: `Get buyers overdue for contact based on cadence schedules. Ranked by buyer score and days overdue.
Use when user asks "which buyers need follow-up?", "buyer spotlight", "who haven't we contacted?"`,
    input_schema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Max results (default 15)' },
      },
      required: [],
    },
  },
  {
    name: 'get_deal_signals_summary',
    description:
      'Get unacknowledged deal signals, especially critical and warning signals. Use when user asks about "deal risks", "signals", "what should I be worried about?"',
    input_schema: {
      type: 'object',
      properties: {
        listing_id: { type: 'string', description: 'Filter by listing UUID' },
        signal_type: {
          type: 'string',
          description: 'Filter by type: "critical", "warning", "positive", "neutral"',
        },
        limit: { type: 'number', description: 'Max results (default 20)' },
      },
      required: [],
    },
  },
  {
    name: 'snooze_task',
    description: 'Snooze a task for a specified number of days. REQUIRES CONFIRMATION.',
    input_schema: {
      type: 'object',
      properties: {
        task_id: { type: 'string', description: 'The task UUID to snooze' },
        days: { type: 'number', description: 'Number of days to snooze (1-30)' },
      },
      required: ['task_id', 'days'],
    },
  },
  {
    name: 'confirm_ai_task',
    description:
      'Confirm an AI-suggested task, moving it to the active task list. Optionally set a due date.',
    input_schema: {
      type: 'object',
      properties: {
        task_id: { type: 'string', description: 'The AI task UUID to confirm' },
        due_date: {
          type: 'string',
          description: 'Due date in YYYY-MM-DD format (required if task has no due date)',
        },
      },
      required: ['task_id'],
    },
  },
  {
    name: 'dismiss_ai_task',
    description: 'Dismiss an AI-suggested task, removing it from the pending review queue.',
    input_schema: {
      type: 'object',
      properties: {
        task_id: { type: 'string', description: 'The AI task UUID to dismiss' },
      },
      required: ['task_id'],
    },
  },
  {
    name: 'create_task',
    description: `Create a new task linked to a deal, listing, buyer, or contact. The task will be created as PENDING APPROVAL — a human must review and approve it before it becomes active. REQUIRES CONFIRMATION.
Use when the user says "create a task", "add a follow-up", "remind me to", "schedule a task".
CRITICAL: Every task MUST be linked to an entity (deal, listing, buyer, or contact). If the user doesn't specify which entity, ask them.`,
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Task title — clear, actionable description' },
        description: { type: 'string', description: 'Optional task details' },
        task_type: {
          type: 'string',
          enum: [
            'contact_owner',
            'build_buyer_universe',
            'follow_up_with_buyer',
            'send_materials',
            'update_pipeline',
            'schedule_call',
            'nda_execution',
            'ioi_loi_process',
            'due_diligence',
            'buyer_qualification',
            'seller_relationship',
            'buyer_ic_followup',
            'other',
          ],
          description:
            'Task type (default "follow_up_with_buyer"). contact_owner=reach out to seller, follow_up_with_buyer=buyer follow-up, send_materials=memo/teaser/docs, schedule_call=calls, nda_execution=NDA, ioi_loi_process=IOI/LOI, due_diligence=DD, buyer_qualification=qualify buyers, seller_relationship=seller rapport, buyer_ic_followup=IC committee',
        },
        entity_type: {
          type: 'string',
          enum: ['listing', 'deal', 'buyer', 'contact'],
          description: 'REQUIRED — type of entity this task is linked to',
        },
        entity_id: {
          type: 'string',
          description: 'REQUIRED — UUID of the entity this task is linked to',
        },
        deal_reference: {
          type: 'string',
          description: 'Human-readable deal/entity name for display',
        },
        due_date: {
          type: 'string',
          description: 'Due date in YYYY-MM-DD format (default: tomorrow)',
        },
        priority: {
          type: 'string',
          enum: ['low', 'medium', 'high', 'urgent'],
          description: 'Task priority (default "medium")',
        },
        assignee_id: {
          type: 'string',
          description: 'User ID to assign to. Use "CURRENT_USER" for the logged-in user.',
        },
        secondary_entity_type: {
          type: 'string',
          enum: ['listing', 'deal', 'buyer', 'contact'],
          description: 'Optional secondary entity type (e.g., buyer on a deal task)',
        },
        secondary_entity_id: {
          type: 'string',
          description: 'Optional secondary entity UUID',
        },
      },
      required: ['title', 'entity_type', 'entity_id'],
    },
  },
  {
    name: 'add_task_comment',
    description: 'Add a comment to a task for team discussion.',
    input_schema: {
      type: 'object',
      properties: {
        task_id: { type: 'string', description: 'The task UUID' },
        body: { type: 'string', description: 'Comment text' },
      },
      required: ['task_id', 'body'],
    },
  },
  {
    name: 'bulk_reassign_tasks',
    description:
      'Reassign all open tasks from one user to another. REQUIRES CONFIRMATION. Use when someone is out or responsibilities shift.',
    input_schema: {
      type: 'object',
      properties: {
        from_user_id: { type: 'string', description: 'Current assignee UUID' },
        to_user_id: { type: 'string', description: 'New assignee UUID' },
      },
      required: ['from_user_id', 'to_user_id'],
    },
  },
];

// ---------- Executor ----------

export async function executeTaskTool(
  supabase: SupabaseClient,
  toolName: string,
  args: Record<string, unknown>,
  userId: string,
): Promise<ToolResult> {
  switch (toolName) {
    case 'get_task_inbox':
      return getTaskInbox(supabase, args, userId);
    case 'get_daily_briefing':
      return getDailyBriefing(supabase, args, userId);
    case 'get_overdue_tasks':
      return getOverdueTasks(supabase, args, userId);
    case 'get_buyer_spotlight':
      return getBuyerSpotlight(supabase, args);
    case 'get_deal_signals_summary':
      return getDealSignalsSummary(supabase, args);
    case 'snooze_task':
      return snoozeTask(supabase, args, userId);
    case 'create_task':
      return createTask(supabase, args, userId);
    case 'confirm_ai_task':
      return confirmAITask(supabase, args, userId);
    case 'dismiss_ai_task':
      return dismissAITask(supabase, args, userId);
    case 'add_task_comment':
      return addTaskComment(supabase, args, userId);
    case 'bulk_reassign_tasks':
      return bulkReassignTasks(supabase, args, userId);
    default:
      return { error: `Unknown task tool: ${toolName}` };
  }
}

// ---------- Tool Implementations ----------

async function getTaskInbox(
  supabase: SupabaseClient,
  args: Record<string, unknown>,
  userId: string,
): Promise<ToolResult> {
  const targetUserId = (args.user_id as string) || userId;
  const statusFilter = (args.status_filter as string) || 'open';
  const limit = (args.limit as number) || 20;

  let query = supabase
    .from('daily_standup_tasks')
    .select(
      'id, title, task_type, status, due_date, priority, priority_score, entity_type, entity_id, source, buyer_deal_score, snoozed_until, deal_reference, assignee_id',
    )
    .eq('assignee_id', targetUserId)
    .order('due_date', { ascending: true })
    .order('priority_score', { ascending: false })
    .limit(limit);

  if (statusFilter === 'open') {
    query = query.in('status', ['pending', 'pending_approval', 'in_progress', 'overdue']);
  } else if (statusFilter !== 'all') {
    query = query.eq('status', statusFilter);
  }

  if (args.entity_type) query = query.eq('entity_type', args.entity_type);
  if (args.entity_id) query = query.eq('entity_id', args.entity_id);
  if (args.priority) query = query.eq('priority', args.priority);

  const { data, error } = await query;
  if (error) return { error: error.message };

  const overdue = (data || []).filter((t: { status: string }) => t.status === 'overdue');

  return {
    data: {
      total: (data || []).length,
      overdue_count: overdue.length,
      tasks: data || [],
    },
  };
}

async function getDailyBriefing(
  supabase: SupabaseClient,
  args: Record<string, unknown>,
  userId: string,
): Promise<ToolResult> {
  const targetUserId = (args.user_id as string) || userId;
  const today = new Date().toISOString().split('T')[0];
  const weekFromNow = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];

  // Day-of-week awareness
  const dayOfWeek = new Date().getDay(); // 0=Sunday, 1=Monday, ...
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const isMonday = dayOfWeek === 1;
  const isFriday = dayOfWeek === 5;

  // For Monday briefing, look back at weekend; otherwise look back 24h
  const lookbackDate = isMonday
    ? new Date(Date.now() - 3 * 86400000).toISOString()
    : new Date(Date.now() - 86400000).toISOString();

  // Parallel queries
  const [
    overdueRes,
    todayRes,
    weekRes,
    aiPendingRes,
    signalsRes,
    recentLeadsRes,
    recentConnectionsRes,
  ] = await Promise.all([
    // Overdue
    supabase
      .from('daily_standup_tasks')
      .select('id, title, task_type, due_date, priority, deal_reference, entity_type')
      .eq('assignee_id', targetUserId)
      .eq('status', 'overdue')
      .order('due_date', { ascending: true })
      .limit(10),
    // Due today
    supabase
      .from('daily_standup_tasks')
      .select('id, title, task_type, due_date, priority, deal_reference, buyer_deal_score')
      .eq('assignee_id', targetUserId)
      .eq('due_date', today)
      .in('status', ['pending', 'in_progress'])
      .order('priority_score', { ascending: false })
      .limit(10),
    // Due this week
    supabase
      .from('daily_standup_tasks')
      .select('id, title, task_type, due_date, priority, deal_reference')
      .eq('assignee_id', targetUserId)
      .gt('due_date', today)
      .lte('due_date', weekFromNow)
      .in('status', ['pending', 'in_progress'])
      .order('due_date', { ascending: true })
      .limit(5),
    // AI tasks pending review (scoped to user's assigned tasks)
    supabase
      .from('daily_standup_tasks')
      .select(
        'id, title, task_type, ai_relevance_score, ai_confidence, expires_at, entity_type, deal_reference',
      )
      .eq('assignee_id', targetUserId)
      .eq('source', 'ai')
      .is('confirmed_at', null)
      .is('dismissed_at', null)
      .limit(10),
    // Unacknowledged critical signals
    supabase
      .from('rm_deal_signals')
      .select('id, signal_type, signal_category, summary, listing_id, created_at')
      .in('signal_type', ['critical', 'warning'])
      .is('acknowledged_at', null)
      .order('created_at', { ascending: false })
      .limit(5),
    // Recent new leads (since last briefing lookback)
    supabase
      .from('inbound_leads')
      .select('id, company_name, contact_name, industry, created_at')
      .gte('created_at', lookbackDate)
      .order('created_at', { ascending: false })
      .limit(5),
    // Recent connection requests (since last briefing lookback)
    supabase
      .from('connection_requests')
      .select('id, buyer_profile_id, listing_id, status, created_at')
      .gte('created_at', lookbackDate)
      .order('created_at', { ascending: false })
      .limit(5),
  ]);

  return {
    data: {
      day_of_week: dayNames[dayOfWeek],
      is_monday: isMonday,
      is_friday: isFriday,
      overdue: overdueRes.data || [],
      due_today: todayRes.data || [],
      due_this_week: weekRes.data || [],
      ai_pending_review: aiPendingRes.data || [],
      unacknowledged_signals: signalsRes.data || [],
      recent_leads: recentLeadsRes.data || [],
      recent_connections: recentConnectionsRes.data || [],
      summary: {
        overdue_count: (overdueRes.data || []).length,
        due_today_count: (todayRes.data || []).length,
        due_this_week_count: (weekRes.data || []).length,
        ai_pending_count: (aiPendingRes.data || []).length,
        critical_signals_count: (signalsRes.data || []).length,
        recent_leads_count: (recentLeadsRes.data || []).length,
        recent_connections_count: (recentConnectionsRes.data || []).length,
      },
    },
  };
}

async function getOverdueTasks(
  supabase: SupabaseClient,
  args: Record<string, unknown>,
  userId: string,
): Promise<ToolResult> {
  const targetUserId = (args.user_id as string) || userId;
  const limit = (args.limit as number) || 20;

  const { data, error } = await supabase
    .from('daily_standup_tasks')
    .select('id, title, task_type, due_date, priority, deal_reference, entity_type, entity_id')
    .eq('assignee_id', targetUserId)
    .eq('status', 'overdue')
    .order('due_date', { ascending: true })
    .limit(limit);

  if (error) return { error: error.message };

  // Classify aging tiers
  const now = Date.now();
  const classified = (data || []).map((task: { due_date: string }) => {
    const daysOverdue = Math.floor(
      (now - new Date(task.due_date + 'T23:59:59').getTime()) / 86400000,
    );
    let tier = 'recent';
    if (daysOverdue >= 15) tier = 'abandoned';
    else if (daysOverdue >= 8) tier = 'critical';
    else if (daysOverdue >= 4) tier = 'aging';
    else if (daysOverdue >= 1) tier = 'recent';

    return { ...task, days_overdue: daysOverdue, aging_tier: tier };
  });

  return { data: { tasks: classified, total: classified.length } };
}

async function getBuyerSpotlight(
  supabase: SupabaseClient,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const limit = (args.limit as number) || 15;

  const { data, error } = await supabase
    .from('rm_buyer_deal_cadence')
    .select(
      `
      id, buyer_id, deal_id, deal_stage_name, expected_contact_days,
      last_contacted_at, is_active,
      buyers(company_name, buyer_type)
    `,
    )
    .eq('is_active', true)
    .order('last_contacted_at', { ascending: true, nullsFirst: true })
    .limit(limit);

  if (error) return { error: error.message };

  // Calculate overdue days
  const now = Date.now();
  const withOverdue = (data || []).map(
    (cadence: { last_contacted_at: string | null; expected_contact_days: number }) => {
      const neverContacted = !cadence.last_contacted_at;
      const lastContact = cadence.last_contacted_at
        ? new Date(cadence.last_contacted_at).getTime()
        : now; // Treat never-contacted as "overdue since today"
      const daysSinceContact = neverContacted
        ? cadence.expected_contact_days + 1 // Guaranteed overdue
        : Math.floor((now - lastContact) / 86400000);
      const daysOverdue = daysSinceContact - cadence.expected_contact_days;

      return {
        ...cadence,
        days_since_contact: daysSinceContact,
        days_overdue: daysOverdue,
        never_contacted: neverContacted,
      };
    },
  );

  // Sort: never-contacted first, then by days overdue descending
  const overdueBuyers = withOverdue
    .filter((b: { days_overdue: number }) => b.days_overdue > 0)
    .sort(
      (
        a: { never_contacted: boolean; days_overdue: number },
        b: { never_contacted: boolean; days_overdue: number },
      ) => {
        if (a.never_contacted && !b.never_contacted) return -1;
        if (!a.never_contacted && b.never_contacted) return 1;
        return b.days_overdue - a.days_overdue;
      },
    );

  return {
    data: {
      buyers: overdueBuyers,
      total: withOverdue.length,
    },
  };
}

async function getDealSignalsSummary(
  supabase: SupabaseClient,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const limit = (args.limit as number) || 20;

  let query = supabase
    .from('rm_deal_signals')
    .select(
      'id, signal_type, signal_category, summary, listing_id, deal_id, created_at, acknowledged_at',
    )
    .order('created_at', { ascending: false })
    .limit(limit);

  if (args.listing_id) query = query.eq('listing_id', args.listing_id);
  if (args.signal_type) query = query.eq('signal_type', args.signal_type);

  const { data, error } = await query;
  if (error) return { error: error.message };

  return { data: { signals: data || [], total: (data || []).length } };
}

async function snoozeTask(
  supabase: SupabaseClient,
  args: Record<string, unknown>,
  userId: string,
): Promise<ToolResult> {
  const taskId = args.task_id as string;
  const days = args.days as number;

  if (days < 1 || days > 30) return { error: 'Snooze days must be between 1 and 30' };

  const snoozedUntil = new Date(Date.now() + days * 86400000).toISOString().split('T')[0];

  const { error } = await supabase
    .from('daily_standup_tasks')
    .update({ status: 'snoozed', snoozed_until: snoozedUntil })
    .eq('id', taskId);

  if (error) return { error: error.message };

  // Log activity
  await supabase.from('rm_task_activity_log').insert({
    task_id: taskId,
    user_id: userId,
    action: 'snoozed',
    new_value: { snoozed_until: snoozedUntil, days },
  });

  return { data: { success: true, snoozed_until: snoozedUntil } };
}

async function createTask(
  supabase: SupabaseClient,
  args: Record<string, unknown>,
  userId: string,
): Promise<ToolResult> {
  const entityType = args.entity_type as string;
  const entityId = args.entity_id as string;

  if (!entityType || !entityId) {
    return {
      error:
        'entity_type and entity_id are required. Every task must be linked to a deal, listing, buyer, or contact.',
    };
  }

  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

  const insertData: Record<string, unknown> = {
    title: args.title as string,
    description: (args.description as string) || null,
    task_type: (args.task_type as string) || 'follow_up_with_buyer',
    entity_type: entityType,
    entity_id: entityId,
    deal_reference: (args.deal_reference as string) || null,
    due_date: (args.due_date as string) || tomorrow,
    priority: (args.priority as string) || 'medium',
    assignee_id: (args.assignee_id as string) || userId,
    secondary_entity_type: (args.secondary_entity_type as string) || null,
    secondary_entity_id: (args.secondary_entity_id as string) || null,
    source: 'chatbot',
    status: 'pending_approval', // AI-created tasks ALWAYS need human approval
    is_manual: false,
    priority_score: 50,
    extraction_confidence: 'high',
    needs_review: true,
    created_by: userId,
  };

  const { data, error } = await supabase
    .from('daily_standup_tasks')
    .insert(insertData)
    .select('id, title, status, entity_type, entity_id, due_date, assignee_id')
    .single();

  if (error) return { error: error.message };

  // Log activity
  await supabase.from('rm_task_activity_log').insert({
    task_id: data.id,
    user_id: userId,
    action: 'created',
    new_value: { source: 'chatbot', entity_type: entityType, entity_id: entityId },
  });

  return {
    data: {
      task: data,
      message: `Task "${data.title}" created and sent for approval. A team member must approve it before it becomes active.`,
      requires_approval: true,
    },
  };
}

async function confirmAITask(
  supabase: SupabaseClient,
  args: Record<string, unknown>,
  userId: string,
): Promise<ToolResult> {
  const taskId = args.task_id as string;
  const dueDate = args.due_date as string | undefined;

  const updates: Record<string, unknown> = {
    confirmed_at: new Date().toISOString(),
    status: 'pending',
  };
  if (dueDate) updates.due_date = dueDate;

  const { error } = await supabase.from('daily_standup_tasks').update(updates).eq('id', taskId);

  if (error) return { error: error.message };

  await supabase.from('rm_task_activity_log').insert({
    task_id: taskId,
    user_id: userId,
    action: 'confirmed',
  });

  return { data: { success: true, task_id: taskId } };
}

async function dismissAITask(
  supabase: SupabaseClient,
  args: Record<string, unknown>,
  userId: string,
): Promise<ToolResult> {
  const taskId = args.task_id as string;

  const { error } = await supabase
    .from('daily_standup_tasks')
    .update({ dismissed_at: new Date().toISOString(), status: 'cancelled' })
    .eq('id', taskId);

  if (error) return { error: error.message };

  await supabase.from('rm_task_activity_log').insert({
    task_id: taskId,
    user_id: userId,
    action: 'dismissed',
  });

  return { data: { success: true, task_id: taskId } };
}

async function addTaskComment(
  supabase: SupabaseClient,
  args: Record<string, unknown>,
  userId: string,
): Promise<ToolResult> {
  const taskId = args.task_id as string;
  const body = args.body as string;

  const { data, error } = await supabase
    .from('rm_task_comments')
    .insert({ task_id: taskId, user_id: userId, body })
    .select('id')
    .single();

  if (error) return { error: error.message };

  await supabase.from('rm_task_activity_log').insert({
    task_id: taskId,
    user_id: userId,
    action: 'commented',
    new_value: { body },
  });

  return { data: { success: true, comment_id: data.id } };
}

async function bulkReassignTasks(
  supabase: SupabaseClient,
  args: Record<string, unknown>,
  userId: string,
): Promise<ToolResult> {
  const fromUserId = args.from_user_id as string;
  const toUserId = args.to_user_id as string;

  // Get tasks to reassign
  const { data: tasks, error: fetchError } = await supabase
    .from('daily_standup_tasks')
    .select('id')
    .eq('assignee_id', fromUserId)
    .in('status', ['pending', 'pending_approval', 'in_progress', 'overdue']);

  if (fetchError) return { error: fetchError.message };
  if (!tasks || tasks.length === 0) return { data: { reassigned: 0 } };

  // Reassign all
  const { error: updateError } = await supabase
    .from('daily_standup_tasks')
    .update({ assignee_id: toUserId })
    .eq('assignee_id', fromUserId)
    .in('status', ['pending', 'pending_approval', 'in_progress', 'overdue']);

  if (updateError) return { error: updateError.message };

  // Log activity for each
  const logs = tasks.map((t: { id: string }) => ({
    task_id: t.id,
    user_id: userId,
    action: 'reassigned',
    old_value: { assignee_id: fromUserId },
    new_value: { assignee_id: toUserId },
  }));

  await supabase.from('rm_task_activity_log').insert(logs);

  return { data: { reassigned: tasks.length } };
}
