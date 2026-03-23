import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ShieldCheck } from 'lucide-react';
import type { DailyStandupTaskWithRelations } from '@/types/daily-tasks';
import { PersonTaskGroup } from './PersonTaskGroup';
import type { TaskGroup, TaskHandlers } from './types';

interface PendingApprovalSectionProps {
  pendingApprovalTasks: DailyStandupTaskWithRelations[];
  pendingApprovalGroups: TaskGroup[];
  approvedTasksCount: number;
  isLeadership: boolean;
  isApprovingAll: boolean;
  onApproveAll: () => void;
  onApproveTask: (taskId: string) => void;
  onDismissTask: (taskId: string) => void;
  taskHandlers: TaskHandlers;
}

export function PendingApprovalSection({
  pendingApprovalTasks,
  pendingApprovalGroups,
  approvedTasksCount,
  isLeadership,
  isApprovingAll,
  onApproveAll,
  onApproveTask,
  onDismissTask,
  taskHandlers,
}: PendingApprovalSectionProps) {
  if (pendingApprovalTasks.length === 0) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-amber-600" />
          <h3 className="text-sm font-semibold text-amber-800">Awaiting Approval</h3>
          <Badge variant="outline" className="border-amber-300 text-amber-700 text-[10px]">
            {pendingApprovalTasks.length} tasks
          </Badge>
        </div>
        {isLeadership && (
          <Button size="sm" onClick={onApproveAll} disabled={isApprovingAll} className="gap-1.5">
            <ShieldCheck className="h-4 w-4" />
            Approve All ({pendingApprovalTasks.length})
          </Button>
        )}
      </div>

      {/* Pending approval tasks grouped by person */}
      <div className="space-y-3">
        {pendingApprovalGroups.map((group) => (
          <PersonTaskGroup
            key={group.assigneeId || 'unassigned'}
            group={group}
            isLeadership={isLeadership}
            isPendingApproval
            onApprove={onApproveTask}
            onDismiss={onDismissTask}
            {...taskHandlers}
          />
        ))}
      </div>

      {/* Divider */}
      {approvedTasksCount > 0 && (
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t" />
          </div>
          <div className="relative flex justify-center">
            <span className="bg-background px-3 text-xs text-muted-foreground">Approved Tasks</span>
          </div>
        </div>
      )}
    </div>
  );
}
