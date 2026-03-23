import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, XCircle, UserRound } from 'lucide-react';
import { TaskCard } from '@/components/daily-tasks/TaskCard';
import type { DailyStandupTaskWithRelations } from '@/types/daily-tasks';
import type { TaskGroup } from './types';

interface PersonTaskGroupProps {
  group: TaskGroup;
  isLeadership: boolean;
  isPendingApproval?: boolean;
  onEdit: (task: DailyStandupTaskWithRelations) => void;
  onReassign: (task: DailyStandupTaskWithRelations) => void;
  onPin: (task: DailyStandupTaskWithRelations) => void;
  onDelete: (task: DailyStandupTaskWithRelations) => void;
  onApprove?: (taskId: string) => void;
  onDismiss?: (taskId: string) => void;
}

export function PersonTaskGroup({
  group,
  isLeadership,
  isPendingApproval,
  onEdit,
  onReassign,
  onPin,
  onDelete,
  onApprove,
  onDismiss,
}: PersonTaskGroupProps) {
  return (
    <Card>
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
              <UserRound className="h-4 w-4 text-primary" />
            </div>
            <CardTitle className="text-sm font-semibold">{group.assigneeName}</CardTitle>
            <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
              {group.tasks.length} {group.tasks.length === 1 ? 'task' : 'tasks'}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-1 space-y-2">
        {group.tasks.map((task) => (
          <div key={task.id} className="flex items-start gap-2">
            <div className="flex-1 min-w-0">
              <TaskCard
                task={task}
                isLeadership={isLeadership}
                onEdit={onEdit}
                onReassign={onReassign}
                onPin={onPin}
                onDelete={onDelete}
              />
            </div>
            {isPendingApproval && isLeadership && (
              <div className="flex gap-1 shrink-0 mt-2">
                {onApprove && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1 text-green-700 border-green-300 hover:bg-green-50"
                    onClick={() => onApprove(task.id)}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Approve
                  </Button>
                )}
                {onDismiss && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1 text-red-600 border-red-200 hover:bg-red-50"
                    onClick={() => onDismiss(task.id)}
                  >
                    <XCircle className="h-3.5 w-3.5" />
                    Dismiss
                  </Button>
                )}
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
