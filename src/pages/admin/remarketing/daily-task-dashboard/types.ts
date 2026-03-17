import type { DailyStandupTaskWithRelations } from '@/types/daily-tasks';

export interface TaskGroup {
  assigneeId: string | null;
  assigneeName: string;
  tasks: DailyStandupTaskWithRelations[];
}

export interface TeamMember {
  id: string;
  name: string;
}

export interface TaskStats {
  total: number;
  completed: number;
  overdue: number;
  pending: number;
  in_progress: number;
}

export interface TaskHandlers {
  onEdit: (task: DailyStandupTaskWithRelations) => void;
  onReassign: (task: DailyStandupTaskWithRelations) => void;
  onPin: (task: DailyStandupTaskWithRelations) => void;
  onDelete: (task: DailyStandupTaskWithRelations) => void;
}
