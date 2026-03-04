/**
 * Daily Tasks query hooks
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import type { DailyStandupTaskWithRelations } from '@/types/daily-tasks';

export const DAILY_TASKS_QUERY_KEY = 'daily-standup-tasks';

// Full select with relation joins
// NOTE: The deals table was renamed to deal_pipeline (migration 20260506000000).
// PostgREST FK hints must use the current table name.
const FULL_SELECT = `
  *,
  assignee:profiles!daily_standup_tasks_assignee_id_fkey(id, first_name, last_name, email),
  deal:deal_pipeline!daily_standup_tasks_deal_id_fkey(id, listing_id, listings(title, internal_company_name, ebitda), deal_stages(name)),
  source_meeting:standup_meetings(id, meeting_title, meeting_date, transcript_url)
`;

// Minimal select without nested relation joins (fallback when FK joins fail)
const MINIMAL_SELECT = `
  *,
  assignee:profiles!daily_standup_tasks_assignee_id_fkey(id, first_name, last_name, email)
`;

// ─── Fetch tasks with relations ───

interface UseDailyTasksOptions {
  view: 'my' | 'all';
  includeCompleted?: boolean;
  dateFrom?: string | null;
  dateTo?: string | null;
}

export function useDailyTasks(options: UseDailyTasksOptions) {
  const { user } = useAuth();

  // Don't run the 'my' view query until the user is loaded — otherwise the
  // filter `.eq('assignee_id', user.id)` can't be applied and the query
  // either returns all tasks (leaking data) or returns nothing once the
  // correct key is set.
  const isMyView = options.view === 'my';

  return useQuery({
    queryKey: [DAILY_TASKS_QUERY_KEY, options, user?.id],
    enabled: !isMyView || !!user?.id,
    queryFn: async () => {
      // Mark overdue tasks first (fire-and-forget; don't block the query)
      supabase.rpc('mark_overdue_standup_tasks' as never).then(({ error }) => {
        if (error) console.warn('mark_overdue_standup_tasks RPC failed:', error.message);
      });

      // Try full select with all relation joins first
      let selectClause = FULL_SELECT;
      let retried = false;

      while (true) {
        let query = supabase
          .from('daily_standup_tasks' as never)
          .select(selectClause)
          .order('priority_rank', { ascending: true, nullsFirst: false })
          .order('priority_score', { ascending: false })
          .order('created_at', { ascending: true });

        if (isMyView && user?.id) {
          query = query.eq('assignee_id', user.id);
        }

        if (!options.includeCompleted) {
          query = query.in('status', ['pending_approval', 'pending', 'in_progress', 'overdue']);
        }

        if (options.dateFrom) {
          query = query.gte('due_date', options.dateFrom);
        }
        if (options.dateTo) {
          query = query.lte('due_date', options.dateTo);
        }

        const { data, error } = await query;

        if (error) {
          // If the full select failed (likely FK join issue), retry with minimal select
          if (!retried) {
            console.warn(
              'Daily tasks full query failed, retrying with minimal select:',
              error.message,
            );
            selectClause = MINIMAL_SELECT;
            retried = true;
            continue;
          }
          throw error;
        }

        return (data || []) as unknown as DailyStandupTaskWithRelations[];
      }
    },
    staleTime: 30_000,
  });
}
