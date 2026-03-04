/**
 * Proactive Deal Alerts Tools (Feature 2)
 *
 * get_proactive_alerts — Analyzes current deal state and surfaces actionable alerts:
 *   stale deals, engagement gaps, score changes, overdue tasks, cold buyers,
 *   unprocessed transcripts, and unsigned fee agreements.
 *
 * dismiss_alert — Marks an alert as dismissed so it doesn't resurface.
 *
 * snooze_alert — Snoozes an alert for a specified number of days.
 *
 * Alerts are computed on-demand from live data rather than stored in a separate
 * table, ensuring freshness without requiring a cron job. Dismissed/snoozed
 * state is tracked in the admin_notifications table.
 */

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;
import type { ClaudeTool } from '../../_shared/claude-client.ts';
import type { ToolResult } from './index.ts';

// ---------- Tool definitions ----------

export const alertTools: ClaudeTool[] = [
  {
    name: 'get_proactive_alerts',
    description: `Get proactive deal alerts — surfaces issues that need attention across the pipeline.
Alert types:
- stale_deal: Deals with no activity in 14+ days
- cold_buyer: High-scoring buyers with no engagement in 90+ days
- overdue_tasks: Tasks past their due date
- unprocessed_transcript: Fireflies recordings not yet summarized
- unsigned_agreement: High-scoring buyers without fee agreements
- critical_signal: Unacknowledged critical/warning deal signals

USE WHEN: "any alerts?", "what needs attention?", "proactive alerts", "what's at risk?", "deal health check"
Returns prioritized alert list with severity (critical/warning/info), context, and suggested actions.`,
    input_schema: {
      type: 'object',
      properties: {
        deal_id: {
          type: 'string',
          description: 'Filter alerts to a specific deal/listing UUID',
        },
        severity: {
          type: 'string',
          enum: ['critical', 'warning', 'info', 'all'],
          description: 'Filter by severity level (default "all")',
        },
        alert_type: {
          type: 'string',
          description: 'Filter by alert type (e.g. "stale_deal", "cold_buyer")',
        },
        limit: {
          type: 'number',
          description: 'Max alerts to return (default 20)',
        },
      },
      required: [],
    },
  },
  {
    name: 'dismiss_alert',
    description: `Dismiss a proactive alert so it doesn't resurface. REQUIRES CONFIRMATION.
USE WHEN: "dismiss this alert", "I've handled this", "ignore this alert"`,
    input_schema: {
      type: 'object',
      properties: {
        alert_key: {
          type: 'string',
          description: 'The unique alert key (returned by get_proactive_alerts)',
        },
        reason: {
          type: 'string',
          description: 'Optional reason for dismissal',
        },
      },
      required: ['alert_key'],
    },
  },
  {
    name: 'snooze_alert',
    description: `Snooze a proactive alert for a specified number of days. REQUIRES CONFIRMATION.
USE WHEN: "snooze this alert", "remind me in 3 days", "not now"`,
    input_schema: {
      type: 'object',
      properties: {
        alert_key: {
          type: 'string',
          description: 'The unique alert key (returned by get_proactive_alerts)',
        },
        days: {
          type: 'number',
          description: 'Number of days to snooze (1-30, default 3)',
        },
      },
      required: ['alert_key'],
    },
  },
];

// ---------- Executor ----------

export async function executeAlertTool(
  supabase: SupabaseClient,
  toolName: string,
  args: Record<string, unknown>,
  userId: string,
): Promise<ToolResult> {
  switch (toolName) {
    case 'get_proactive_alerts':
      return getProactiveAlerts(supabase, args, userId);
    case 'dismiss_alert':
      return dismissAlert(supabase, args, userId);
    case 'snooze_alert':
      return snoozeAlert(supabase, args, userId);
    default:
      return { error: `Unknown alert tool: ${toolName}` };
  }
}

// ---------- Alert types ----------

interface ProactiveAlert {
  key: string;
  type: string;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  description: string;
  entity_type: string;
  entity_id: string;
  entity_name: string;
  suggested_action: string;
  data: Record<string, unknown>;
}

// ---------- Implementations ----------

