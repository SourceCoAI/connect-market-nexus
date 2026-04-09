/**
 * Daily Tasks mutation hooks
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase, untypedFrom } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import type { DailyStandupTask, TaskStatus } from '@/types/daily-tasks';
import { logDealActivity } from '@/lib/deal-activity-logger';
import { DAILY_TASKS_QUERY_KEY } from './useDailyTaskQueries';

interface TaskRecord {
  id: string;
  title: string;
  description: string | null;
  priority: string | null;
  due_date: string | null;
  entity_type: string | null;
  entity_id: string | null;
  assignee_id: string | null;
  created_by: string | null;
  is_pinned: boolean;
  pinned_rank: number | null;
  priority_score: number;
  created_at: string;
}

// ─── Recompute ranks (shared helper) ───

export async function recomputeRanks() {
  const { data: tasks } = await supabase
    .from('daily_standup_tasks' as never)
    .select('id, priority_score, is_pinned, pinned_rank, created_at')
    .in('status', ['pending_approval', 'pending', 'in_progress', 'overdue'])
    .order('priority_score', { ascending: false })
    .order('created_at', { ascending: true });

  if (!tasks || tasks.length === 0) return;

  const totalTasks = tasks.length;

  // Separate pinned (with valid ranks within range) and unpinned
  const validPinned = (tasks as TaskRecord[]).filter(
    (t) => t.is_pinned && t.pinned_rank && t.pinned_rank <= totalTasks,
  );
  // Deduplicate: if two tasks have the same pinned_rank, only the first keeps the slot
  const pinnedSlots = new Map<number, string>();
  const pinnedTaskIds = new Set<string>();
  for (const p of validPinned) {
    if (!pinnedSlots.has(p.pinned_rank!)) {
      pinnedSlots.set(p.pinned_rank!, p.id);
      pinnedTaskIds.add(p.id);
    }
  }

  // Everyone not occupying a pinned slot goes into the unpinned pool (in score order)
  const unpinned = (tasks as TaskRecord[]).filter((t) => !pinnedTaskIds.has(t.id));

  const ranked: { id: string; rank: number }[] = [];
  let unpinnedIdx = 0;

  for (let rank = 1; rank <= totalTasks; rank++) {
    if (pinnedSlots.has(rank)) {
      ranked.push({ id: pinnedSlots.get(rank)!, rank });
    } else if (unpinnedIdx < unpinned.length) {
      ranked.push({ id: unpinned[unpinnedIdx].id, rank });
      unpinnedIdx++;
    }
  }

  if (ranked.length === 0) return;

  // Batched update: group tasks by the rank they should have and issue one
  // UPDATE per distinct rank using `in(id, ...)`. This collapses N queries
  // down to at most N network round-trips but executed as small batches.
  // For very small changes (common case, 1 task toggled) this is ~equivalent,
  // but it dramatically reduces latency when many tasks shift.
  // Issue updates in parallel so the cumulative latency is bounded by the
  // slowest single update rather than their sum.
  await Promise.all(
    ranked.map(({ id, rank }) =>
      supabase
        .from('daily_standup_tasks' as never)
        .update({ priority_rank: rank } as never)
        .eq('id', id),
    ),
  );
}

// ─── Complete/uncomplete a task ───

/** Compute the next due date for a recurring task based on its rule */
function computeNextDueDate(currentDueDate: string | null, rule: string): string {
  // Anchor to today if no current due date, otherwise anchor to the current due date
  const base = currentDueDate ? new Date(currentDueDate + 'T00:00:00') : new Date();
  switch (rule) {
    case 'daily':
      base.setDate(base.getDate() + 1);
      break;
    case 'weekly':
      base.setDate(base.getDate() + 7);
      break;
    case 'biweekly':
      base.setDate(base.getDate() + 14);
      break;
    case 'monthly':
      base.setMonth(base.getMonth() + 1);
      break;
    default:
      base.setDate(base.getDate() + 1);
  }
  return base.toISOString().split('T')[0];
}

