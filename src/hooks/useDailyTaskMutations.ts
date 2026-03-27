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

  // Batch update ranks
  for (const { id, rank } of ranked) {
    await supabase
      .from('daily_standup_tasks' as never)
      .update({ priority_rank: rank } as never)
      .eq('id', id);
  }
}

// ─── Complete/uncomplete a task ───

export function useToggleTaskComplete() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ taskId, completed }: { taskId: string; completed: boolean }) => {
      // Fetch task to check entity_type for deal activity logging
      const { data: taskRaw } = await supabase
        .from('daily_standup_tasks' as never)
        .select('id, title, entity_type, entity_id, created_by')
        .eq('id', taskId)
        .single();
      const task = taskRaw as TaskRecord | null;

      const updates: Record<string, unknown> = completed
        ? {
            status: 'completed' as TaskStatus,
            completed_at: new Date().toISOString(),
            completed_by: user?.id,
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
          const { data: dealData } = task.entity_type === 'deal'
            ? await supabase.from('deal_pipeline').select('title').eq('id', task.entity_id!).single()
            : { data: null };

          {
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
      const { error } = await supabase
        .from('daily_standup_tasks' as never)
        .update(updates as never)
        .eq('id', taskId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [DAILY_TASKS_QUERY_KEY] });
    },
  });
}

// ─── Add a manual task ───

export function useAddManualTask() {
  const qc = useQueryClient();
  const { user } = useAuth();

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
          created_by: user?.id,
        } as never)
        .select()
        .single();

      if (error) throw error;

      const taskId = (data as Record<string, unknown>).id as string;

      // Log activity for audit trail
      try {
        await untypedFrom('rm_task_activity_log').insert({
          task_id: taskId,
          user_id: user?.id ?? '',
          action: 'created',
          new_value: { source: 'manual', title: task.title },
        });
      } catch (logErr) {
        console.error('Failed to log manual task creation activity:', logErr);
      }

      // Send notification if task is assigned to someone other than the creator
      if (task.assignee_id && task.assignee_id !== user?.id) {
        try {
          {
            await supabase.from('admin_notifications').insert({
              admin_id: task.assignee_id,
              notification_type: 'task_assigned',
              title: 'New Task Assigned',
              message: `You have been assigned a new task: ${task.title}`,
              task_id: taskId,
              action_url: '/admin/daily-tasks',
              metadata: {
                task_title: task.title,
                title: task.deal_reference || 'Task',
                assigned_by: user?.id,
              },
            });

          }
        } catch (notifError) {
          // Don't fail task creation if notification fails
          console.error('Failed to send manual task assignment notification:', notifError);
        }
      }

      // Recompute ranks
      await recomputeRanks();

      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [DAILY_TASKS_QUERY_KEY] });
      qc.invalidateQueries({ queryKey: ['admin-notifications'] });
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
