/**
 * Hook for fetching standup meetings with their associated tasks.
 *
 * Uses the same FULL_SELECT join pattern as useDailyTaskQueries so that
 * DailyStandupTaskWithRelations is fully populated (assignee, deal, source_meeting).
 * Falls back to a minimal select if the FK joins fail (e.g. stale schema cache).
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { StandupMeeting, DailyStandupTaskWithRelations } from '@/types/daily-tasks';

export const STANDUP_MEETINGS_QUERY_KEY = 'standup-meetings-tracker';

// Full select matching useDailyTaskQueries.ts FULL_SELECT
const TASK_FULL_SELECT = `
  *,
  assignee:profiles!daily_standup_tasks_assignee_id_fkey(id, first_name, last_name, email),
  deal:deal_pipeline!daily_standup_tasks_deal_id_fkey(id, listing_id, listings(title, internal_company_name, ebitda), deal_stages(name)),
  source_meeting:standup_meetings(id, meeting_title, meeting_date, transcript_url)
`;

// Minimal select when FK joins fail
const TASK_MINIMAL_SELECT = `
  *,
  assignee:profiles!daily_standup_tasks_assignee_id_fkey(id, first_name, last_name, email)
`;

export interface StandupMeetingWithTasks extends StandupMeeting {
  tasks: DailyStandupTaskWithRelations[];
  summary: string | null;
  key_points: string[] | null;
  attendees: string[];
}

export function useStandupMeetings(options?: { limit?: number }) {
  return useQuery({
    queryKey: [STANDUP_MEETINGS_QUERY_KEY, options],
    queryFn: async () => {
      // Fetch all meetings ordered by date descending
      const { data: meetings, error: meetingsError } = await supabase
        .from('standup_meetings' as never)
        .select('*')
        .order('meeting_date', { ascending: false })
        .limit(options?.limit || 50);

      if (meetingsError) throw meetingsError;
      if (!meetings || meetings.length === 0) return [];

      const meetingIds = (meetings as StandupMeeting[]).map((m) => m.id);

      // Fetch all tasks linked to these meetings with full relation joins.
      // Retry with minimal select on FK join failure (same pattern as useDailyTaskQueries).
      let taskData: DailyStandupTaskWithRelations[] = [];
      let selectClause = TASK_FULL_SELECT;
      let retried = false;

      while (true) {
        const { data, error } = await supabase
          .from('daily_standup_tasks' as never)
          .select(selectClause)
          .in('source_meeting_id', meetingIds)
          .order('priority_score', { ascending: false });

        if (error) {
          if (!retried) {
            console.warn(
              'Standup tasks full query failed, retrying with minimal select:',
              error.message,
            );
            selectClause = TASK_MINIMAL_SELECT;
            retried = true;
            continue;
          }
          throw error;
        }

        taskData = (data || []) as unknown as DailyStandupTaskWithRelations[];
        break;
      }

      // Group tasks by meeting
      const tasksByMeeting = new Map<string, DailyStandupTaskWithRelations[]>();
      for (const task of taskData) {
        const meetingId = task.source_meeting_id;
        if (!meetingId) continue; // defensive: skip tasks with null source_meeting_id
        if (!tasksByMeeting.has(meetingId)) {
          tasksByMeeting.set(meetingId, []);
        }
        tasksByMeeting.get(meetingId)!.push(task);
      }

      // Build result — every meeting shows even if it has zero tasks
      return (meetings as StandupMeeting[]).map((meeting) => {
        const meetingTasks = tasksByMeeting.get(meeting.id) || [];

        // Derive attendees from unique assignees
        const attendeeMap = new Map<string, string>();
        for (const t of meetingTasks) {
          if (t.assignee) {
            const name =
              `${t.assignee.first_name || ''} ${t.assignee.last_name || ''}`.trim() || 'Unknown';
            attendeeMap.set(t.assignee.id, name);
          }
        }

        // Derive key points from task titles grouped by assignee
        const keyPoints: string[] = [];
        const byAssignee = new Map<string, string[]>();
        for (const t of meetingTasks) {
          const name = t.assignee
            ? `${t.assignee.first_name || ''} ${t.assignee.last_name || ''}`.trim()
            : 'Unassigned';
          if (!byAssignee.has(name)) byAssignee.set(name, []);
          byAssignee.get(name)!.push(t.title);
        }
        for (const [name, titles] of byAssignee) {
          keyPoints.push(`${name}: ${titles.join('; ')}`);
        }

        // Build summary line
        const totalTasks = meetingTasks.length;
        const completedTasks = meetingTasks.filter((t) => t.status === 'completed').length;
        const overdueCount = meetingTasks.filter((t) => t.status === 'overdue').length;
        const pendingApproval = meetingTasks.filter(
          (t) => t.status === 'pending_approval',
        ).length;

        const summaryParts = [`${totalTasks} task${totalTasks !== 1 ? 's' : ''} assigned`];
        if (completedTasks > 0) summaryParts.push(`${completedTasks} completed`);
        if (overdueCount > 0) summaryParts.push(`${overdueCount} overdue`);
        if (pendingApproval > 0) summaryParts.push(`${pendingApproval} awaiting approval`);

        // Also add the extraction confidence from the meeting-level aggregate
        if (meeting.extraction_confidence_avg != null) {
          summaryParts.push(
            `${Number(meeting.extraction_confidence_avg).toFixed(0)}% extraction confidence`,
          );
        }

        return {
          ...meeting,
          tasks: meetingTasks,
          summary: totalTasks > 0 ? summaryParts.join(' · ') : 'No tasks extracted from this meeting',
          key_points: keyPoints.length > 0 ? keyPoints : null,
          attendees: Array.from(attendeeMap.values()),
        } as StandupMeetingWithTasks;
      });
    },
    staleTime: 60_000,
  });
}