interface RecurringTaskRecord extends TaskRecord {
  description: string | null;
  task_type: string;
  recurrence_rule: string | null;
  recurrence_parent_id: string | null;
  tags: string[] | null;
  deal_reference: string | null;
  deal_id: string | null;
  secondary_entity_type: string | null;
  secondary_entity_id: string | null;
}

export function useToggleTaskComplete() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ taskId, completed }: { taskId: string; completed: boolean }) => {
      // Fetch task to check entity_type for deal activity logging and recurrence
      const { data: taskRaw } = await supabase
        .from('daily_standup_tasks' as never)
        .select(
          'id, title, description, task_type, entity_type, entity_id, created_by, ' +
            'recurrence_rule, recurrence_parent_id, due_date, priority, tags, ' +
            'deal_reference, deal_id, secondary_entity_type, secondary_entity_id, assignee_id',
        )
        .eq('id', taskId)
        .single();
      const task = taskRaw as (RecurringTaskRecord & { due_date: string | null; priority: string | null; assignee_id: string | null }) | null;

      const updates: Record<string, unknown> = completed
        ? {
            status: 'completed' as TaskStatus,
            completed_at: new Date().toISOString(),
            completed_by: user?.id,
            // Reset escalation so that if the task is later reopened, we don't
            // spam admins with a stale "7+ days overdue" state.
            escalation_level: 0,
            escalated_at: null,
          }
        : {
            status: 'pending' as TaskStatus,
            completed_at: null,
            completed_by: null,
          };

      const { error } = await supabase
        .from('daily_standup_tasks' as never)
        .update(updates as never)
        .eq('id', taskId);

      if (error) throw error;

      // Recurrence: when completing a recurring task, spawn the next occurrence
      if (completed && task?.recurrence_rule) {
        const nextDueDate = computeNextDueDate(task.due_date, task.recurrence_rule);
        const parentId = task.recurrence_parent_id || task.id;

        // Check if a future instance already exists to avoid duplicate generation
        const { data: existingFuture } = await supabase
          .from('daily_standup_tasks' as never)
          .select('id')
          .eq('recurrence_parent_id', parentId)
          .eq('due_date', nextDueDate)
          .in('status', ['pending_approval', 'pending', 'in_progress', 'overdue', 'snoozed'])
          .limit(1);

        if (!existingFuture || existingFuture.length === 0) {
          const { error: insertErr } = await supabase
            .from('daily_standup_tasks' as never)
            .insert({
              title: task.title,
              description: task.description,
              task_type: task.task_type,
              assignee_id: task.assignee_id,
              entity_type: task.entity_type,
              entity_id: task.entity_id,
              secondary_entity_type: task.secondary_entity_type,
              secondary_entity_id: task.secondary_entity_id,
              deal_id: task.deal_id,
              deal_reference: task.deal_reference,
              tags: task.tags,
              priority: task.priority || 'medium',
              priority_score: 50,
              status: 'pending',
              due_date: nextDueDate,
              source: 'system',
              is_manual: false,
              needs_review: false,
              extraction_confidence: 'high',
              created_by: user?.id,
              recurrence_rule: task.recurrence_rule,
              recurrence_parent_id: parentId,
              auto_generated: true,
              generation_source: 'recurrence',
            } as never);
          if (insertErr) {
            console.error('Failed to spawn recurring task instance:', insertErr);
          }
        }
      }

      // Deal activity logging when completing a deal-linked task
      if (completed && task?.entity_type === 'deal' && task?.entity_id) {
        await logDealActivity({
          dealId: task.entity_id,
          activityType: 'task_completed',
          title: 'Task Completed',
          description: `Task "${task.title}" was marked as completed`,
          metadata: { task_id: taskId, task_title: task.title },
        });

        // Notify task creator if different from completer
        if (task.created_by && task.created_by !== user?.id) {
          try {
            const { data: dealData } = await supabase
              .from('deal_pipeline')
              .select('title')
              .eq('id', task.entity_id)
              .single();

            await supabase.from('admin_notifications').insert({
              admin_id: task.created_by,
              notification_type: 'task_completed',
              title: 'Task Completed',
              message: `Task "${task.title}" was marked as completed`,
              deal_id: task.entity_id,
              task_id: taskId,
              action_url: `/admin/deals/pipeline?deal=${task.entity_id}&tab=tasks`,
              metadata: {
                task_title: task.title,
                title: dealData?.title || 'Deal',
                completed_by: user?.id,
              },
            });
          } catch (notifError) {
            console.error('Failed to send task completion notification:', notifError);
          }
        }
      }

      // Recompute ranks whenever task status changes
      await recomputeRanks();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [DAILY_TASKS_QUERY_KEY] });
      qc.invalidateQueries({ queryKey: ['entity-tasks'] });
      qc.invalidateQueries({ queryKey: ['admin-notifications'] });
    },
  });
}

