import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertTriangle, ListChecks, Users, Plus, ShieldCheck, PauseCircle } from 'lucide-react';
import type { DailyStandupTaskWithRelations } from '@/types/daily-tasks';
import { PersonTaskGroup } from './PersonTaskGroup';
import type { TaskGroup, TaskHandlers } from './types';

interface TaskListContentProps {
  isLoading: boolean;
  tasksError: Error | null;
  tasks: DailyStandupTaskWithRelations[] | undefined;
  approvedTasks: DailyStandupTaskWithRelations[];
  pendingApprovalTasks: DailyStandupTaskWithRelations[];
  todayTasks: DailyStandupTaskWithRelations[];
  futureTasks: DailyStandupTaskWithRelations[];
  completedTasks: DailyStandupTaskWithRelations[];
  snoozedTasks: DailyStandupTaskWithRelations[];
  todayGroups: TaskGroup[];
  futureGroups: TaskGroup[];
  completedGroups: TaskGroup[];
  snoozedGroups: TaskGroup[];
  showCompleted: boolean;
  view: 'my' | 'all';
  isLeadership: boolean;
  taskHandlers: TaskHandlers;
  onViewChange: (view: 'my' | 'all') => void;
  onAddTask: () => void;
}

export function TaskListContent({
  isLoading,
  tasksError,
  tasks,
  approvedTasks,
  pendingApprovalTasks,
  todayTasks,
  futureTasks,
  completedTasks,
  snoozedTasks,
  todayGroups,
  futureGroups,
  completedGroups,
  snoozedGroups,
  showCompleted,
  view,
  isLeadership,
  taskHandlers,
  onViewChange,
  onAddTask,
}: TaskListContentProps) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-32 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (tasksError) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <AlertTriangle className="h-12 w-12 mx-auto mb-4 text-red-400" />
          <p className="font-medium text-red-700 mb-1">Failed to load tasks</p>
          <p className="text-sm text-muted-foreground">
            {(tasksError as { message?: string })?.message || 'An unexpected error occurred'}
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!tasks || tasks.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <ListChecks className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
          <p className="text-muted-foreground">
            {view === 'my'
              ? 'No tasks assigned to you. Switch to "All Tasks" to see the full team view.'
              : 'No tasks yet today. Tasks will appear after the daily standup is processed.'}
          </p>
          <div className="flex items-center justify-center gap-2 mt-4">
            {view === 'my' && (
              <Button variant="outline" size="sm" onClick={() => onViewChange('all')}>
                <Users className="h-4 w-4 mr-2" />
                View All Tasks
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={onAddTask}>
              <Plus className="h-4 w-4 mr-2" />
              Add Manual Task
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (approvedTasks.length === 0 && pendingApprovalTasks.length > 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <ShieldCheck className="h-10 w-10 mx-auto mb-3 text-amber-400" />
          <p className="text-sm text-muted-foreground">
            All {pendingApprovalTasks.length} tasks are awaiting approval above.
            {isLeadership
              ? ' Approve them to move tasks to your active list.'
              : ' Ask a team lead to approve pending tasks.'}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Today & Overdue */}
      {todayTasks.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-foreground">Today & Overdue</h3>
            <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
              {todayTasks.length}
            </Badge>
          </div>
          {todayGroups.map((group) => (
            <PersonTaskGroup
              key={group.assigneeId || 'unassigned'}
              group={group}
              isLeadership={isLeadership}
              {...taskHandlers}
            />
          ))}
        </div>
      )}

      {/* Upcoming */}
      {futureTasks.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-foreground">Upcoming</h3>
            <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
              {futureTasks.length}
            </Badge>
          </div>
          {futureGroups.map((group) => (
            <PersonTaskGroup
              key={group.assigneeId || 'unassigned'}
              group={group}
              isLeadership={isLeadership}
              {...taskHandlers}
            />
          ))}
        </div>
      )}

      {/* Snoozed */}
      {snoozedTasks.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <PauseCircle className="h-4 w-4 text-slate-500" />
            <h3 className="text-sm font-semibold text-foreground">Snoozed</h3>
            <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
              {snoozedTasks.length}
            </Badge>
          </div>
          {snoozedGroups.map((group) => (
            <PersonTaskGroup
              key={group.assigneeId || 'unassigned'}
              group={group}
              isLeadership={isLeadership}
              {...taskHandlers}
            />
          ))}
        </div>
      )}

      {/* Completed */}
      {showCompleted && completedTasks.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-foreground">Completed</h3>
            <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
              {completedTasks.length}
            </Badge>
          </div>
          {completedGroups.map((group) => (
            <PersonTaskGroup
              key={group.assigneeId || 'unassigned'}
              group={group}
              isLeadership={isLeadership}
              {...taskHandlers}
            />
          ))}
        </div>
      )}

      {/* Fallback: approved tasks exist but none match today/future/completed filters */}
      {todayTasks.length === 0 &&
        futureTasks.length === 0 &&
        snoozedTasks.length === 0 &&
        completedTasks.length === 0 && (
          <Card>
            <CardContent className="py-8 text-center">
              <ListChecks className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-50" />
              <p className="text-sm text-muted-foreground">
                {approvedTasks.length} task{approvedTasks.length !== 1 ? 's' : ''} found but none
                match the current filters. Try enabling "Show Completed" or adjusting filters.
              </p>
            </CardContent>
          </Card>
        )}
    </div>
  );
}
