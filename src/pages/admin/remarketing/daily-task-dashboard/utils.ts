import type { DailyStandupTaskWithRelations } from '@/types/daily-tasks';
import type { TaskGroup } from './types';

export function groupByOwner(tasks: DailyStandupTaskWithRelations[]): TaskGroup[] {
  const groups = new Map<string, TaskGroup>();

  for (const task of tasks) {
    const key = task.assignee_id || '__unassigned__';
    if (!groups.has(key)) {
      const name = task.assignee
        ? `${task.assignee.first_name || ''} ${task.assignee.last_name || ''}`.trim() || 'Unknown'
        : 'Unassigned';
      groups.set(key, { assigneeId: task.assignee_id, assigneeName: name, tasks: [] });
    }
    groups.get(key)!.tasks.push(task);
  }

  // Sort: assigned first (alphabetical), unassigned last
  return Array.from(groups.values()).sort((a, b) => {
    if (!a.assigneeId) return 1;
    if (!b.assigneeId) return -1;
    return a.assigneeName.localeCompare(b.assigneeName);
  });
}

export function getStatusColor(status: string) {
  switch (status) {
    case 'completed':
      return 'bg-green-100 text-green-800 border-green-200';
    case 'overdue':
      return 'bg-red-100 text-red-800 border-red-200';
    case 'in_progress':
      return 'bg-blue-100 text-blue-800 border-blue-200';
    case 'snoozed':
      return 'bg-slate-100 text-slate-800 border-slate-200';
    case 'pending_approval':
      return 'bg-amber-100 text-amber-800 border-amber-200';
    default:
      return 'bg-gray-100 text-gray-800 border-gray-200';
  }
}
