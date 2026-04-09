import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertTriangle,
  ListChecks,
  Users,
  Plus,
  ShieldCheck,
  ChevronDown,
  ChevronRight,
  Clock,
  CalendarClock,
  CheckCircle2,
  PauseCircle,
} from 'lucide-react';
import type { DailyStandupTaskWithRelations } from '@/types/daily-tasks';
import { TaskCard } from '@/components/daily-tasks/TaskCard';
import { PersonTaskGroup } from './PersonTaskGroup';
import type { TaskGroup, TaskHandlers } from './types';

interface TaskListContentProps {
  isLoading: boolean;
  tasksError: Error | null;
  tasks: DailyStandupTaskWithRelations[] | undefined;
  approvedTasks: DailyStandupTaskWithRelations[];
  pendingApprovalTasks: DailyStandupTaskWithRelations[];
  overdueTasks: DailyStandupTaskWithRelations[];
  todayTasks: DailyStandupTaskWithRelations[];
  futureTasks: DailyStandupTaskWithRelations[];
  completedTasks: DailyStandupTaskWithRelations[];
  snoozedTasks: DailyStandupTaskWithRelations[];
  todayGroups: TaskGroup[];
  futureGroups: TaskGroup[];
  completedGroups: TaskGroup[];
  snoozedGroups: TaskGroup[];
  overdueGroups: TaskGroup[];
  showCompleted: boolean;
  view: 'my' | 'all';
  isLeadership: boolean;
  taskHandlers: TaskHandlers;
  onViewChange: (view: 'my' | 'all') => void;
  onAddTask: () => void;
}

function CollapsibleSection({
  title,
  icon: Icon,
  count,
  children,
  defaultOpen = true,
  variant = 'default',
}: {
  title: string;
  icon: React.ElementType;
  count: number;
  children: React.ReactNode;
  defaultOpen?: boolean;
  variant?: 'default' | 'danger' | 'muted';
}) {
  const [open, setOpen] = useState(defaultOpen);

  const iconColor =
    variant === 'danger'
      ? 'text-red-600'
      : variant === 'muted'
        ? 'text-muted-foreground'
        : 'text-foreground';

  const badgeClass =
    variant === 'danger'
      ? 'bg-red-100 text-red-700 border-red-200'
      : '';

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 w-full text-left py-1 group"
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
        )}
        <Icon className={`h-4 w-4 ${iconColor}`} />
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <Badge
          variant="outline"
          className={`h-5 px-1.5 text-[10px] ${badgeClass}`}
        >
          {count}
        </Badge>
      </button>
      {open && <div className="mt-2 space-y-1.5">{children}</div>}
    </div>
  );
}

/** Flat task list (no person grouping) — used for "My Tasks" view */
function FlatTaskList({
  tasks,
  isLeadership,
  taskHandlers,
}: {
  tasks: DailyStandupTaskWithRelations[];
  isLeadership: boolean;
  taskHandlers: TaskHandlers;
}) {
  return (
    <>
      {tasks.map((task) => (
        <TaskCard
          key={task.id}
          task={task}
          isLeadership={isLeadership}
          onEdit={taskHandlers.onEdit}
          onReassign={taskHandlers.onReassign}
          onPin={taskHandlers.onPin}
          onDelete={taskHandlers.onDelete}
        />
      ))}
    </>
  );
}

/** Grouped task list (by person) — used for "All Tasks" view */
function GroupedTaskList({
  groups,
  isLeadership,
  taskHandlers,
}: {
  groups: TaskGroup[];
  isLeadership: boolean;
  taskHandlers: TaskHandlers;
}) {
  return (
    <>
      {groups.map((group) => (
        <PersonTaskGroup
          key={group.assigneeId || 'unassigned'}
          group={group}
          isLeadership={isLeadership}
          {...taskHandlers}
        />
      ))}
    </>
  );
}

