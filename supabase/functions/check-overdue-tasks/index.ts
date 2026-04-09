import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, corsPreflightResponse } from '../_shared/cors.ts';
import { sendEmail } from '../_shared/email-sender.ts';
import { wrapEmailHtml } from '../_shared/email-template-wrapper.ts';

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return corsPreflightResponse(req);
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const appBaseUrl =
      Deno.env.get('APP_BASE_URL') || 'https://marketplace.sourcecodeals.com';

    // === SNOOZED TASK WAKE-UP ===
    // Find tasks where snoozed_until has passed and wake them up.
    // Skip tasks whose deal is closed/archived — they're no longer relevant.
    const { data: snoozedTasks } = await supabase
      .from('daily_standup_tasks')
      .select('id, title, assignee_id, deal_id, entity_type, entity_id, snoozed_until')
      .eq('status', 'snoozed')
      .lte('snoozed_until', new Date().toISOString());

    let wokenCount = 0;
    let skippedSnoozedCount = 0;
    if (snoozedTasks?.length) {
      for (const task of snoozedTasks) {
        // Validate that the linked deal is still active before waking
        let dealIsActive = true;
        const dealIdToCheck =
          task.deal_id || (task.entity_type === 'deal' ? task.entity_id : null);
        if (dealIdToCheck) {
          const { data: deal } = await supabase
            .from('deal_pipeline')
            .select('id, deal_stages(name)')
            .eq('id', dealIdToCheck)
            .maybeSingle();
          if (!deal) {
            dealIsActive = false;
          } else {
            const stageName = (deal.deal_stages as { name?: string } | null)?.name?.toLowerCase() || '';
            if (stageName.includes('closed') || stageName.includes('lost') || stageName.includes('archived')) {
              dealIsActive = false;
            }
          }
        }

        if (!dealIsActive) {
          // Auto-cancel the task — the deal is no longer active
          await supabase
            .from('daily_standup_tasks')
            .update({ status: 'cancelled', snoozed_until: null })
            .eq('id', task.id);
          skippedSnoozedCount++;
          continue;
        }

        // Wake up the task
        await supabase
          .from('daily_standup_tasks')
          .update({
            status: 'pending',
            snoozed_until: null,
            // Reset escalation — task is fresh again
            escalation_level: 0,
            escalated_at: null,
          })
          .eq('id', task.id);

        // Notify the assignee
        if (task.assignee_id) {
          await supabase.from('user_notifications').insert({
            user_id: task.assignee_id,
            notification_type: 'task_assigned',
            title: `Snoozed task is back: ${task.title}`,
            message: `Your previously snoozed task "${task.title}" is now active again.`,
            metadata: { task_id: task.id, deal_id: task.deal_id },
          });
        }
        wokenCount++;
      }
    }

    // 1. Find overdue tasks
    const now = new Date().toISOString().split('T')[0];
    const { data: overdueTasks } = await supabase
      .from('daily_standup_tasks')
      .select(
        'id, title, assignee_id, deal_id, entity_type, entity_id, due_date, escalation_level, assignee:profiles!assignee_id(email, first_name, last_name)',
      )
      .in('status', ['pending', 'in_progress'])
      .lt('due_date', now)
      .order('due_date', { ascending: true });

    if (!overdueTasks?.length) {
      return new Response(
        JSON.stringify({
          message: 'No overdue tasks',
          count: 0,
          woken_tasks: wokenCount,
          skipped_snoozed: skippedSnoozedCount,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    // Update status to overdue
    const overdueIds = overdueTasks.map((t) => t.id);
    await supabase
      .from('daily_standup_tasks')
      .update({ status: 'overdue' })
      .in('id', overdueIds)
      .in('status', ['pending', 'in_progress']);

    let notifiedCount = 0;
    let escalatedCount = 0;

    for (const task of overdueTasks) {
      const assignee = task.assignee as {
        email?: string;
        first_name?: string;
        last_name?: string;
      } | null;
      const daysPastDue = Math.floor(
        (Date.now() - new Date(task.due_date).getTime()) / (1000 * 60 * 60 * 24),
      );

      // Level 0 -> 1: Notify assignee (1+ days overdue)
      // IMPORTANT: Update escalation_level BEFORE sending email to avoid
      // race conditions where a second cron run could re-send the email.
      if (task.escalation_level === 0 && daysPastDue >= 1 && assignee?.email) {
        const assigneeName =
          `${assignee.first_name || ''} ${assignee.last_name || ''}`.trim() || 'there';

        // Mark escalated first (transactional safety)
        const { error: updateErr } = await supabase
          .from('daily_standup_tasks')
          .update({ escalation_level: 1, escalated_at: new Date().toISOString() })
          .eq('id', task.id)
          .eq('escalation_level', 0); // Only update if still at level 0

        if (updateErr) {
          console.warn(`Failed to update escalation for task ${task.id}, skipping email`);
          continue;
        }

        const emailHtml = wrapEmailHtml({
          bodyHtml: `
            <p>Hi ${assignee.first_name || 'there'},</p>
            <p>Your task <strong>"${task.title}"</strong> was due on ${task.due_date} and is now ${daysPastDue} day(s) overdue.</p>
            <p>Please complete it or update the status.</p>
            <p style="margin: 24px 0 0; font-size: 11px; color: #9B9B9B;">
              <a href="${appBaseUrl}/admin/settings/notifications" style="color: #9B9B9B; text-decoration: underline;">Manage notification preferences</a>
            </p>`,
          preheader: `Overdue task: ${task.title}`,
          recipientEmail: assignee.email,
        });

        const textContent = `Hi ${assignee.first_name || 'there'},\n\nYour task "${task.title}" was due on ${task.due_date} and is now ${daysPastDue} day(s) overdue.\n\nPlease complete it or update the status.`;

        try {
          await sendEmail({
            templateName: 'task_overdue_reminder',
            to: assignee.email,
            toName: assigneeName,
            subject: `Overdue task: ${task.title}`,
            htmlContent: emailHtml,
            textContent,
            senderName: 'SourceCo',
            isTransactional: true,
            metadata: { taskId: task.id, dealId: task.deal_id, daysPastDue },
          });
        } catch (emailErr) {
          console.error(`Email send failed for task ${task.id}:`, emailErr);
          // Non-blocking — task is still marked escalated so we don't retry the email
        }

        notifiedCount++;
      }

      // Level 1 -> 2: Notify via user_notifications (3+ days overdue)
      if (task.escalation_level <= 1 && daysPastDue >= 3 && task.assignee_id) {
        const { error: updateErr } = await supabase
          .from('daily_standup_tasks')
          .update({ escalation_level: 2 })
          .eq('id', task.id)
          .lte('escalation_level', 1);

        if (!updateErr) {
          await supabase.from('user_notifications').insert({
            user_id: task.assignee_id,
            notification_type: 'task_overdue',
            title: `Task ${daysPastDue} days overdue: ${task.title}`,
            message: `This task was due on ${task.due_date}. Please complete or reschedule.`,
            metadata: { task_id: task.id, deal_id: task.deal_id, days_past_due: daysPastDue },
          });
          escalatedCount++;
        }
      }

      // Level 2 -> 3: Alert DEAL TEAM admins only (7+ days overdue).
      // Previously notified ALL admins — now filtered to deal team members
      // to reduce admin notification fatigue.
      if (task.escalation_level <= 2 && daysPastDue >= 7) {
        const { error: updateErr } = await supabase
          .from('daily_standup_tasks')
          .update({ escalation_level: 3 })
          .eq('id', task.id)
          .lte('escalation_level', 2);

        if (updateErr) continue;

        // Gather notification recipients: deal team members + owner role only
        const recipientIds = new Set<string>();

        // Add deal team members if task is linked to a deal
        const dealIdForTeam =
          task.deal_id || (task.entity_type === 'deal' ? task.entity_id : null);
        if (dealIdForTeam) {
          const { data: teamMembers } = await supabase
            .from('rm_deal_team')
            .select('user_id')
            .eq('deal_id', dealIdForTeam);
          for (const tm of teamMembers || []) {
            if (tm.user_id) recipientIds.add(tm.user_id);
          }
        }

        // Always also notify owners (small group, they're the buck-stops-here)
        const { data: owners } = await supabase
          .from('user_roles')
          .select('user_id')
          .in('role', ['owner']);
        for (const o of owners || []) {
          if (o.user_id) recipientIds.add(o.user_id);
        }

        // Fallback: if neither deal team nor owners are set, notify all admins
        if (recipientIds.size === 0) {
          const { data: admins } = await supabase
            .from('profiles')
            .select('id')
            .eq('is_admin', true);
          for (const a of admins || []) {
            if (a.id) recipientIds.add(a.id);
          }
        }

        const assigneeFirstName = assignee?.first_name || 'unknown';
        for (const recipientId of recipientIds) {
          await supabase.from('user_notifications').insert({
            user_id: recipientId,
            notification_type: 'task_overdue',
            title: `Task 7+ days overdue: ${task.title}`,
            message: `Assigned to ${assigneeFirstName}, due ${task.due_date}`,
            metadata: {
              task_id: task.id,
              deal_id: task.deal_id,
              days_past_due: daysPastDue,
              assignee_id: task.assignee_id,
            },
          });
        }
      }
    }

    console.log(
      `Overdue check complete: ${overdueTasks.length} overdue, ${notifiedCount} notified, ${escalatedCount} escalated, ${wokenCount} woken, ${skippedSnoozedCount} cancelled (dead deals)`,
    );

    return new Response(
      JSON.stringify({
        message: 'Overdue task check complete',
        overdue_count: overdueTasks.length,
        notified: notifiedCount,
        escalated: escalatedCount,
        woken_tasks: wokenCount,
        skipped_snoozed_dead_deals: skippedSnoozedCount,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('check-overdue-tasks error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