async function getProactiveAlerts(
  supabase: SupabaseClient,
  args: Record<string, unknown>,
  userId: string,
): Promise<ToolResult> {
  const limit = Math.min(Number(args.limit) || 20, 50);
  const severityFilter = (args.severity as string) || 'all';
  const alertTypeFilter = args.alert_type as string | undefined;
  const dealIdFilter = args.deal_id as string | undefined;

  // 1. Load dismissed/snoozed alerts for this user
  const { data: dismissedData } = await supabase
    .from('admin_notifications')
    .select('metadata, read_at')
    .eq('admin_id', userId)
    .eq('notification_type', 'proactive_alert')
    .eq('is_read', true);

  const dismissedKeys = new Set<string>();
  const snoozedUntil = new Map<string, string>();

  for (const n of dismissedData || []) {
    const meta = n.metadata as Record<string, unknown> | null;
    if (!meta?.alert_key) continue;
    const key = meta.alert_key as string;
    if (meta.snoozed_until) {
      snoozedUntil.set(key, meta.snoozed_until as string);
    } else {
      dismissedKeys.add(key);
    }
  }

  const now = new Date();
  const nowIso = now.toISOString();

  // Helper to check if an alert is dismissed or snoozed
  const isFilteredOut = (key: string): boolean => {
    if (dismissedKeys.has(key)) return true;
    const snoozed = snoozedUntil.get(key);
    if (snoozed && snoozed > nowIso) return true;
    return false;
  };

  // 2. Build queries for each alert type — run in parallel
  const fourteenDaysAgo = new Date(Date.now() - 14 * 86400000).toISOString();
  const ninetyDaysAgo = new Date(Date.now() - 90 * 86400000).toISOString();

  // Build conditional queries based on filter
  const shouldFetch = (type: string) => !alertTypeFilter || alertTypeFilter === type;

  const staleQueryPromise = shouldFetch('stale_deal')
    ? (() => {
        let q = supabase
          .from('listings')
          .select('id, title, internal_company_name, updated_at, status')
          .in('status', ['active', 'new', 'under_review'])
          .lt('updated_at', fourteenDaysAgo)
          .order('updated_at', { ascending: true })
          .limit(10);
        if (dealIdFilter) q = q.eq('id', dealIdFilter);
        return q;
      })()
    : Promise.resolve({ data: null });

  const overdueQueryPromise = shouldFetch('overdue_tasks')
    ? supabase
        .from('daily_standup_tasks')
        .select('id, title, due_date, entity_type, entity_id, deal_reference')
        .eq('assignee_id', userId)
        .eq('status', 'overdue')
        .order('due_date', { ascending: true })
        .limit(10)
    : Promise.resolve({ data: null });

  const coldBuyerQueryPromise = shouldFetch('cold_buyer')
    ? (() => {
        let q = supabase
          .from('remarketing_scores')
          .select(
            `buyer_id, listing_id, composite_score,
             buyers!inner(company_name, buyer_type, has_fee_agreement)`,
          )
          .gte('composite_score', 70)
          .or('is_disqualified.eq.false,is_disqualified.is.null')
          .order('composite_score', { ascending: false })
          .limit(20);
        if (dealIdFilter) q = q.eq('listing_id', dealIdFilter);
        return q;
      })()
    : Promise.resolve({ data: null });

  const transcriptQueryPromise = shouldFetch('unprocessed_transcript')
    ? (() => {
        let q = supabase
          .from('deal_transcripts')
          .select('id, title, listing_id, created_at, duration_minutes, extracted_data')
          .eq('has_content', true)
          .order('created_at', { ascending: false })
          .limit(10);
        if (dealIdFilter) q = q.eq('listing_id', dealIdFilter);
        return q;
      })()
    : Promise.resolve({ data: null });

  const unsignedQueryPromise = shouldFetch('unsigned_agreement')
    ? (() => {
        let q = supabase
          .from('remarketing_scores')
          .select(
            `buyer_id, listing_id, composite_score,
             buyers!inner(company_name, has_fee_agreement)`,
          )
          .gte('composite_score', 75)
          .or('is_disqualified.eq.false,is_disqualified.is.null')
          .order('composite_score', { ascending: false })
          .limit(15);
        if (dealIdFilter) q = q.eq('listing_id', dealIdFilter);
        return q;
      })()
    : Promise.resolve({ data: null });

  const signalQueryPromise = shouldFetch('critical_signal')
    ? supabase
        .from('rm_deal_signals')
        .select('id, signal_type, signal_category, summary, listing_id, created_at')
        .in('signal_type', ['critical', 'warning'])
        .is('acknowledged_at', null)
        .order('created_at', { ascending: false })
        .limit(10)
    : Promise.resolve({ data: null });

  // Execute all queries in parallel
  const [
    { data: staleDeals },
    { data: overdueTasks },
    { data: highScorers },
    { data: transcripts },
    { data: unsignedScorers },
    { data: signals },
  ] = await Promise.all([
    staleQueryPromise,
    overdueQueryPromise,
    coldBuyerQueryPromise,
    transcriptQueryPromise,
    unsignedQueryPromise,
    signalQueryPromise,
  ]);

  const alerts: ProactiveAlert[] = [];

  // Stale deals
  if (staleDeals) {
    for (const deal of staleDeals) {
      const key = `stale_deal:${deal.id}`;
      if (isFilteredOut(key)) continue;

      const daysSinceUpdate = Math.floor(
        (Date.now() - new Date(deal.updated_at).getTime()) / 86400000,
      );

      alerts.push({
        key,
        type: 'stale_deal',
        severity: daysSinceUpdate >= 30 ? 'critical' : 'warning',
        title: `Stale deal: ${deal.internal_company_name || deal.title}`,
        description: `No activity in ${daysSinceUpdate} days. Last updated ${deal.updated_at.split('T')[0]}.`,
        entity_type: 'listing',
        entity_id: deal.id,
        entity_name: deal.internal_company_name || deal.title,
        suggested_action: 'Review deal status and update or archive',
        data: { days_since_update: daysSinceUpdate, last_updated: deal.updated_at },
      });
    }
  }

  // Overdue tasks
  if (overdueTasks) {
    for (const task of overdueTasks) {
      const key = `overdue_task:${task.id}`;
      if (isFilteredOut(key)) continue;

      const daysOverdue = Math.floor(
        (Date.now() - new Date(task.due_date + 'T23:59:59').getTime()) / 86400000,
      );

      alerts.push({
        key,
        type: 'overdue_tasks',
        severity: daysOverdue >= 7 ? 'critical' : 'warning',
        title: `Overdue: ${task.title}`,
        description: `${daysOverdue} days overdue. ${task.deal_reference ? `Related to ${task.deal_reference}.` : ''}`,
        entity_type: task.entity_type || 'task',
        entity_id: task.entity_id || task.id,
        entity_name: task.deal_reference || task.title,
        suggested_action: 'Complete, reschedule, or reassign this task',
        data: { task_id: task.id, days_overdue: daysOverdue },
      });
    }
  }

  // Cold high-scoring buyers — need secondary query for engagement check
  if (highScorers && highScorers.length > 0) {
    const buyerIds = highScorers.map((s: Record<string, unknown>) => s.buyer_id as string);

    const { data: recentEngagements } = await supabase
      .from('connection_requests')
      .select('buyer_profile_id')
      .in('buyer_profile_id', buyerIds)
      .gte('updated_at', ninetyDaysAgo);

    const engagedBuyers = new Set(
      (recentEngagements || []).map((e: Record<string, unknown>) => e.buyer_profile_id as string),
    );

    for (const scorer of highScorers) {
      if (engagedBuyers.has(scorer.buyer_id as string)) continue;

      const key = `cold_buyer:${scorer.buyer_id}:${scorer.listing_id}`;
      if (isFilteredOut(key)) continue;

      const buyer = scorer.buyers as Record<string, unknown>;
      alerts.push({
        key,
        type: 'cold_buyer',
        severity: scorer.composite_score >= 85 ? 'critical' : 'warning',
        title: `Cold buyer: ${buyer.company_name} (score ${scorer.composite_score})`,
        description: `High-scoring buyer with no engagement in 90+ days. ${buyer.has_fee_agreement ? 'Fee agreement signed.' : 'No fee agreement.'}`,
        entity_type: 'buyer',
        entity_id: scorer.buyer_id as string,
        entity_name: buyer.company_name as string,
        suggested_action: buyer.has_fee_agreement
          ? 'Send deal memo or schedule introduction call'
          : 'Initiate fee agreement and introductory outreach',
        data: {
          buyer_id: scorer.buyer_id,
          listing_id: scorer.listing_id,
          composite_score: scorer.composite_score,
          has_fee_agreement: buyer.has_fee_agreement,
        },
      });
    }
  }

  // Unprocessed transcripts
  if (transcripts) {
    const unprocessed = (transcripts as Array<Record<string, unknown>>).filter((t) => {
      const extracted = t.extracted_data as Record<string, unknown> | null;
      return !extracted?.ai_summarized_at;
    });

    for (const tx of unprocessed) {
      const key = `unprocessed_transcript:${tx.id}`;
      if (isFilteredOut(key)) continue;

      const daysSince = Math.floor(
        (Date.now() - new Date(tx.created_at as string).getTime()) / 86400000,
      );

      alerts.push({
        key,
        type: 'unprocessed_transcript',
        severity: 'info',
        title: `Unsummarized: ${tx.title || 'Meeting recording'}`,
        description: `${tx.duration_minutes ? `${tx.duration_minutes} min recording` : 'Recording'} from ${daysSince} days ago hasn't been summarized.`,
        entity_type: 'transcript',
        entity_id: tx.id as string,
        entity_name: (tx.title as string) || 'Meeting recording',
        suggested_action:
          'Use summarize_transcript_to_notes to create a deal note from this recording',
        data: {
          transcript_id: tx.id,
          listing_id: tx.listing_id,
          duration_minutes: tx.duration_minutes,
        },
      });
    }
  }

  // Unsigned agreements for high-scoring buyers
  if (unsignedScorers) {
    for (const scorer of unsignedScorers) {
      const buyer = scorer.buyers as Record<string, unknown>;
      if (buyer.has_fee_agreement) continue;

      const key = `unsigned_agreement:${scorer.buyer_id}`;
      if (isFilteredOut(key)) continue;

      alerts.push({
        key,
        type: 'unsigned_agreement',
        severity: scorer.composite_score >= 85 ? 'warning' : 'info',
        title: `No fee agreement: ${buyer.company_name} (score ${scorer.composite_score})`,
        description: `High-scoring buyer without a signed fee agreement.`,
        entity_type: 'buyer',
        entity_id: scorer.buyer_id as string,
        entity_name: buyer.company_name as string,
        suggested_action: 'Initiate fee agreement to unlock deal materials access',
        data: {
          buyer_id: scorer.buyer_id,
          listing_id: scorer.listing_id,
          composite_score: scorer.composite_score,
        },
      });
    }
  }

  // Unacknowledged critical signals
  if (signals) {
    for (const signal of signals) {
      if (dealIdFilter && signal.listing_id !== dealIdFilter) continue;
      const key = `critical_signal:${signal.id}`;
      if (isFilteredOut(key)) continue;

      alerts.push({
        key,
        type: 'critical_signal',
        severity: signal.signal_type === 'critical' ? 'critical' : 'warning',
        title: `${signal.signal_type === 'critical' ? 'Critical' : 'Warning'} signal: ${signal.signal_category || 'Deal issue'}`,
        description: signal.summary || 'Unacknowledged deal signal requires attention.',
        entity_type: 'listing',
        entity_id: signal.listing_id,
        entity_name: signal.signal_category || 'Deal',
        suggested_action: 'Review and acknowledge this signal',
        data: { signal_id: signal.id, signal_type: signal.signal_type },
      });
    }
  }

  // Apply severity filter
  let filteredAlerts = alerts;
  if (severityFilter !== 'all') {
    filteredAlerts = alerts.filter((a) => a.severity === severityFilter);
  }

  // Sort: critical first, then warning, then info
  const severityOrder: Record<string, number> = { critical: 0, warning: 1, info: 2 };
  filteredAlerts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  // Apply limit
  const finalAlerts = filteredAlerts.slice(0, limit);

  return {
    data: {
      alerts: finalAlerts,
      total: finalAlerts.length,
      by_severity: {
        critical: finalAlerts.filter((a) => a.severity === 'critical').length,
        warning: finalAlerts.filter((a) => a.severity === 'warning').length,
        info: finalAlerts.filter((a) => a.severity === 'info').length,
      },
      by_type: Object.entries(
        finalAlerts.reduce(
          (acc, a) => ({ ...acc, [a.type]: (acc[a.type] || 0) + 1 }),
          {} as Record<string, number>,
        ),
      ).map(([type, count]) => ({ type, count })),
    },
  };
}