export function TaskListContent({
  isLoading,
  tasksError,
  tasks,
  approvedTasks,
  pendingApprovalTasks,
  overdueTasks,
  todayTasks,
  futureTasks,
  completedTasks,
  snoozedTasks,
  todayGroups,
  futureGroups,
  completedGroups,
  snoozedGroups,
  overdueGroups,
  showCompleted,
  view,
  isLeadership,
  taskHandlers,
  onViewChange,
  onAddTask,
}: TaskListContentProps) {
  const isMyView = view === 'my';

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-12 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (tasksError) {
    return (
      <Card>
        <CardContent className="py-10 text-center">
          <AlertTriangle className="h-10 w-10 mx-auto mb-3 text-red-400" />
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
        <CardContent className="py-10 text-center">
          <ListChecks className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-50" />
          <p className="text-muted-foreground text-sm">
            {isMyView
              ? 'No tasks assigned to you yet.'
              : 'No tasks yet. Tasks appear after standups are processed.'}
          </p>
          <div className="flex items-center justify-center gap-2 mt-4">
            {isMyView && (
              <Button variant="outline" size="sm" onClick={() => onViewChange('all')}>
                <Users className="h-4 w-4 mr-2" />
                View All Tasks
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={onAddTask}>
              <Plus className="h-4 w-4 mr-2" />
              Add Task
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
            All {pendingApprovalTasks.length} tasks are awaiting approval.
            {isLeadership
              ? ' Approve them above to start working.'
              : ' Ask a team lead to approve pending tasks.'}
          </p>
        </CardContent>
      </Card>
    );
  }

  const hasNoVisibleTasks =
    overdueTasks.length === 0 &&
    todayTasks.length === 0 &&
    futureTasks.length === 0 &&
    snoozedTasks.length === 0 &&
    completedTasks.length === 0;

  if (hasNoVisibleTasks) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <CheckCircle2 className="h-10 w-10 mx-auto mb-3 text-green-500" />
          <p className="text-sm font-medium text-green-700">All caught up!</p>
          <p className="text-xs text-muted-foreground mt-1">
            No open tasks. Toggle "Show done" to see completed tasks.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      {/* Overdue — always at the top, prominent */}
      {overdueTasks.length > 0 && (
        <CollapsibleSection
          title="Overdue"
          icon={AlertTriangle}
          count={overdueTasks.length}
          variant="danger"
        >
          {isMyView ? (
            <FlatTaskList
              tasks={overdueTasks}
              isLeadership={isLeadership}
              taskHandlers={taskHandlers}
            />
          ) : (
            <GroupedTaskList
              groups={overdueGroups}
              isLeadership={isLeadership}
              taskHandlers={taskHandlers}
            />
          )}
        </CollapsibleSection>
      )}

      {/* Today */}
      {todayTasks.length > 0 && (
        <CollapsibleSection title="Today" icon={Clock} count={todayTasks.length}>
          {isMyView ? (
            <FlatTaskList
              tasks={todayTasks}
              isLeadership={isLeadership}
              taskHandlers={taskHandlers}
            />
          ) : (
            <GroupedTaskList
              groups={todayGroups}
              isLeadership={isLeadership}
              taskHandlers={taskHandlers}
            />
          )}
        </CollapsibleSection>
      )}

      {/* Upcoming */}
      {futureTasks.length > 0 && (
        <CollapsibleSection
          title="Upcoming"
          icon={CalendarClock}
          count={futureTasks.length}
          defaultOpen={todayTasks.length === 0 && overdueTasks.length === 0}
        >
          {isMyView ? (
            <FlatTaskList
              tasks={futureTasks}
              isLeadership={isLeadership}
              taskHandlers={taskHandlers}
            />
          ) : (
            <GroupedTaskList
              groups={futureGroups}
              isLeadership={isLeadership}
              taskHandlers={taskHandlers}
            />
          )}
        </CollapsibleSection>
      )}

      {/* Snoozed */}
      {snoozedTasks.length > 0 && (
        <CollapsibleSection
          title="Snoozed"
          icon={PauseCircle}
          count={snoozedTasks.length}
          defaultOpen={false}
          variant="muted"
        >
          {isMyView ? (
            <FlatTaskList
              tasks={snoozedTasks}
              isLeadership={isLeadership}
              taskHandlers={taskHandlers}
            />
          ) : (
            <GroupedTaskList
              groups={snoozedGroups}
              isLeadership={isLeadership}
              taskHandlers={taskHandlers}
            />
          )}
        </CollapsibleSection>
      )}

      {/* Completed */}
      {showCompleted && completedTasks.length > 0 && (
        <CollapsibleSection
          title="Completed"
          icon={CheckCircle2}
          count={completedTasks.length}
          defaultOpen={false}
          variant="muted"
        >
          {isMyView ? (
            <FlatTaskList
              tasks={completedTasks}
              isLeadership={isLeadership}
              taskHandlers={taskHandlers}
            />
          ) : (
            <GroupedTaskList
              groups={completedGroups}
              isLeadership={isLeadership}
              taskHandlers={taskHandlers}
            />
          )}
        </CollapsibleSection>
      )}
    </div>
  );
}
