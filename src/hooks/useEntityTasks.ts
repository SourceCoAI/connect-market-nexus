/**
 * useEntityTasks
 *
 * Provides queries for fetching tasks linked to a specific entity
 * (listing, deal, buyer, or contact). Used by the Tasks tab on
 * entity detail pages.
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { DailyStandupTaskWithRelations, TaskEntityType } from '@/types/daily-tasks';

const ENTITY_TASKS_KEY = 'entity-tasks';

interface UseEntityTasksOptions {
  entityType: TaskEntityType;
  entityId: string;
  includeCompleted?: boolean;
}

export function useEntityTasks({
  entityType,
  entityId,
  includeCompleted = false,
}: UseEntityTasksOptions) {
  return useQuery({
    queryKey: [ENTITY_TASKS_KEY, entityType, entityId, includeCompleted],
    enabled: !!entityId,
    queryFn: async () => {
      let query = supabase
        .from('daily_standup_tasks' as never)
        .select(
          `
          *,
          assignee:profiles!daily_standup_tasks_assignee_id_fkey(id, first_name, last_name, email),
          deal:deal_pipeline!daily_standup_tasks_deal_id_fkey(id, listing_id, listings(title, internal_company_name, ebitda), deal_stages(name)),
          source_meeting:standup_meetings(id, meeting_title, meeting_date, transcript_url)
        `,
        )
        .eq('entity_type', entityType)
        .eq('entity_id', entityId)
        .order('priority_rank', { ascending: true, nullsFirst: false })
        .order('priority_score', { ascending: false })
        .order('created_at', { ascending: true });

      if (!includeCompleted) {
        query = query.in('status', [
          'pending_approval',
          'pending',
          'in_progress',
          'overdue',
          'snoozed',
        ]);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as unknown as DailyStandupTaskWithRelations[];
    },
    staleTime: 30_000,
  });
}

/**
 * Batch-fetch open task counts for a list of entity IDs.
 * Returns a Map<entityId, number> of pending task counts.
 * Designed for list views to avoid N+1 queries.
 */
export function useEntityTaskCounts(entityType: TaskEntityType, entityIds: string[]) {
  return useQuery({
    queryKey: [ENTITY_TASKS_KEY, 'counts', entityType, entityIds],
    enabled: entityIds.length > 0,
    queryFn: async () => {
      const counts = new Map<string, number>();
      for (let i = 0; i < entityIds.length; i += 100) {
        const chunk = entityIds.slice(i, i + 100);
        const { data, error } = await supabase
          .from('daily_standup_tasks' as never)
          .select('entity_id, status')
          .eq('entity_type', entityType)
          .in('entity_id', chunk)
          .in('status', ['pending', 'pending_approval', 'in_progress', 'overdue']);

        if (error) throw error;
        for (const row of (data || []) as { entity_id: string; status: string }[]) {
          counts.set(row.entity_id, (counts.get(row.entity_id) || 0) + 1);
        }
      }
      return counts;
    },
    staleTime: 30_000,
  });
}

/**
 * Fetch tasks where the entity is the secondary entity (e.g. tasks for a
 * buyer that are linked to deals but have the buyer as secondary_entity).
 */
export function useSecondaryEntityTasks({
  entityType,
  entityId,
  includeCompleted = false,
}: UseEntityTasksOptions) {
  return useQuery({
    queryKey: [ENTITY_TASKS_KEY, 'secondary', entityType, entityId, includeCompleted],
    enabled: !!entityId,
    queryFn: async () => {
      let query = supabase
        .from('daily_standup_tasks' as never)
        .select(
          `
          *,
          assignee:profiles!daily_standup_tasks_assignee_id_fkey(id, first_name, last_name, email),
          deal:deal_pipeline!daily_standup_tasks_deal_id_fkey(id, listing_id, listings(title, internal_company_name, ebitda), deal_stages(name)),
          source_meeting:standup_meetings(id, meeting_title, meeting_date, transcript_url)
        `,
        )
        .eq('secondary_entity_type', entityType)
        .eq('secondary_entity_id', entityId)
        .order('created_at', { ascending: false });

      if (!includeCompleted) {
        query = query.in('status', [
          'pending_approval',
          'pending',
          'in_progress',
          'overdue',
          'snoozed',
        ]);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as unknown as DailyStandupTaskWithRelations[];
    },
    staleTime: 30_000,
  });
}