// ─── Approve a task (leadership only) ───

export function useApproveTask() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (taskId: string) => {
      const { error } = await supabase
        .from('daily_standup_tasks' as never)
        .update({
          status: 'pending' as TaskStatus,
          approved_by: user?.id,
          approved_at: new Date().toISOString(),
        } as never)
        .eq('id', taskId)
        .eq('status', 'pending_approval');

      if (error) throw error;

      // Log approval to activity log
      try {
        await untypedFrom('rm_task_activity_log').insert({
          task_id: taskId,
          user_id: user?.id ?? '',
          action: 'status_changed',
          old_value: { status: 'pending_approval' },
          new_value: { status: 'pending', approved_by: user?.id },
        });
      } catch (logErr) {
        console.error('Failed to log approval activity:', logErr);
      }

      // Notify assignee that their task is approved and ready to action
      try {
        const { data: taskRaw } = await supabase
          .from('daily_standup_tasks' as never)
          .select('id, title, assignee_id, entity_type, entity_id')
          .eq('id', taskId)
          .single();
        const task = taskRaw as TaskRecord | null;

        if (task?.assignee_id && task.assignee_id !== user?.id) {
          await supabase.from('admin_notifications').insert({
            admin_id: task.assignee_id,
            notification_type: 'task_approved',
            title: 'Task Approved',
            message: `Your task "${task.title}" has been approved and is ready to action`,
            deal_id: task.entity_type === 'deal' ? task.entity_id : null,
            task_id: taskId,
            action_url:
              task.entity_type === 'deal'
                ? `/admin/deals/pipeline?deal=${task.entity_id}&tab=tasks`
                : '/admin/daily-tasks',
            metadata: { task_title: task.title, approved_by: user?.id },
          });
        }
      } catch (notifErr) {
        console.error('Failed to send approval notification:', notifErr);
      }

      await recomputeRanks();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [DAILY_TASKS_QUERY_KEY] });
      qc.invalidateQueries({ queryKey: ['entity-tasks'] });
      qc.invalidateQueries({ queryKey: ['admin-notifications'] });
    },
  });
}

// ─── Approve all pending tasks at once (leadership only) ───

export function useApproveAllTasks() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async () => {
      // Fetch pending tasks before bulk-approving for activity logging & notifications
      const { data: pendingRaw } = await supabase
        .from('daily_standup_tasks' as never)
        .select('id, title, assignee_id, entity_type, entity_id')
        .eq('status', 'pending_approval');
      const pendingTasks = (pendingRaw || []) as TaskRecord[];

      const { error } = await supabase
        .from('daily_standup_tasks' as never)
        .update({
          status: 'pending' as TaskStatus,
          approved_by: user?.id,
          approved_at: new Date().toISOString(),
        } as never)
        .eq('status', 'pending_approval');

      if (error) throw error;

      // Log approval activity for each task
      if (pendingTasks.length > 0) {
        try {
          await untypedFrom('rm_task_activity_log').insert(
            pendingTasks.map((t) => ({
              task_id: t.id,
              user_id: user?.id ?? '',
              action: 'status_changed',
              old_value: { status: 'pending_approval' },
              new_value: { status: 'pending', approved_by: user?.id },
            })),
          );
        } catch (logErr) {
          console.error('Failed to log bulk approval activity:', logErr);
        }

        // Notify assignees
        try {
          const notifications = pendingTasks
            .filter((t) => t.assignee_id && t.assignee_id !== user?.id)
            .map((t) => ({
              admin_id: t.assignee_id!,
              notification_type: 'task_approved',
              title: 'Task Approved',
              message: `Your task "${t.title}" has been approved and is ready to action`,
              deal_id: t.entity_type === 'deal' ? t.entity_id : null,
              task_id: t.id,
              action_url: '/admin/daily-tasks',
              metadata: { task_title: t.title, approved_by: user?.id },
            }));

          if (notifications.length > 0) {
            await supabase.from('admin_notifications').insert(notifications);
          }
        } catch (notifErr) {
          console.error('Failed to send bulk approval notifications:', notifErr);
        }
      }

      await recomputeRanks();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [DAILY_TASKS_QUERY_KEY] });
      qc.invalidateQueries({ queryKey: ['entity-tasks'] });
      qc.invalidateQueries({ queryKey: ['admin-notifications'] });
    },
  });
}

