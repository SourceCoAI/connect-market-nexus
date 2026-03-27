/**
 * useTaskActions — v3.1 task mutations
 *
 * Extends the existing useDailyTasks hooks with:
 * - Snooze/unsnooze
 * - Confirm/dismiss AI tasks
 * - Task templates
 * - Activity logging on mutations
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase, untypedFrom } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { addDays, format } from 'date-fns';
import type { TaskTemplateStage, TaskEntityType } from '@/types/daily-tasks';
import { logDealActivity } from '@/lib/deal-activity-logger';

const QUERY_KEY = 'daily-standup-tasks';
const ENTITY_TASKS_KEY = 'entity-tasks';

// ─── Snooze a task ───

export function useSnoozeTask() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ taskId, days }: { taskId: string; days: number }) => {
      const snoozedUntil = format(addDays(new Date(), days), 'yyyy-MM-dd');

      const { error } = await supabase
        .from('daily_standup_tasks' as never)
        .update({
          status: 'snoozed',
          snoozed_until: snoozedUntil,
        } as never)
        .eq('id', taskId);

      if (error) throw error;

      // Log activity
      await untypedFrom('rm_task_activity_log').insert({
        task_id: taskId,
        user_id: user?.id ?? '',
        action: 'snoozed',
        new_value: { snoozed_until: snoozedUntil, days },
      } as never);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [QUERY_KEY] });
      qc.invalidateQueries({ queryKey: [ENTITY_TASKS_KEY] });
    },
  });
}

// ─── Unsnooze a task ───

export function useUnsnoozeTask() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (taskId: string) => {
      const { error } = await supabase
        .from('daily_standup_tasks' as never)
        .update({
          status: 'pending',
          snoozed_until: null,
        } as never)
        .eq('id', taskId);

      if (error) throw error;

      await untypedFrom('rm_task_activity_log').insert({
        task_id: taskId,
        user_id: user?.id ?? '',
        action: 'status_changed',
        old_value: { status: 'snoozed' },
        new_value: { status: 'pending' },
      } as never);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [QUERY_KEY] });
      qc.invalidateQueries({ queryKey: [ENTITY_TASKS_KEY] });
    },
  });
}

// ─── Confirm an AI-suggested task ───

export function useConfirmAITask() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ taskId, dueDate }: { taskId: string; dueDate?: string }) => {
      const updates: Record<string, unknown> = {
        confirmed_at: new Date().toISOString(),
        status: 'pending',
      };
      if (dueDate) updates.due_date = dueDate;

      const { error } = await supabase
        .from('daily_standup_tasks' as never)
        .update(updates as never)
        .eq('id', taskId);

      if (error) throw error;

      await untypedFrom('rm_task_activity_log').insert({
        task_id: taskId,
        user_id: user?.id ?? '',
        action: 'confirmed',
        new_value: updates,
      } as never);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [QUERY_KEY] });
      qc.invalidateQueries({ queryKey: [ENTITY_TASKS_KEY] });
    },
  });
}

// ─── Dismiss an AI-suggested task ───

export function useDismissAITask() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (taskId: string) => {
      const { error } = await supabase
        .from('daily_standup_tasks' as never)
        .update({
          dismissed_at: new Date().toISOString(),
          status: 'cancelled',
        } as never)
        .eq('id', taskId);

      if (error) throw error;

      await untypedFrom('rm_task_activity_log').insert({
        task_id: taskId,
        user_id: user?.id ?? '',
        action: 'dismissed',
      } as never);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [QUERY_KEY] });
      qc.invalidateQueries({ queryKey: [ENTITY_TASKS_KEY] });
    },
  });
}

// ─── Cancel a task ───

export function useCancelTask() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (taskId: string) => {
      const { error } = await supabase
        .from('daily_standup_tasks' as never)
        .update({ status: 'cancelled' } as never)
        .eq('id', taskId);

      if (error) throw error;

      await untypedFrom('rm_task_activity_log').insert({
        task_id: taskId,
        user_id: user?.id ?? '',
        action: 'cancelled',
      } as never);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [QUERY_KEY] });
      qc.invalidateQueries({ queryKey: [ENTITY_TASKS_KEY] });
    },
  });
}

// ─── Apply task template to a listing ───

export function useApplyTaskTemplate() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      listingId,
      assigneeId,
      template,
    }: {
      listingId: string;
      assigneeId: string;
      template: TaskTemplateStage;
    }) => {
      const createdTaskIds: string[] = [];

      for (const task of template.tasks) {
        const dueDate = format(addDays(new Date(), task.due_offset_days), 'yyyy-MM-dd');

        const insertData: Record<string, unknown> = {
          title: task.title,
          description: task.description || null,
          task_type: task.task_type,
          due_date: dueDate,
          assignee_id: assigneeId,
          // Use 'deal' to match migration 20260510 which standardized all
          // entity_type='listing' to 'deal' — keeps templates visible on the Deal Tasks tab
          entity_type: 'deal' as TaskEntityType,
          entity_id: listingId,
          source: 'template',
          priority: 'medium',
          status: 'pending',
          is_manual: false,
          priority_score: 50,
          extraction_confidence: 'high',
          needs_review: false,
          created_by: user?.id,
        };

        // Set depends_on from previously created task
        if (task.depends_on_index !== undefined && createdTaskIds[task.depends_on_index]) {
          insertData.depends_on = createdTaskIds[task.depends_on_index];
        }

        const { data, error } = await supabase
          .from('daily_standup_tasks' as never)
          .insert(insertData as never)
          .select('id')
          .single();

        if (error) throw error;
        createdTaskIds.push((data as Record<string, unknown>).id as string);

        // Log activity
        await untypedFrom('rm_task_activity_log').insert({
          task_id: (data as Record<string, unknown>).id as string,
          user_id: user?.id ?? '',
          action: 'created',
          new_value: { source: 'template', template_stage: template.name },
        });
      }

      return createdTaskIds;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [QUERY_KEY] });
      qc.invalidateQueries({ queryKey: [ENTITY_TASKS_KEY] });
    },
  });
}

// ─── Add task with entity linking (enhanced manual task) ───

export function useAddEntityTask() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (task: {
      title: string;
      description?: string | null;
      assignee_id?: string | null;
      task_type: string;
      due_date: string;
      priority?: string;
      entity_type: TaskEntityType;
      entity_id: string;
      secondary_entity_type?: TaskEntityType | null;
      secondary_entity_id?: string | null;
      deal_reference?: string | null;
      deal_id?: string | null;
    }) => {
      const { data, error } = await supabase
        .from('daily_standup_tasks' as never)
        .insert({
          title: task.title,
          description: task.description || null,
          assignee_id: task.assignee_id || null,
          task_type: task.task_type,
          due_date: task.due_date,
          priority: task.priority || 'medium',
          entity_type: task.entity_type,
          entity_id: task.entity_id,
          secondary_entity_type: task.secondary_entity_type || null,
          secondary_entity_id: task.secondary_entity_id || null,
          deal_reference: task.deal_reference || null,
          deal_id: task.deal_id || null,
          source: 'manual',
          is_manual: true,
          status: 'pending',
          priority_score: 50,
          extraction_confidence: 'high',
          needs_review: false,
          created_by: user?.id,
        } as never)
        .select()
        .single();

      if (error) throw error;

      // Log activity
      await untypedFrom('rm_task_activity_log').insert({
        task_id: (data as Record<string, unknown>).id as string,
        user_id: user?.id ?? '',
        action: 'created',
        new_value: { entity_type: task.entity_type, entity_id: task.entity_id },
      });

      // Deal activity logging when task is linked to a deal
      if (task.entity_type === 'deal' && task.entity_id) {
        await logDealActivity({
          dealId: task.entity_id,
          activityType: 'task_created',
          title: 'Task Created',
          description: `Task "${task.title}" was created`,
          metadata: {
            task_id: (data as Record<string, unknown>).id as string,
            task_title: task.title,
            priority: task.priority,
            assigned_to: task.assignee_id,
          },
        });
      }

      // Send notification if task is assigned to someone else
      if (task.assignee_id && task.assignee_id !== user?.id) {
        try {
          const { data: dealData } = task.entity_type === 'deal'
            ? await supabase.from('deal_pipeline').select('title').eq('id', task.entity_id).single()
            : { data: null };

          {
            await supabase.from('admin_notifications').insert({
              admin_id: task.assignee_id,
              notification_type: 'task_assigned',
              title: 'New Task Assigned',
              message: `You have been assigned a new task: ${task.title}`,
              deal_id: task.entity_type === 'deal' ? task.entity_id : null,
              task_id: (data as Record<string, unknown>).id as string,
              action_url:
                task.entity_type === 'deal'
                  ? `/admin/deals/pipeline?deal=${task.entity_id}&tab=tasks`
                  : undefined,
              metadata: {
                task_title: task.title,
                title: dealData?.title || task.deal_reference || 'Task',
                assigned_by: user?.id,
                priority: task.priority,
              },
            });

          }
        } catch (notifError) {
          // Don't fail task creation if notification fails
          console.error('Failed to send task assignment notification:', notifError);
        }
      }

      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [QUERY_KEY] });
      qc.invalidateQueries({ queryKey: [ENTITY_TASKS_KEY] });
      qc.invalidateQueries({ queryKey: ['admin-notifications'] });
    },
  });
}
