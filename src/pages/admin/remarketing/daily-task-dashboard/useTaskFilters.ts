import { useMemo } from 'react';
import { getLocalDateString } from '@/lib/utils';
import type { DailyStandupTaskWithRelations } from '@/types/daily-tasks';
import { groupByOwner } from './utils';
import type { TaskGroup, TaskStats } from './types';

interface TaskFiltersInput {
  tasks: DailyStandupTaskWithRelations[] | undefined;
  entityFilter: 'all' | 'deal' | 'buyer';
  selectedMeeting: string | null;
  selectedTags: Set<string>;
  showCompleted: boolean;
}

interface TaskFiltersResult {
  pendingApprovalTasks: DailyStandupTaskWithRelations[];
  approvedTasks: DailyStandupTaskWithRelations[];
  overdueTasks: DailyStandupTaskWithRelations[];
  todayTasks: DailyStandupTaskWithRelations[];
  futureTasks: DailyStandupTaskWithRelations[];
  completedTasks: DailyStandupTaskWithRelations[];
  snoozedTasks: DailyStandupTaskWithRelations[];
  stats: TaskStats;
  pendingApprovalGroups: TaskGroup[];
  overdueGroups: TaskGroup[];
  todayGroups: TaskGroup[];
  futureGroups: TaskGroup[];
  completedGroups: TaskGroup[];
  snoozedGroups: TaskGroup[];
  distinctMeetings: Array<{ id: string; title: string; date: string | null; count: number }>;
}

export function useTaskFilters({
  tasks,
  entityFilter,
  selectedMeeting,
  selectedTags,
}: TaskFiltersInput): TaskFiltersResult {
  const today = getLocalDateString();

  // Entity filter helper
  const matchesEntityFilter = useMemo(() => {
    if (entityFilter === 'all') return () => true;
    const dealTypes = new Set(['deal', 'listing']);
    const buyerTypes = new Set(['buyer', 'contact']);
    return (t: DailyStandupTaskWithRelations) => {
      const et = t.entity_type;
      if (entityFilter === 'deal') return !et || dealTypes.has(et);
      return buyerTypes.has(et);
    };
  }, [entityFilter]);

  // Distinct source meetings for the filter dropdown
  const distinctMeetings = useMemo(() => {
    if (!tasks) return [];
    const seen = new Map<string, { title: string; date: string | null; count: number }>();
    for (const t of tasks) {
      const sm = t.source_meeting;
      if (sm?.id && sm?.meeting_title) {
        if (!seen.has(sm.id)) {
          seen.set(sm.id, { title: sm.meeting_title, date: sm.meeting_date ?? null, count: 1 });
        } else {
          seen.get(sm.id)!.count++;
        }
      }
    }
    return Array.from(seen.entries())
      .map(([id, info]) => ({ id, title: info.title, date: info.date, count: info.count }))
      .sort((a, b) => {
        if (a.date && b.date) return b.date.localeCompare(a.date);
        if (a.date) return -1;
        if (b.date) return 1;
        return a.title.localeCompare(b.title);
      });
  }, [tasks]);

  // Combined filter: entity + meeting
  const matchesAllFilters = useMemo(() => {
    return (t: DailyStandupTaskWithRelations) => {
      if (!matchesEntityFilter(t)) return false;
      if (selectedMeeting && t.source_meeting?.id !== selectedMeeting) return false;
      return true;
    };
  }, [matchesEntityFilter, selectedMeeting]);

  // Separate tasks by approval status
  const pendingApprovalTasks = useMemo(() => {
    if (!tasks) return [];
    return tasks.filter((t) => t.status === 'pending_approval' && matchesAllFilters(t));
  }, [tasks, matchesAllFilters]);

  const approvedTasks = useMemo(() => {
    if (!tasks) return [];
    let filtered = tasks.filter((t) => t.status !== 'pending_approval' && matchesAllFilters(t));

    // Apply tag filter
    if (selectedTags.size > 0) {
      filtered = filtered.filter((t) => {
        const taskTags = (t as DailyStandupTaskWithRelations & { tags?: string[] }).tags;
        if (!taskTags || taskTags.length === 0) return false;
        return Array.from(selectedTags).some((tag) => taskTags.includes(tag));
      });
    }

    return filtered;
  }, [tasks, selectedTags, matchesAllFilters]);

  // Stats (only from approved tasks)
  const stats = useMemo(() => {
    if (!approvedTasks) return { total: 0, completed: 0, overdue: 0, pending: 0, in_progress: 0 };
    return {
      total: approvedTasks.length,
      completed: approvedTasks.filter((t) => t.status === 'completed').length,
      overdue: approvedTasks.filter((t) => t.status === 'overdue').length,
      pending: approvedTasks.filter((t) => t.status === 'pending').length,
      in_progress: approvedTasks.filter((t) => t.status === 'in_progress').length,
    };
  }, [approvedTasks]);

  // Overdue — explicitly separated from today
  const overdueTasks = useMemo(() => {
    return approvedTasks.filter(
      (t) => t.status === 'overdue',
    );
  }, [approvedTasks]);

  // Today — due today or no date, but NOT overdue
  const todayTasks = useMemo(() => {
    return approvedTasks.filter(
      (t) =>
        t.status !== 'completed' &&
        t.status !== 'snoozed' &&
        t.status !== 'overdue' &&
        ((t.due_date ?? '') <= today || !t.due_date),
    );
  }, [approvedTasks, today]);

  const futureTasks = useMemo(() => {
    return approvedTasks.filter(
      (t) =>
        !!t.due_date &&
        t.due_date > today &&
        t.status !== 'overdue' &&
        t.status !== 'completed' &&
        t.status !== 'snoozed',
    );
  }, [approvedTasks, today]);

  const completedTasks = useMemo(() => {
    return approvedTasks.filter((t) => t.status === 'completed');
  }, [approvedTasks]);

  const snoozedTasks = useMemo(() => {
    return approvedTasks.filter((t) => t.status === 'snoozed');
  }, [approvedTasks]);

  // Grouped views
  const pendingApprovalGroups = useMemo(
    () => groupByOwner(pendingApprovalTasks),
    [pendingApprovalTasks],
  );
  const overdueGroups = useMemo(() => groupByOwner(overdueTasks), [overdueTasks]);
  const todayGroups = useMemo(() => groupByOwner(todayTasks), [todayTasks]);
  const futureGroups = useMemo(() => groupByOwner(futureTasks), [futureTasks]);
  const completedGroups = useMemo(() => groupByOwner(completedTasks), [completedTasks]);
  const snoozedGroups = useMemo(() => groupByOwner(snoozedTasks), [snoozedTasks]);

  return {
    pendingApprovalTasks,
    approvedTasks,
    overdueTasks,
    todayTasks,
    futureTasks,
    completedTasks,
    snoozedTasks,
    stats,
    pendingApprovalGroups,
    overdueGroups,
    todayGroups,
    futureGroups,
    completedGroups,
    snoozedGroups,
    distinctMeetings,
  };
}