async function dismissAlert(
  supabase: SupabaseClient,
  args: Record<string, unknown>,
  userId: string,
): Promise<ToolResult> {
  const alertKey = args.alert_key as string;
  const reason = (args.reason as string) || null;

  // Store dismissal in admin_notifications
  const { error } = await supabase.from('admin_notifications').insert({
    admin_id: userId,
    title: `Alert dismissed: ${alertKey}`,
    message: reason || 'Alert dismissed by user',
    notification_type: 'proactive_alert',
    is_read: true,
    read_at: new Date().toISOString(),
    metadata: {
      alert_key: alertKey,
      dismissed_at: new Date().toISOString(),
      reason,
    },
  });

  if (error) return { error: error.message };

  return {
    data: {
      success: true,
      alert_key: alertKey,
      message: `Alert dismissed. It will not appear again.`,
    },
  };
}

async function snoozeAlert(
  supabase: SupabaseClient,
  args: Record<string, unknown>,
  userId: string,
): Promise<ToolResult> {
  const alertKey = args.alert_key as string;
  const days = Math.min(Math.max(Number(args.days) || 3, 1), 30);
  const snoozedUntil = new Date(Date.now() + days * 86400000).toISOString();

  const { error } = await supabase.from('admin_notifications').insert({
    admin_id: userId,
    title: `Alert snoozed: ${alertKey}`,
    message: `Snoozed for ${days} days until ${snoozedUntil.split('T')[0]}`,
    notification_type: 'proactive_alert',
    is_read: true,
    read_at: new Date().toISOString(),
    metadata: {
      alert_key: alertKey,
      snoozed_until: snoozedUntil,
      snoozed_days: days,
    },
  });

  if (error) return { error: error.message };

  return {
    data: {
      success: true,
      alert_key: alertKey,
      snoozed_until: snoozedUntil,
      message: `Alert snoozed until ${snoozedUntil.split('T')[0]}. It will reappear after that date.`,
    },
  };
}
