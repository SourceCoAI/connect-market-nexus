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

    // === SNOOZED TASK WAKE-UP ===
    // Find tasks where snoozed_until has passed and wake them up
    const { data: snoozedTasks } = await supabase
      .from('daily_standup_tasks')
      .select('id, title, assignee_id, deal_id, snoozed_until')
      .eq('status', 'snoozed')
      .lte('snoozed_until', new Date().toISOString());

    let wokenCount = 0;
    if (snoozedTasks?.length) {
      for (const task of snoozedTasks) {
        // Wake up the task
        await supabase
          .from('daily_standup_tasks')
          .update({ status: 'pending', snoozed_until: null })
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
        'id, title, assignee_id, deal_id, due_date, escalation_level, assignee:profiles!assignee_id(email, first_name, last_name)',
      )
      .in('status', ['pending', 'in_progress'])
      .lt('due_date', now)
      .order('due_date', { ascending: true });

    if (!overdueTasks?.length) {
      return new Response(
        JSON.stringify({ message: 'No overdue tasks', count: 0, woken_tasks: wokenCount }),
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
      const assignee = task.assignee as any;
      const daysPastDue = Math.floor(
        (Date.now() - new Date(task.due_date).getTime()) / (1000 * 60 * 60 * 24),
      );

      // Level 0 -> 1: Notify assignee (1+ days overdue)
      if (task.escalation_level === 0 && daysPastDue >= 1 && assignee?.email) {
        const assigneeName =
          `${assignee.first_name || ''} ${assignee.last_name || ''}`.trim() || 'there';

        const emailHtml = wrapEmailHtml({
          bodyHtml: `
            <p>Hi ${assignee.first_name || 'there'},</p>
            <p>Your task <strong>"${task.title}"</strong> was due on ${task.due_date} and is now ${daysPastDue} day(s) overdue.</p>
            <p>Please complete it or update the status.</p>`,
          preheader: `Overdue task: ${task.title}`,
          recipientEmail: assignee.email,
        });

        const textContent = `Hi ${assignee.first_name || 'there'},\n\nYour task "${task.title}" was due on ${task.due_date} and is now ${daysPastDue} day(s) overdue.\n\nPlease complete it or update the status.`;

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

        await supabase
          .from('daily_standup_tasks')
          .update({ escalation_level: 1, escalated_at: new Date().toISOString() })
          .eq('id', task.id);

        notifiedCount++;
      }

      // Level 1 -> 2: Notify via user_notifications (3+ days overdue)
      if (task.escalation_level <= 1 && daysPastDue >= 3 && task.assignee_id) {
        await supabase.from('user_notifications').insert({
          user_id: task.assignee_id,
          notification_type: 'task_overdue',
          title: `Task ${daysPastDue} days overdue: ${task.title}`,
          message: `This task was due on ${task.due_date}. Please complete or reschedule.`,
          metadata: { task_id: task.id, deal_id: task.deal_id, days_past_due: daysPastDue },
        });

        await supabase
          .from('daily_standup_tasks')
          .update({ escalation_level: 2 })
          .eq('id', task.id);

        escalatedCount++;
      }

      // Level 2 -> 3: Alert all admins (7+ days overdue)
      if (task.escalation_level <= 2 && daysPastDue >= 7) {
        const { data: admins } = await supabase.from('profiles').select('id').eq('is_admin', true);

        if (admins) {
          for (const admin of admins) {
            await supabase.from('user_notifications').insert({
              user_id: admin.id,
              notification_type: 'task_overdue',
              title: `Task 7+ days overdue: ${task.title}`,
              message: `Assigned to ${assignee?.first_name || 'unknown'}, due ${task.due_date}`,
              metadata: {
                task_id: task.id,
                deal_id: task.deal_id,
                days_past_due: daysPastDue,
                assignee_id: task.assignee_id,
              },
            });
          }
        }

        await supabase
          .from('daily_standup_tasks')
          .update({ escalation_level: 3 })
          .eq('id', task.id);
      }
    }

    console.log(
      `Overdue check complete: ${overdueTasks.length} overdue, ${notifiedCount} notified, ${escalatedCount} escalated`,
    );

    return new Response(
      JSON.stringify({
        message: 'Overdue task check complete',
        overdue_count: overdueTasks.length,
        notified: notifiedCount,
        escalated: escalatedCount,
        woken_tasks: wokenCount,
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