// ─── Reassign a task ───

export function useReassignTask() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ taskId, newAssigneeId }: { taskId: string; newAssigneeId: string }) => {
      // Fetch task for deal activity logging and notifications
      const { data: taskRaw } = await supabase
        .from('daily_standup_tasks' as never)
        .select('id, title, description, priority, due_date, entity_type, entity_id, assignee_id')
        .eq('id', taskId)
        .single();
      const task = taskRaw as TaskRecord | null;

      const { error } = await supabase
        .from('daily_standup_tasks' as never)
        .update({ assignee_id: newAssigneeId, needs_review: false } as never)
        .eq('id', taskId);
      if (error) throw error;

      // Deal activity logging for reassignment of deal-linked tasks
      if (task?.entity_type === 'deal' && task?.entity_id) {
        await logDealActivity({
          dealId: task.entity_id,
          activityType: 'task_assigned',
          title: 'Task Reassigned',
          description: `Task "${task.title}" was reassigned`,
          metadata: {
            task_id: taskId,
            old_assignee: task.assignee_id,
            new_assignee: newAssigneeId,
          },
        });
      }

      // Send notification to new assignee if different from current user
      if (newAssigneeId !== user?.id && task) {
        try {
          const [{ data: assigneeProfile }, { data: assignerProfile }, { data: dealData }] =
            await Promise.all([
              supabase
                .from('profiles')
                .select('id, email, first_name, last_name')
                .eq('id', newAssigneeId)
                .single(),
              supabase
                .from('profiles')
                .select('first_name, last_name')
                .eq('id', user?.id ?? '')
                .single(),
              task.entity_type === 'deal'
                ? supabase.from('deal_pipeline').select('title').eq('id', task.entity_id!).single()
                : Promise.resolve({ data: null }),
            ]);

          if (assigneeProfile?.email) {
            await supabase.from('admin_notifications').insert({
              admin_id: newAssigneeId,
              notification_type: 'task_assigned',
              title: 'Task Assigned to You',
              message: `You have been assigned a task: ${task.title}`,
              deal_id: task.entity_type === 'deal' ? task.entity_id : null,
              task_id: taskId,
              action_url:
                task.entity_type === 'deal'
                  ? `/admin/deals/pipeline?deal=${task.entity_id}&tab=tasks`
                  : undefined,
              metadata: {
                task_title: task.title,
                title: dealData?.title || 'Task',
                assigned_by: user?.id,
                priority: task.priority,
              },
            });

            await supabase.functions.invoke('send-task-notification-email', {
              body: {
                assignee_email: assigneeProfile.email,
                assignee_name:
                  `${assigneeProfile.first_name} ${assigneeProfile.last_name}`.trim() ||
                  assigneeProfile.email,
                assigner_name: assignerProfile
                  ? `${assignerProfile.first_name} ${assignerProfile.last_name}`.trim()
                  : 'Admin',
                task_title: task.title,
                task_description: task.description,
                task_priority: task.priority || 'medium',
                task_due_date: task.due_date,
                title: dealData?.title || 'Task',
                deal_id: task.entity_type === 'deal' ? task.entity_id : undefined,
              },
            });
          }
        } catch (notifError) {
          console.error('Failed to send task reassignment notification:', notifError);
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [DAILY_TASKS_QUERY_KEY] });
      qc.invalidateQueries({ queryKey: ['entity-tasks'] });
      qc.invalidateQueries({ queryKey: ['admin-notifications'] });
    },
  });
}

