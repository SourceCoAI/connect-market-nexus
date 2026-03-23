/**
 * useTaskActivityLog
 *
 * Queries for the rm_task_activity_log audit trail.
 */

import { useQuery } from '@tanstack/react-query';
import { untypedFrom } from '@/integrations/supabase/client';
import type { TaskActivityLogEntry } from '@/types/daily-tasks';

const ACTIVITY_LOG_KEY = 'task-activity-log';

export function useTaskActivityLog(taskId: string | null) {
  return useQuery({
    queryKey: [ACTIVITY_LOG_KEY, taskId],
    enabled: !!taskId,
    queryFn: async () => {
      const { data, error } = await untypedFrom('rm_task_activity_log')
        .select(
          `
          *,
          user:profiles!rm_task_activity_log_user_id_fkey(id, first_name, last_name)
        `,
        )
        .eq('task_id', taskId!)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      return (data || []) as unknown as TaskActivityLogEntry[];
    },
    staleTime: 30_000,
  });
}
