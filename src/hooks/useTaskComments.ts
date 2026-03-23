/**
 * useTaskComments
 *
 * Queries and mutations for the rm_task_comments threaded discussion system.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { untypedFrom } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import type { TaskComment } from '@/types/daily-tasks';

const COMMENTS_KEY = 'task-comments';

export function useTaskComments(taskId: string | null) {
  return useQuery({
    queryKey: [COMMENTS_KEY, taskId],
    enabled: !!taskId,
    queryFn: async () => {
      const { data, error } = await untypedFrom('rm_task_comments')
        .select(
          `
          *,
          user:profiles!rm_task_comments_user_id_fkey(id, first_name, last_name, email)
        `,
        )
        .eq('task_id', taskId!)
        .order('created_at', { ascending: true });

      if (error) throw error;
      return (data || []) as unknown as TaskComment[];
    },
    staleTime: 15_000,
  });
}

export function useAddTaskComment() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ taskId, body }: { taskId: string; body: string }) => {
      const { data, error } = await untypedFrom('rm_task_comments')
        .insert({
          task_id: taskId,
          user_id: user?.id ?? '',
          body: body.trim(),
        })
        .select()
        .single();

      if (error) throw error;

      // Log activity
      await untypedFrom('rm_task_activity_log').insert({
        task_id: taskId,
        user_id: user?.id ?? '',
        action: 'commented',
        new_value: { body: body.trim() },
      });

      return data;
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: [COMMENTS_KEY, variables.taskId] });
    },
  });
}

export function useDeleteTaskComment() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ commentId, taskId }: { commentId: string; taskId: string }) => {
      const { error } = await untypedFrom('rm_task_comments').delete().eq('id', commentId);

      if (error) throw error;
      return taskId;
    },
    onSuccess: (taskId) => {
      qc.invalidateQueries({ queryKey: [COMMENTS_KEY, taskId] });
    },
  });
}