// ─── Edit a task ───

export function useEditTask() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      taskId,
      updates,
    }: {
      taskId: string;
      updates: Partial<
        Pick<
          DailyStandupTask,
          'title' | 'description' | 'task_type' | 'due_date' | 'deal_id' | 'deal_reference' | 'tags'
        >
      >;
    }) => {
      // If the due_date is being pushed out to a future date, reset overdue
      // status and escalation level. The task is no longer overdue.
      const patchedUpdates: Record<string, unknown> = { ...updates };
      if (updates.due_date) {
        const today = new Date().toISOString().split('T')[0];
        if (updates.due_date > today) {
          patchedUpdates.escalation_level = 0;
          patchedUpdates.escalated_at = null;
          // Clear overdue status if present
          const { data: current } = await supabase
            .from('daily_standup_tasks' as never)
            .select('status')
            .eq('id', taskId)
            .single();
          if ((current as { status?: string } | null)?.status === 'overdue') {
            patchedUpdates.status = 'pending';
          }
        }
      }

      const { error } = await supabase
        .from('daily_standup_tasks' as never)
        .update(patchedUpdates as never)
        .eq('id', taskId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [DAILY_TASKS_QUERY_KEY] });
      qc.invalidateQueries({ queryKey: ['entity-tasks'] });
    },
  });
}

// ─── Add a manual task ───

export function useAddManualTask() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (
      task: Pick<
        DailyStandupTask,
        | 'title'
        | 'description'
        | 'assignee_id'
        | 'task_type'
        | 'due_date'
        | 'deal_id'
        | 'deal_reference'
        | 'tags'
      >,
    ) => {
      const { data, error } = await supabase
        .from('daily_standup_tasks' as never)
        .insert({
          ...task,
          is_manual: true,
          status: 'pending',
          priority_score: 50, // default mid-range for manual tasks
          extraction_confidence: 'high',
          needs_review: false,
        } as never)
        .select()
        .single();

      if (error) throw error;

      // Recompute ranks
      await recomputeRanks();

      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [DAILY_TASKS_QUERY_KEY] });
      qc.invalidateQueries({ queryKey: ['entity-tasks'] });
    },
  });
}

// ─── Delete a task ───

export function useDeleteTask() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (taskId: string) => {
      const { error } = await supabase
        .from('daily_standup_tasks' as never)
        .delete()
        .eq('id', taskId);
      if (error) throw error;
      await recomputeRanks();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [DAILY_TASKS_QUERY_KEY] });
      qc.invalidateQueries({ queryKey: ['entity-tasks'] });
    },
  });
}

// ─── Pin/unpin a task (leadership only) ───

export function usePinTask() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      taskId,
      rank,
      reason,
    }: {
      taskId: string;
      rank: number | null;
      reason?: string;
    }) => {
      const isPinning = rank !== null;

      // Update the task
      const { error } = await supabase
        .from('daily_standup_tasks' as never)
        .update({
          is_pinned: isPinning,
          pinned_rank: rank,
          pinned_by: isPinning ? user?.id : null,
          pinned_at: isPinning ? new Date().toISOString() : null,
          pin_reason: isPinning ? reason || null : null,
        } as never)
        .eq('id', taskId);
      if (error) throw error;

      // Log the action
      await untypedFrom('task_pin_log').insert({
        task_id: taskId,
        action: isPinning ? 'pinned' : 'unpinned',
        pinned_rank: rank,
        reason: reason || null,
        performed_by: user?.id ?? '',
      });

      await recomputeRanks();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [DAILY_TASKS_QUERY_KEY] });
      qc.invalidateQueries({ queryKey: ['entity-tasks'] });
    },
  });
}

// ─── Trigger extraction from a Fireflies transcript ───

export function useTriggerExtraction() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      fireflies_transcript_id?: string;
      transcript_text?: string;
      meeting_title?: string;
    }) => {
      const { data, error } = await supabase.functions.invoke('extract-standup-tasks', {
        body: params,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [DAILY_TASKS_QUERY_KEY] });
      qc.invalidateQueries({ queryKey: ['standup-meetings'] });
    },
  });
}
